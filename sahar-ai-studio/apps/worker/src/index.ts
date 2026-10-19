import { prisma } from '@sahar/db';
import {
  MAINTENANCE_JOBS,
  QUEUE_NAMES,
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_TTL_SECONDS,
} from '@sahar/shared';
import { getServerEnv } from '@sahar/shared/env';
import { createLogger } from '@sahar/shared/logger';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { connectionFromUrl } from './connection';
import { purgeExpiredSessions } from './jobs/purge-expired-sessions';

const env = getServerEnv();
const log = createLogger('worker', env.LOG_LEVEL);
const connection = connectionFromUrl(env.REDIS_URL);

const maintenanceQueue = new Queue(QUEUE_NAMES.maintenance, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

const maintenanceWorker = new Worker(
  QUEUE_NAMES.maintenance,
  async (job) => {
    switch (job.name) {
      case MAINTENANCE_JOBS.purgeExpiredSessions: {
        const deleted = await purgeExpiredSessions(prisma);
        log.info({ jobId: job.id, deleted }, 'purged expired sessions');
        return { deleted };
      }
      default:
        throw new Error(`Unknown maintenance job: ${job.name}`);
    }
  },
  { connection, concurrency: 1 },
);

maintenanceWorker.on('failed', (job, error) =>
  log.error(
    { jobId: job?.id, name: job?.name, attempts: job?.attemptsMade, err: error },
    'job failed',
  ),
);
maintenanceWorker.on('error', (error) => log.error({ err: error }, 'worker error'));

// Liveness signal read by the web dashboard.
const heartbeatRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
heartbeatRedis.on('error', (error) => log.warn({ err: error.message }, 'heartbeat redis error'));
async function beat() {
  try {
    await heartbeatRedis.set(
      WORKER_HEARTBEAT_KEY,
      new Date().toISOString(),
      'EX',
      WORKER_HEARTBEAT_TTL_SECONDS,
    );
  } catch (error) {
    log.warn({ err: error }, 'failed to write heartbeat');
  }
}

async function start() {
  // Idempotent: upserting the scheduler keeps exactly one repeatable job across restarts.
  await maintenanceQueue.upsertJobScheduler(
    'purge-expired-sessions-hourly',
    { pattern: '0 * * * *' },
    { name: MAINTENANCE_JOBS.purgeExpiredSessions },
  );
  await beat();
  log.info({ queues: [QUEUE_NAMES.maintenance] }, 'worker started');
}

const heartbeatTimer = setInterval(() => void beat(), WORKER_HEARTBEAT_INTERVAL_MS);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, 'worker shutting down');
  clearInterval(heartbeatTimer);
  // Let the in-flight job finish before closing connections.
  await maintenanceWorker.close();
  await maintenanceQueue.close();
  await heartbeatRedis.del(WORKER_HEARTBEAT_KEY).catch(() => undefined);
  heartbeatRedis.disconnect();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

start().catch((error: unknown) => {
  log.fatal({ err: error }, 'worker failed to start');
  process.exit(1);
});
