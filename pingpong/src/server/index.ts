import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startGameServer } from './server';

const here = path.dirname(fileURLToPath(import.meta.url));
// Works both from source (src/server) and from the bundle (dist/server).
const staticDir = process.env.STATIC_DIR ?? path.resolve(here, '../../dist/client');
const env = process.env;
const tls = env.TLS_CERT_FILE && env.TLS_KEY_FILE ? { cert: env.TLS_CERT_FILE, key: env.TLS_KEY_FILE } : undefined;

const server = await startGameServer({
  port: Number(env.PORT ?? 8080),
  host: env.HOST ?? '0.0.0.0',
  staticDir,
  allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
  maxRooms: Number(env.MAX_ROOMS ?? 500),
  tls,
  log: (...a) => console.log(new Date().toISOString(), ...a),
});
console.log(`Ping Pong 3D server listening on ${tls ? 'https/wss' : 'http/ws'}://${env.HOST ?? '0.0.0.0'}:${server.port} (static: ${staticDir})`);

const shutdown = () => {
  console.log('Shutting down...');
  server.close().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
