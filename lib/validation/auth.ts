import { z } from 'zod';
import { emailSchema, passwordSchema, phoneSchema } from './common';

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(2, 'שם מלא חסר').max(120),
  phone: phoneSchema.optional(),
  /** Admins are never created through the public signup path. */
  role: z.enum(['customer', 'provider']).default('customer'),
  acceptTerms: z.literal(true, { message: 'יש לאשר את תנאי השימוש' }),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'סיסמה חסרה'),
});

export const requestOtpSchema = z.object({
  phone: phoneSchema,
  role: z.enum(['customer', 'provider']).default('customer'),
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  token: z.string().trim().regex(/^\d{6}$/, 'קוד בן 6 ספרות'),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional(),
  avatarUrl: z.string().trim().max(500).nullable().optional(),
  locale: z.enum(['he', 'en', 'ar', 'ru']).optional(),
  defaultAddress: z.string().trim().max(300).nullable().optional(),
  defaultLat: z.number().min(-90).max(90).nullable().optional(),
  defaultLng: z.number().min(-180).max(180).nullable().optional(),
});
