import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { getCurrentUser } from '../auth/session';
import { DEFAULT_LOCALE, getDictionary, isLocale, LOCALE_COOKIE, type AppLocale } from './config';

/** Locale precedence: signed-in user's preference → cookie → Hebrew. */
export const getLocale = cache(async (): Promise<AppLocale> => {
  const user = await getCurrentUser();
  if (user && isLocale(user.locale)) return user.locale;
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
});

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
