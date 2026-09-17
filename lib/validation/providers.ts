import { z } from 'zod';
import { latitudeSchema, longitudeSchema, phoneSchema, priceSchema, uuidSchema } from './common';

export const availabilitySchema = z.object({
  isAvailable: z.boolean(),
  availableUntil: z.string().datetime().nullable().optional(),
});

export const locationUpdateSchema = z.object({
  lat: latitudeSchema,
  lng: longitudeSchema,
  accuracyM: z.number().min(0).max(10000).optional(),
  heading: z.number().min(0).max(360).optional(),
});

export const serviceAreaSchema = z.object({
  label: z.string().trim().min(2, 'שם אזור חסר').max(80),
  centerLat: latitudeSchema,
  centerLng: longitudeSchema,
  radiusKm: z.number().positive('רדיוס חייב להיות חיובי').max(300, 'רדיוס גדול מדי'),
});

export const updateProviderProfileSchema = z.object({
  businessName: z.string().trim().min(2, 'שם עסק חסר').max(120).optional(),
  ownerName: z.string().trim().min(2, 'שם בעל העסק חסר').max(120).optional(),
  phone: phoneSchema.optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  yearsExperience: z.number().int().min(0).max(70).optional(),
  basePrice: priceSchema.nullable().optional(),
  avatarUrl: z.string().trim().max(500).nullable().optional(),
  logoUrl: z.string().trim().max(500).nullable().optional(),
  categoryIds: z.array(uuidSchema).max(10, 'אפשר לבחור עד 10 תחומים').optional(),
  serviceIds: z.array(uuidSchema).max(60).optional(),
  serviceAreas: z.array(serviceAreaSchema).max(10, 'אפשר להגדיר עד 10 אזורי שירות').optional(),
  onboardingStep: z.number().int().min(0).max(9).optional(),
  acceptTerms: z.boolean().optional(),
});

export const submitOnboardingSchema = z.object({
  acceptTerms: z.literal(true, { message: 'יש לאשר את התנאים' }),
});

export const providerDocumentSchema = z.object({
  docType: z.enum([
    'identity',
    'professional_license',
    'certificate',
    'insurance',
    'business_registration',
    'other',
  ]),
  storagePath: z.string().trim().min(1).max(500),
  fileName: z.string().trim().max(200).optional(),
  expiresAt: z.string().date().nullable().optional(),
});

export const searchProvidersSchema = z.object({
  categoryId: uuidSchema.optional(),
  q: z.string().trim().max(120).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  maxDistanceKm: z.coerce.number().positive().max(200).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  maxPrice: z.coerce.number().positive().optional(),
  availableOnly: z.coerce.boolean().optional(),
  verifiedOnly: z.coerce.boolean().optional(),
  sort: z
    .enum(['recommended', 'distance', 'rating', 'price', 'response_time'])
    .default('recommended'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
