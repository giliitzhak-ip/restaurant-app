import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@sahar/shared';
import { z } from 'zod';

/** Error codes map to dictionary keys under auth.errors. */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'invalidEmail' })),
  password: z.string().min(1, { error: 'invalidCredentials' }).max(PASSWORD_MAX_LENGTH, {
    error: 'invalidCredentials',
  }),
  next: z.string().optional(),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, { error: 'nameRequired' }).max(100, { error: 'nameRequired' }),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, { error: 'invalidEmail' })
      .pipe(z.email({ error: 'invalidEmail' })),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, { error: 'passwordLength' })
      .max(PASSWORD_MAX_LENGTH, { error: 'passwordLength' }),
    confirmPassword: z.string(),
    acceptTerms: z.literal('on', { error: 'termsRequired' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'passwordMismatch',
    path: ['confirmPassword'],
  });

export type AuthErrorCode =
  | 'invalidCredentials'
  | 'rateLimited'
  | 'emailTaken'
  | 'registrationDisabled'
  | 'invalidEmail'
  | 'nameRequired'
  | 'passwordLength'
  | 'passwordMismatch'
  | 'termsRequired';

/** Only same-origin relative paths are accepted as post-login redirect targets. */
export function safeRedirectPath(value: string | undefined | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\'))
    return '/';
  if (/[\r\n]/.test(value)) return '/';
  return value;
}
