'use server';

import { Prisma, prisma } from '@sahar/db';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, TERMS_VERSION } from '@sahar/shared';
import { redirect } from 'next/navigation';
import { audit } from '../audit';
import { getServerEnv } from '../env';
import { format, type Dictionary } from '../i18n/config';
import { getI18n } from '../i18n/server';
import { logger } from '../logger';
import { authRateLimits, consumeRateLimit, type RateLimitRule } from '../rate-limit';
import { getRedis } from '../redis';
import { getRequestMeta } from '../request';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password';
import { endSession, getCurrentUser, startSession } from './session';
import { loginSchema, registerSchema, safeRedirectPath, type AuthErrorCode } from './validation';

export interface AuthFormState {
  error?: string;
  fieldErrors?: Partial<
    Record<'name' | 'email' | 'password' | 'confirmPassword' | 'acceptTerms', string>
  >;
  values?: { name?: string; email?: string };
}

function message(t: Dictionary, code: AuthErrorCode, retryAfterMs = 0): string {
  const template = t.auth.errors[code];
  return format(template, {
    min: PASSWORD_MIN_LENGTH,
    max: PASSWORD_MAX_LENGTH,
    minutes: Math.max(1, Math.ceil(retryAfterMs / 60_000)),
  });
}

class RateLimitedError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('rate limited');
  }
}

/** Throws RateLimitedError if any rule is exhausted. Redis errors propagate (fail closed). */
async function enforceRateLimits(checks: [RateLimitRule, string][]) {
  const redis = getRedis();
  for (const [rule, identifier] of checks) {
    const result = await consumeRateLimit(redis, rule, identifier);
    if (!result.allowed) throw new RateLimitedError(result.retryAfterMs);
  }
}

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { t } = await getI18n();
  const meta = await getRequestMeta();
  const parsed = loginSchema.safeParse({
    email: field(formData, 'email'),
    password: field(formData, 'password'),
    next: field(formData, 'next'),
  });
  const email = field(formData, 'email')?.trim() ?? '';
  if (!parsed.success) {
    return { error: message(t, 'invalidCredentials'), values: { email } };
  }

  const limits = authRateLimits(getServerEnv());
  try {
    await enforceRateLimits([
      [limits.loginPerIp, meta.ipAddress],
      [limits.loginPerEmail, parsed.data.email],
    ]);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      await audit({
        action: 'auth.login.rate_limited',
        ipAddress: meta.ipAddress,
        metadata: { email: parsed.data.email },
      });
      return { error: message(t, 'rateLimited', error.retryAfterMs), values: { email } };
    }
    logger.error({ err: error }, 'rate limiter unavailable during login');
    return { error: t.common.serviceUnavailable, values: { email } };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  });
  const valid = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : await verifyAgainstDummy(parsed.data.password);

  if (!user || !valid) {
    await audit({
      action: 'auth.login.failure',
      userId: user?.id ?? null,
      ipAddress: meta.ipAddress,
      metadata: { email: parsed.data.email },
    });
    return { error: message(t, 'invalidCredentials'), values: { email } };
  }

  await startSession(user.id, meta);
  await audit({ action: 'auth.login.success', userId: user.id, ipAddress: meta.ipAddress });
  redirect(safeRedirectPath(parsed.data.next));
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { t, locale } = await getI18n();
  const meta = await getRequestMeta();
  const values = { name: field(formData, 'name') ?? '', email: field(formData, 'email') ?? '' };

  if (!getServerEnv().ALLOW_REGISTRATION) {
    return { error: message(t, 'registrationDisabled'), values };
  }

  const parsed = registerSchema.safeParse({
    name: field(formData, 'name'),
    email: field(formData, 'email'),
    password: field(formData, 'password'),
    confirmPassword: field(formData, 'confirmPassword'),
    acceptTerms: field(formData, 'acceptTerms'),
  });
  if (!parsed.success) {
    const fieldErrors: AuthFormState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<AuthFormState['fieldErrors']>;
      if (key && !fieldErrors[key]) fieldErrors[key] = message(t, issue.message as AuthErrorCode);
    }
    return { fieldErrors, values };
  }

  try {
    await enforceRateLimits([[authRateLimits(getServerEnv()).registerPerIp, meta.ipAddress]]);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { error: message(t, 'rateLimited', error.retryAfterMs), values };
    }
    logger.error({ err: error }, 'rate limiter unavailable during registration');
    return { error: t.common.serviceUnavailable, values };
  }

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash: await hashPassword(parsed.data.password),
        locale,
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
      },
      select: { id: true },
    });
    userId = user.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { fieldErrors: { email: message(t, 'emailTaken') }, values };
    }
    throw error;
  }

  await audit({
    action: 'auth.register',
    userId,
    ipAddress: meta.ipAddress,
    metadata: { termsVersion: TERMS_VERSION },
  });
  await startSession(userId, meta);
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const meta = await getRequestMeta();
  const user = await getCurrentUser();
  await endSession();
  if (user) await audit({ action: 'auth.logout', userId: user.id, ipAddress: meta.ipAddress });
  redirect('/login');
}
