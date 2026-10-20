import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined));

/**
 * Server-side environment. Shared by the web app and the worker.
 * Never import this module from client components.
 */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_URL: z.url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  ALLOW_REGISTRATION: booleanString.default(true),
  AUTH_LOGIN_MAX_PER_IP: z.coerce.number().int().min(1).default(30),
  AUTH_LOGIN_MAX_PER_EMAIL: z.coerce.number().int().min(1).default(8),
  AUTH_REGISTER_MAX_PER_IP: z.coerce.number().int().min(1).default(5),

  S3_ENDPOINT: optionalString,
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('sahar-media'),
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_FORCE_PATH_STYLE: booleanString.default(true),
  S3_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),

  MAX_AUDIO_UPLOAD_MB: z.coerce.number().int().min(1).max(2_000).default(100),
  MAX_IMAGE_UPLOAD_MB: z.coerce.number().int().min(1).max(200).default(15),

  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  /** Fonts for the labels burned into technical test renders (must support Hebrew). */
  MOCK_FONT_REGULAR: z.string().default('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
  MOCK_FONT_BOLD: z.string().default('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
  /** Renders are CPU-bound; raise only on machines with spare cores. */
  GENERATION_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(1),

  HEDRA_API_KEY: optionalString,
  FAL_KEY: optionalString,
  LOCAL_GPU_BASE_URL: optionalString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}

let cached: ServerEnv | undefined;

/** Lazily validated process environment (validation happens on first use, not at import). */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

/** For tests only. */
export function resetServerEnvCache(): void {
  cached = undefined;
}
