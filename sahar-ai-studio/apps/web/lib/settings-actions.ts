'use server';

import { prisma } from '@sahar/db';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from './audit';
import { getCurrentUser, requireUser } from './auth/session';
import { getServerEnv } from './env';
import { isLocale, LOCALE_COOKIE } from './i18n/config';
import { getI18n } from './i18n/server';
import { getRequestMeta } from './request';

/** Persists the interface language (cookie for everyone, user record when signed in). */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = formData.get('locale');
  if (!isLocale(locale)) return;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: getServerEnv().NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
  });

  const user = await getCurrentUser();
  if (user && user.locale !== locale) {
    await prisma.user.update({ where: { id: user.id }, data: { locale } });
    await audit({ action: 'settings.locale.update', userId: user.id, metadata: { locale } });
  }
  revalidatePath('/', 'layout');
}

export interface BudgetFormState {
  ok?: boolean;
  error?: string;
}

const budgetSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(
    z
      .string()
      .regex(/^\d{1,6}(\.\d{1,2})?$/)
      .refine((value) => Number(value) <= 100_000)
      .nullable(),
  );

export async function setBudgetAction(
  _prev: BudgetFormState,
  formData: FormData,
): Promise<BudgetFormState> {
  const user = await requireUser();
  const { t } = await getI18n();
  const raw = formData.get('monthlyBudgetUsd');
  const parsed = budgetSchema.safeParse(typeof raw === 'string' ? raw : '');
  if (!parsed.success) return { error: t.settings.budget.invalid };

  await prisma.user.update({
    where: { id: user.id },
    data: { monthlyBudgetUsd: parsed.data },
  });
  const meta = await getRequestMeta();
  await audit({
    action: 'settings.budget.update',
    userId: user.id,
    ipAddress: meta.ipAddress,
    metadata: { monthlyBudgetUsd: parsed.data },
  });
  revalidatePath('/settings');
  return { ok: true };
}
