import { describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/dictionaries/en';
import { he } from '@/lib/i18n/dictionaries/he';
import { format, getDirection, isLocale } from '@/lib/i18n/config';

function shape(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return [`${prefix}[]`];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      shape(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

function placeholders(value: unknown, prefix = ''): Record<string, string[]> {
  if (typeof value === 'string') return { [prefix]: (value.match(/\{\w+\}/g) ?? []).sort() };
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.assign(
      {},
      ...Object.entries(value).map(([key, child]) =>
        placeholders(child, prefix ? `${prefix}.${key}` : key),
      ),
    );
  }
  return {};
}

describe('dictionaries', () => {
  it('English has exactly the same keys as Hebrew', () => {
    expect(shape(en).sort()).toEqual(shape(he).sort());
  });

  it('uses the same placeholders in both languages', () => {
    expect(placeholders(en)).toEqual(placeholders(he));
  });

  it('has no empty strings', () => {
    const strings = JSON.stringify([he, en]).match(/""/g);
    expect(strings).toBeNull();
  });

  it('Hebrew UI strings are actually Hebrew', () => {
    expect(he.nav.dashboard).toMatch(/[֐-׿]/);
    expect(he.auth.loginButton).toMatch(/[֐-׿]/);
  });
});

describe('i18n helpers', () => {
  it('derives text direction', () => {
    expect(getDirection('he')).toBe('rtl');
    expect(getDirection('en')).toBe('ltr');
  });

  it('validates locales', () => {
    expect(isLocale('he')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it('formats placeholders and leaves unknown ones visible', () => {
    expect(format('שלום, {name}', { name: 'שרונה' })).toBe('שלום, שרונה');
    expect(format('{a} {b}', { a: 1 })).toBe('1 {b}');
  });
});
