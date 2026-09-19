import { describe, expect, it } from 'vitest';
import { duplicateLogContent } from '@/features/archive/duplicate';
import { validateForCompletion } from '@/schema/pestLog';
import { validFoggingLog, validFumigationLog, validLogWithAssistant } from '../fixtures/sampleLog';

/**
 * שכפול יומן: מה שחוזר על עצמו נשמר, ומה שחייב להיקבע מחדש בכל ביצוע
 * נמחק — כדי שלא ייווצר יומן עם תאריך, חתימות או אצווה של ביקור קודם.
 */
describe('שכפול יומן קודם', () => {
  const source = {
    ...validLogWithAssistant(),
    meta: { serialNumber: 42, documentVersion: 1, completedAt: '2026-09-10T09:00:00.000Z' },
  } as unknown as Record<string, unknown>;

  const { content, clearedFields } = duplicateLogContent(source);

  it('מנקה תאריך ושעת ביצוע', () => {
    const execution = content.execution as Record<string, unknown>;
    expect(execution.performedDate).toBeUndefined();
    expect(execution.performedStartTime).toBeUndefined();
    expect(execution.timeZone).toBe('Asia/Jerusalem');
  });

  it('מנקה חתימות', () => {
    expect(content.signatures).toBeUndefined();
    const assistants = content.assistants as Array<Record<string, unknown>>;
    expect(assistants[0]!.signature).toBeUndefined();
  });

  it('מנקה נ״צ', () => {
    expect((content.location as Record<string, unknown>).coordinates).toBeUndefined();
  });

  it('מנקה מספר סידורי ומטא-נתונים של ההשלמה', () => {
    expect(content.meta).toBeUndefined();
  });

  it('מנקה אצווה ומינון בכל תכשיר, אך שומר את שאר פרטי התכשיר', () => {
    const applications = content.applications as Array<Record<string, unknown>>;
    expect(applications[0]!.batchNumber).toBeUndefined();
    expect(applications[0]!.dosage).toBeUndefined();
    // מה שלא משתנה בין ביקורים נשמר.
    expect(applications[0]!.productTradeName).toBe('תכשיר דוגמה ריכוז');
    expect(applications[0]!.applicationMethod).toBe('ריסוס נקודתי');
    expect(applications[0]!.dosageUnit).toBe('מ״ל/ליטר');
  });

  it('דורש אימות מחדש של האזהרות והתווית', () => {
    const preWarnings = content.preWarnings as Record<string, unknown>;
    expect(preWarnings.acknowledgedByExterminator).toBeUndefined();
    expect(preWarnings.acknowledgedAt).toBeUndefined();
    expect(preWarnings.labelReference).toBeUndefined();
    // הטקסט נשמר כבסיס לעריכה — רק האישור נמחק.
    expect(preWarnings.risksToHumans).toBeTruthy();
  });

  it('מנקה את אישור ומועד המסירה', () => {
    const handover = content.handover as Record<string, unknown>;
    expect(handover.delivered).toBeUndefined();
    expect(handover.deliveredAt).toBeUndefined();
    expect(handover.recipientName).toBe('מקבל דוגמה');
  });

  it('שומר את פרטי הצדדים, המקום, המזיקים והמניעה', () => {
    expect((content.exterminator as Record<string, unknown>).fullName).toBe('מדביר דוגמה א׳');
    expect((content.location as Record<string, unknown>).city).toBe('עיר הדוגמה');
    expect((content.monitoring as { findings: unknown[] }).findings).toHaveLength(1);
    expect((content.prevention as { actions: unknown[] }).actions).toHaveLength(2);
  });

  it('היומן המשוכפל אינו ניתן להשלמה עד להשלמת השדות שנוקו', () => {
    const result = validateForCompletion(content, { serverNow: new Date('2026-09-20T00:00:00Z') });
    expect(result.ok).toBe(false);
  });

  it('מדווח למשתמש מה נוקה', () => {
    expect(clearedFields.join(' ')).toContain('תאריך ושעת ביצוע');
    expect(clearedFields.join(' ')).toContain('חתימות');
    expect(clearedFields.join(' ')).toContain('נ״צ');
    expect(clearedFields.join(' ')).toContain('אצווה');
    expect(clearedFields.join(' ')).toContain('אימות מחדש');
  });

  it('מנקה תיעוד איוד שלא ניתן להעתיק בין ביצועים', () => {
    const { content: duplicated } = duplicateLogContent(validFumigationLog() as unknown as Record<string, unknown>);
    expect(duplicated.fumigation).toBeUndefined();
  });

  it('מנקה תיעוד התראה לציבור בערפול', () => {
    const { content: duplicated } = duplicateLogContent(validFoggingLog() as unknown as Record<string, unknown>);
    expect(duplicated.fogging).toBeUndefined();
  });

  it('אינו משנה את המקור', () => {
    const original = validLogWithAssistant() as unknown as Record<string, unknown>;
    const before = JSON.stringify(original);
    duplicateLogContent(original);
    expect(JSON.stringify(original)).toBe(before);
  });
});
