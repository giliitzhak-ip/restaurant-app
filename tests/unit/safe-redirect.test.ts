import { describe, expect, it } from 'vitest';
import {
  defaultPathForRole,
  redirectPathForRole,
  safeInternalPath,
} from '@/lib/safe-redirect';

/**
 * The `?next=` parameter, which anybody can set.
 *
 * Two failures are being tested for, and they are not the same failure. One
 * is an open redirect — our sign-in page carrying our credibility to
 * somebody else's phishing form. The other is a destination that exists but
 * does not belong to the role that just signed in, which is a product bug
 * rather than a security one and is just as visible to the person it happens
 * to.
 */
describe('safeInternalPath', () => {
  it('accepts an internal path, query string and all', () => {
    expect(safeInternalPath('/request')).toBe('/request');
    expect(safeInternalPath('/jobs/2f9c1e6a-0000-4000-8000-000000000001')).toBe(
      '/jobs/2f9c1e6a-0000-4000-8000-000000000001',
    );
    // The shape the request flow actually produces: Hebrew, percent-encoded.
    expect(safeInternalPath('/request?q=%D7%A0%D7%96%D7%99%D7%9C%D7%94&timing=NOW')).toBe(
      '/request?q=%D7%A0%D7%96%D7%99%D7%9C%D7%94&timing=NOW',
    );
  });

  it('refuses an absolute URL', () => {
    expect(safeInternalPath('https://evil.example/login')).toBeNull();
    expect(safeInternalPath('http://evil.example')).toBeNull();
    // Our own origin spelled as a URL is still refused: accepting it means
    // accepting a host comparison, and host comparisons are where this class
    // of bug lives.
    expect(safeInternalPath('https://getservice.co.il/provider')).toBeNull();
  });

  it('refuses a protocol-relative path', () => {
    // The browser reads `//evil.example` as a HOST. This is the bypass that
    // every naive `startsWith('/')` check ships with.
    expect(safeInternalPath('//evil.example')).toBeNull();
    expect(safeInternalPath('//evil.example/provider')).toBeNull();
    expect(safeInternalPath('/%2F%2Fevil.example')).toBeNull();
  });

  it('refuses a backslash', () => {
    expect(safeInternalPath('/\\evil.example')).toBeNull();
    expect(safeInternalPath('\\\\evil.example')).toBeNull();
    expect(safeInternalPath('/provider\\..\\admin')).toBeNull();
    expect(safeInternalPath('/%5Cevil.example')).toBeNull();
  });

  it('refuses javascript: and other schemes', () => {
    expect(safeInternalPath('javascript:alert(1)')).toBeNull();
    expect(safeInternalPath('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeInternalPath('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('refuses control characters, which are how a scheme gets smuggled past a filter', () => {
    expect(safeInternalPath('/java\nscript:alert(1)')).toBeNull();
    expect(safeInternalPath('\n//evil.example')).toBeNull();
    expect(safeInternalPath('/request\u0000')).toBeNull();
    expect(safeInternalPath('/request\t')).toBeNull();
  });

  it('refuses a traversal segment, which would defeat the prefix check', () => {
    expect(safeInternalPath('/provider/../admin')).toBeNull();
  });

  it('refuses what is absent, empty or absurdly long', () => {
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
    expect(safeInternalPath('')).toBeNull();
    expect(safeInternalPath('/request')).not.toBeNull();
    expect(safeInternalPath(`/${'a'.repeat(4000)}`)).toBeNull();
  });
});

describe('redirectPathForRole', () => {
  it('sends each role to its own default when there is no destination', () => {
    expect(redirectPathForRole(null, 'customer')).toBe('/');
    expect(redirectPathForRole(null, 'provider')).toBe('/provider');
    expect(redirectPathForRole(null, 'admin')).toBe('/admin');
    expect(defaultPathForRole('provider')).toBe('/provider');
  });

  it('honours a destination that fits the role', () => {
    expect(redirectPathForRole('/request?q=abc', 'customer')).toBe('/request?q=abc');
    expect(redirectPathForRole('/jobs/abc', 'customer')).toBe('/jobs/abc');
    expect(redirectPathForRole('/provider/availability', 'provider')).toBe(
      '/provider/availability',
    );
    expect(redirectPathForRole('/matching-lab', 'admin')).toBe('/matching-lab');
  });

  it('refuses a customer aimed at an admin screen', () => {
    // Not an escalation — /admin re-checks on the server. It is a customer
    // landing on a screen that will turn them away, which reads as broken.
    expect(redirectPathForRole('/admin', 'customer')).toBe('/');
    expect(redirectPathForRole('/admin/providers', 'customer')).toBe('/');
    expect(redirectPathForRole('/matching-lab', 'customer')).toBe('/');
  });

  it('refuses a provider aimed at the job-request screen', () => {
    // A provider has no customer profile, so /request would classify a
    // problem and then fail at the point of creating the job.
    expect(redirectPathForRole('/request?q=abc', 'provider')).toBe('/provider');
    expect(redirectPathForRole('/', 'provider')).toBe('/provider');
  });

  it('falls back rather than throwing on an off-site destination', () => {
    expect(redirectPathForRole('https://evil.example', 'customer')).toBe('/');
    expect(redirectPathForRole('//evil.example', 'provider')).toBe('/provider');
    expect(redirectPathForRole('javascript:alert(1)', 'admin')).toBe('/admin');
  });

  it('uses the caller-supplied fallback, for the provider who just registered', () => {
    expect(redirectPathForRole(null, 'provider', '/provider/onboarding')).toBe(
      '/provider/onboarding',
    );
    // A hostile `next` must not be able to steer them away from setup either.
    expect(redirectPathForRole('https://evil.example', 'provider', '/provider/onboarding')).toBe(
      '/provider/onboarding',
    );
  });

  it('does not let a prefix match on a string boundary', () => {
    // `/providers-are-evil.example` starts with `/provider` as a STRING but
    // is not beneath it as a PATH.
    expect(redirectPathForRole('/provider-signup-scam', 'provider')).toBe('/provider');
    expect(redirectPathForRole('/adminish', 'admin')).toBe('/admin');
  });
});
