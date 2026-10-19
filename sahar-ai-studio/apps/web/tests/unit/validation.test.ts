import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema, safeRedirectPath } from '@/lib/auth/validation';

const validRegistration = {
  name: 'שרונה',
  email: '  Sharona@Example.COM ',
  password: 'long-enough-pw',
  confirmPassword: 'long-enough-pw',
  acceptTerms: 'on',
};

describe('registerSchema', () => {
  it('normalizes email to trimmed lower case', () => {
    const result = registerSchema.parse(validRegistration);
    expect(result.email).toBe('sharona@example.com');
    expect(result.name).toBe('שרונה');
  });

  it('maps each problem to a dictionary error code', () => {
    const result = registerSchema.safeParse({
      name: ' ',
      email: 'not-an-email',
      password: 'short',
      confirmPassword: 'different',
    });
    expect(result.success).toBe(false);
    const codes = Object.fromEntries(
      result.error!.issues.map((issue) => [issue.path[0], issue.message]),
    );
    expect(codes).toMatchObject({
      name: 'nameRequired',
      email: 'invalidEmail',
      password: 'passwordLength',
      acceptTerms: 'termsRequired',
    });
  });

  it('requires matching passwords', () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      confirmPassword: 'other-password',
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]).toMatchObject({
      path: ['confirmPassword'],
      message: 'passwordMismatch',
    });
  });
});

describe('loginSchema', () => {
  it('accepts a normal login', () => {
    expect(loginSchema.parse({ email: 'A@B.co', password: 'x' }).email).toBe('a@b.co');
  });
});

describe('safeRedirectPath', () => {
  it('keeps same-origin paths', () => {
    expect(safeRedirectPath('/settings')).toBe('/settings');
    expect(safeRedirectPath('/projects?tab=1')).toBe('/projects?tab=1');
  });

  it('blocks open redirects', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/a\r\nSet-Cookie: x',
      '',
      null,
      undefined,
    ]) {
      expect(safeRedirectPath(value)).toBe('/');
    }
  });
});
