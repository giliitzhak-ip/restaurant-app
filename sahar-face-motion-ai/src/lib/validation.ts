import { z } from "zod";

export const emailSchema = z
  .string({ required_error: "יש להזין כתובת אימייל" })
  .trim()
  .toLowerCase()
  .email("כתובת האימייל אינה תקינה")
  .max(254, "כתובת האימייל ארוכה מדי");

export const passwordSchema = z
  .string({ required_error: "יש להזין סיסמה" })
  .min(10, "הסיסמה חייבת לכלול לפחות 10 תווים")
  .max(128, "הסיסמה ארוכה מדי")
  .refine((p) => /[A-Za-z֐-׿]/.test(p) && /\d/.test(p), "הסיסמה חייבת לכלול אותיות וספרות");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "יש להזין שם (לפחות 2 תווים)").max(80, "השם ארוך מדי"),
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "יש לאשר את תנאי השימוש ומדיניות ההסכמה כדי להירשם" }),
  }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "יש להזין סיסמה").max(128),
});

/** First human-readable (Hebrew) error message from a Zod error. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "הנתונים שנשלחו אינם תקינים";
}
