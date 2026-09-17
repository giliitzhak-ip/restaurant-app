import { z } from 'zod';
import { uuidSchema } from './common';
import { SETTINGS_SCHEMAS } from '@/lib/services/settings/schema';

export const verifyProviderSchema = z.object({
  status: z.enum(['verified', 'rejected', 'suspended', 'pending']),
  reason: z.string().trim().max(500).optional(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'blocked']),
  reason: z.string().trim().max(500).optional(),
});

export const moderateReviewSchema = z.object({
  isHidden: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export const resolveDisputeSchema = z.object({
  status: z.enum(['under_review', 'resolved', 'rejected']),
  resolution: z.string().trim().max(2000).optional(),
});

export const categoryInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'מזהה חייב להיות באנגלית קטנה עם מקפים'),
  name: z.string().trim().min(2).max(80),
  nameEn: z.string().trim().max(80).nullable().optional(),
  icon: z.string().trim().min(1).max(60).default('wrench'),
  description: z.string().trim().max(300).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

export const serviceInputSchema = z.object({
  categoryId: uuidSchema,
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'מזהה חייב להיות באנגלית קטנה עם מקפים'),
  name: z.string().trim().min(2).max(80),
  nameEn: z.string().trim().max(80).nullable().optional(),
  basePrice: z.number().positive().nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

export const reorderCategoriesSchema = z.object({
  order: z.array(z.object({ id: uuidSchema, sortOrder: z.number().int().min(0) })).min(1),
});

const settingKeySchema = z.enum(
  Object.keys(SETTINGS_SCHEMAS) as [keyof typeof SETTINGS_SCHEMAS, ...Array<keyof typeof SETTINGS_SCHEMAS>],
);

export const updateSettingSchema = z.object({
  key: settingKeySchema,
  value: z.unknown(),
});

export const adminListSchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(['customer', 'provider', 'admin']).optional(),
  status: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
