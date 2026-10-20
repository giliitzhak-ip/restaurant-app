import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The single .env file lives at the monorepo root (shared with the worker and Prisma).
// Variables already set in the real environment take precedence; containers need no file.
const rootEnvFile = path.join(monorepoRoot, '.env');
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // E2E builds use their own directory so they never overwrite a running dev server's.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: monorepoRoot,
  poweredByHeader: false,
  // Linting runs once for the whole monorepo (`pnpm lint`), not again inside `next build`.
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  transpilePackages: ['@sahar/shared', '@sahar/db'],
  serverExternalPackages: [
    'pino',
    'ioredis',
    'bullmq',
    '@aws-sdk/client-s3',
    '@aws-sdk/lib-storage',
  ],
  experimental: {
    serverActions: { bodySizeLimit: '1mb' },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
