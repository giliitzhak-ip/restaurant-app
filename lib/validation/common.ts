import { z } from 'zod';

export const uuidSchema = z.string().uuid('מזהה לא תקין');

export const latitudeSchema = z
  .number({ message: 'קו רוחב חסר' })
  .min(-90, 'קו רוחב לא תקין')
  .max(90, 'קו רוחב לא תקין');

export const longitudeSchema = z
  .number({ message: 'קו אורך חסר' })
  .min(-180, 'קו אורך לא תקין')
  .max(180, 'קו אורך לא תקין');

/** Israeli mobile/landline, with or without country code. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+972|0)(5\d|[2-4]|[8-9]|7\d)\d{7}$/, 'מספר טלפון לא תקין');

export const emailSchema = z.string().trim().toLowerCase().email('כתובת אימייל לא תקינה');

export const passwordSchema = z
  .string()
  .min(8, 'הסיסמה חייבת להכיל לפחות 8 תווים')
  .max(72, 'הסיסמה ארוכה מדי');

export const priceSchema = z
  .number({ message: 'מחיר חסר' })
  .positive('המחיר חייב להיות חיובי')
  .max(1_000_000, 'המחיר גבוה מדי');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function rangeOf({ page, pageSize }: Pagination): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}
