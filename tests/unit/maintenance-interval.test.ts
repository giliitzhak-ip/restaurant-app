import { afterEach, describe, expect, it } from 'vitest';
import { maintenanceIntervalSeconds } from '@/domains/maintenance/scheduler';

/**
 * The clock's configuration.
 *
 * Worth its own test because every failure mode here is silent: a value that
 * parses to zero by accident stops offers expiring, and a value of 0.1 turns
 * the tick into a denial-of-service against the platform's own database.
 */
describe('maintenance interval', () => {
  const original = process.env.MAINTENANCE_INTERVAL_SECONDS;

  afterEach(() => {
    if (original === undefined) delete process.env.MAINTENANCE_INTERVAL_SECONDS;
    else process.env.MAINTENANCE_INTERVAL_SECONDS = original;
  });

  const withValue = (value: string | undefined) => {
    if (value === undefined) delete process.env.MAINTENANCE_INTERVAL_SECONDS;
    else process.env.MAINTENANCE_INTERVAL_SECONDS = value;
    return maintenanceIntervalSeconds();
  };

  it('defaults to 30 seconds, because offers expire in tens of seconds', () => {
    expect(withValue(undefined)).toBe(30);
  });

  it('0 means an external cron owns the clock', () => {
    expect(withValue('0')).toBe(0);
  });

  it('clamps a value that would hammer the database', () => {
    expect(withValue('1')).toBe(5);
    expect(withValue('0.5')).toBe(5);
  });

  it('clamps an interval so long the platform would look broken', () => {
    expect(withValue('99999')).toBe(3600);
  });

  it('falls back rather than silently disabling itself on nonsense', () => {
    // The dangerous case: Number('') is 0, and 0 means "off". An empty or
    // malformed variable must not be able to stop the clock by accident —
    // only an explicit 0 may do that.
    expect(withValue('')).toBe(30);
    expect(withValue('abc')).toBe(30);
    expect(withValue('-5')).toBe(30);
  });
});
