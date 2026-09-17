import { z } from 'zod';
import { latitudeSchema, longitudeSchema, priceSchema, uuidSchema } from './common';

export const jobUrgencySchema = z.enum(['now', 'today', 'tomorrow', 'scheduled']);

export const jobMediaSchema = z.object({
  storagePath: z.string().min(1).max(500),
  kind: z.enum(['image', 'video']).default('image'),
});

export const createJobSchema = z
  .object({
    categoryId: uuidSchema,
    serviceId: uuidSchema.nullable().optional(),
    title: z.string().trim().min(4, 'כותרת קצרה מדי').max(120, 'כותרת ארוכה מדי'),
    description: z
      .string()
      .trim()
      .min(10, 'תאר את העבודה בכמה מילים נוספות')
      .max(4000, 'התיאור ארוך מדי'),
    urgency: jobUrgencySchema.default('today'),
    scheduledFor: z.string().datetime({ message: 'תאריך לא תקין' }).nullable().optional(),
    address: z.string().trim().min(4, 'כתובת חסרה').max(300),
    addressNotes: z.string().trim().max(500).nullable().optional(),
    lat: latitudeSchema,
    lng: longitudeSchema,
    budgetMin: priceSchema.nullable().optional(),
    budgetMax: priceSchema.nullable().optional(),
    media: z.array(jobMediaSchema).max(12, 'אפשר לצרף עד 12 קבצים').default([]),
  })
  .refine(
    (value) => value.urgency !== 'scheduled' || Boolean(value.scheduledFor),
    { message: 'בחר מועד לביצוע', path: ['scheduledFor'] },
  )
  .refine(
    (value) =>
      value.budgetMin === null ||
      value.budgetMin === undefined ||
      value.budgetMax === null ||
      value.budgetMax === undefined ||
      value.budgetMax >= value.budgetMin,
    { message: 'התקציב המקסימלי חייב להיות גבוה מהמינימלי', path: ['budgetMax'] },
  )
  .refine(
    (value) =>
      !value.scheduledFor || new Date(value.scheduledFor).getTime() > Date.now() - 60_000,
    { message: 'המועד חייב להיות בעתיד', path: ['scheduledFor'] },
  );

export type CreateJobInput = z.infer<typeof createJobSchema>;

export const listJobsSchema = z.object({
  status: z
    .enum([
      'active',
      'completed',
      'cancelled',
      'all',
      'requested',
      'searching',
      'offers_received',
      'provider_selected',
      'provider_on_the_way',
      'arrived',
      'in_progress',
      'disputed',
    ])
    .default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * Status transitions the API accepts from a client, and who may request them.
 * Anything not listed here is rejected — the client cannot jump a job straight
 * to `completed` to dodge the payment step.
 */
export const jobStatusActionSchema = z.object({
  status: z.enum(['provider_on_the_way', 'arrived', 'in_progress', 'completed']),
  note: z.string().trim().max(500).optional(),
});

export const cancelJobSchema = z.object({
  reason: z.string().trim().min(3, 'פרט את סיבת הביטול').max(500),
});

export const completeJobSchema = z.object({
  finalPrice: priceSchema.optional(),
  note: z.string().trim().max(500).optional(),
});

export const createOfferSchema = z.object({
  price: priceSchema,
  etaMinutes: z
    .number({ message: 'זמן הגעה חסר' })
    .int('זמן הגעה חייב להיות מספר שלם')
    .min(1, 'זמן הגעה חייב להיות לפחות דקה')
    .max(10080, 'זמן הגעה ארוך מדי'),
  note: z.string().trim().max(500).optional(),
  validMinutes: z.number().int().min(5).max(10080).optional(),
});

export const declineJobSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});

export const createMessageSchema = z
  .object({
    body: z.string().trim().max(2000).optional(),
    storagePath: z.string().trim().max(500).optional(),
    messageType: z.enum(['text', 'image']).default('text'),
  })
  .refine(
    (value) =>
      value.messageType === 'image' ? Boolean(value.storagePath) : Boolean(value.body?.length),
    { message: 'ההודעה ריקה', path: ['body'] },
  );

export const createReviewSchema = z.object({
  rating: z.number().min(1, 'בחר דירוג').max(5),
  comment: z.string().trim().max(2000).optional(),
  criteria: z
    .object({
      professionalism: z.number().int().min(1).max(5).optional(),
      price: z.number().int().min(1).max(5).optional(),
      punctuality: z.number().int().min(1).max(5).optional(),
      service: z.number().int().min(1).max(5).optional(),
    })
    .default({}),
});

export const createDisputeSchema = z.object({
  reason: z.enum(['price', 'not_performed', 'damage', 'no_show', 'payment_issue', 'other']),
  description: z.string().trim().min(10, 'פרט את הבעיה').max(2000),
});

export const classifyJobSchema = z.object({
  text: z.string().trim().min(3, 'כתוב כמה מילים').max(2000),
});
