import { z } from 'zod'

/**
 * Environment contract. Everything optional has a safe development default so
 * the project boots without secrets; production values come from the host.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),

  STORAGE_PROVIDER: z.enum(['local', 's3', 'cloudinary']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('./storage/uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(10),

  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  PAYMENT_PROVIDER: z.string().default('sandbox'),
  SHIPPING_PROVIDER: z.string().default('sandbox'),
  EMAIL_PROVIDER: z.string().default('console'),

  NEXT_PUBLIC_SITE_URL: z.string().default('http://localhost:3000'),
})

export type Env = z.infer<typeof schema>

let cached: Env | null = null

export function getEnv(): Env {
  if (cached) return cached
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment configuration — ${issues}`)
  }
  cached = parsed.data
  return cached
}

export const isProduction = () => process.env.NODE_ENV === 'production'
