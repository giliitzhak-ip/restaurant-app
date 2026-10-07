import { describe, expect, it } from 'vitest';
import { formatIsraeliPhone, normalizeIsraeliPhone, whatsappLink } from '../lib/phone';

describe('נרמול טלפון ישראלי', () => {
  it('נייד עם מקף', () => {
    expect(normalizeIsraeliPhone('050-1234567').e164).toBe('972501234567');
  });

  it('נייד עם רווחים', () => {
    expect(normalizeIsraeliPhone(' 052 765 4321 ').e164).toBe('972527654321');
  });

  it('קווי', () => {
    expect(normalizeIsraeliPhone('03-6123456').e164).toBe('97236123456');
  });

  it('קידומת בינלאומית בכל צורה', () => {
    expect(normalizeIsraeliPhone('+972501234567').e164).toBe('972501234567');
    expect(normalizeIsraeliPhone('00972501234567').e164).toBe('972501234567');
    expect(normalizeIsraeliPhone('972-50-1234567').e164).toBe('972501234567');
    expect(normalizeIsraeliPhone('+972 0 50 1234567').e164).toBe('972501234567');
  });

  it('מספר שאינו תקין אינו מומצא', () => {
    expect(normalizeIsraeliPhone('').e164).toBeNull();
    expect(normalizeIsraeliPhone('050-12').e164).toBeNull();
    expect(normalizeIsraeliPhone('1-800-123-456-789').e164).toBeNull();
    expect(normalizeIsraeliPhone('לא הוזן').e164).toBeNull();
  });

  it('מספר שנדחה מגיע עם נימוק בעברית', () => {
    expect(normalizeIsraeliPhone('050-12').reason).toContain('אורך');
    expect(normalizeIsraeliPhone('').reason).toContain('לא הוזן');
  });

  it('קישור WhatsApp נבנה רק ממספר תקין', () => {
    expect(whatsappLink('050-1234567', 'שלום')).toBe(
      'https://wa.me/972501234567?text=%D7%A9%D7%9C%D7%95%D7%9D',
    );
    expect(whatsappLink('', 'שלום')).toBeNull();
    expect(whatsappLink(undefined, 'שלום')).toBeNull();
  });

  it('תצוגה מקומית', () => {
    expect(formatIsraeliPhone('972501234567')).toBe('050-1234567');
    expect(formatIsraeliPhone('97236123456')).toBe('03-6123456');
    expect(formatIsraeliPhone('שטות')).toBe('שטות');
  });
});
