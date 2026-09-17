import pg from 'pg';
import { logOperation } from '@/lib/logger';

/**
 * Realtime transport (spec §24).
 *
 * The database emits NOTIFY on every change a client might be waiting for;
 * this hub holds ONE listening connection per server process and fans events
 * out to in-process subscribers.
 *
 * Two deliberate properties:
 *
 *  1. Payloads carry IDENTIFIERS ONLY, never row data. Clients react by
 *     re-reading the authoritative row through RLS. So realtime can never
 *     become a second source of truth (spec §22) and cannot leak a row the
 *     subscriber is not allowed to see.
 *
 *  2. A dropped connection is survivable by construction. Because every
 *     event only says "something about X changed", a client that missed
 *     events just refetches on reconnect and is immediately correct again
 *     (spec §44: "Realtime disconnects — reconnect and refresh authoritative
 *     state").
 */

export type RealtimeChannel =
  | 'gs_job_change'
  | 'gs_offer_change'
  | 'gs_provider_location'
  | 'gs_notification';

export const REALTIME_CHANNELS: readonly RealtimeChannel[] = [
  'gs_job_change',
  'gs_offer_change',
  'gs_provider_location',
  'gs_notification',
];

export interface RealtimeEvent {
  readonly channel: RealtimeChannel;
  readonly payload: Record<string, unknown>;
}

export type RealtimeListener = (event: RealtimeEvent) => void;

/** The transport boundary, so Supabase Realtime can replace LISTEN/NOTIFY. */
export interface RealtimeTransport {
  subscribe(listener: RealtimeListener): () => void;
  readonly connected: boolean;
}

class PostgresListenTransport implements RealtimeTransport {
  private client: pg.Client | null = null;
  private readonly listeners = new Set<RealtimeListener>();
  private connecting: Promise<void> | null = null;
  private reconnectDelayMs = 500;
  private stopped = false;

  get connected(): boolean {
    return this.client !== null;
  }

  subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    void this.ensureConnected();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async ensureConnected(): Promise<void> {
    if (this.client || this.connecting) return this.connecting ?? undefined;

    this.connecting = (async () => {
      // A dedicated connection: LISTEN is session state and must not be run
      // on a pooled client that other queries share.
      const client = new pg.Client({
        connectionString:
          process.env.DATABASE_URL ??
          'postgresql://getservice_app:getservice_app@127.0.0.1:5432/getservice',
      });

      client.on('notification', (message) => {
        if (!message.payload) return;
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(message.payload) as Record<string, unknown>;
        } catch {
          return;
        }
        const event: RealtimeEvent = {
          channel: message.channel as RealtimeChannel,
          payload,
        };
        for (const listener of this.listeners) {
          try {
            listener(event);
          } catch {
            // One bad subscriber must not stop delivery to the others.
          }
        }
      });

      client.on('error', (error) => {
        logOperation({
          operation: 'realtime.listen', result: 'error',
          meta: { message: error.message.slice(0, 200) },
        });
        this.handleDisconnect();
      });

      client.on('end', () => this.handleDisconnect());

      await client.connect();
      // LISTEN needs no elevated role; it is a pure notification channel.
      for (const channel of REALTIME_CHANNELS) {
        await client.query(`listen ${channel}`);
      }

      this.client = client;
      this.reconnectDelayMs = 500;
    })().finally(() => {
      this.connecting = null;
    });

    try {
      await this.connecting;
    } catch (error) {
      logOperation({
        operation: 'realtime.connect', result: 'error',
        meta: { message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
      });
      this.scheduleReconnect();
    }
  }

  private handleDisconnect(): void {
    this.client = null;
    if (!this.stopped && this.listeners.size > 0) this.scheduleReconnect();
  }

  /** Exponential backoff, capped, so a database restart is survivable. */
  private scheduleReconnect(): void {
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 15_000);
    setTimeout(() => {
      if (!this.stopped && this.listeners.size > 0) void this.ensureConnected();
    }, delay).unref?.();
  }

  async close(): Promise<void> {
    this.stopped = true;
    this.listeners.clear();
    const client = this.client;
    this.client = null;
    await client?.end().catch(() => {});
  }
}

declare global {
  var __getServiceRealtime: PostgresListenTransport | undefined;
}

export function getRealtimeTransport(): RealtimeTransport {
  globalThis.__getServiceRealtime ??= new PostgresListenTransport();
  return globalThis.__getServiceRealtime;
}

export async function closeRealtimeTransport(): Promise<void> {
  await globalThis.__getServiceRealtime?.close();
  globalThis.__getServiceRealtime = undefined;
}
