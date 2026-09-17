import { describe, expect, it } from 'vitest';
import { RuleBasedUnderstanding } from '@/domains/jobs/understanding';

const service = new RuleBasedUnderstanding();
const understand = (text: string) => service.understandSync(text);

describe('JobUnderstandingService (spec §32)', () => {
  it('classifies the headline example from the spec', () => {
    const result = understand('יש מים שיוצאים מתחת לכיור');
    expect(result.category).toBe('plumbing');
    expect(result.service).toBe('sink_leak');
    expect(result.urgency).toBe('high');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it.each([
    ['יש לי נזילה מתחת לכיור', 'plumbing', 'sink_leak'],
    ['המזגן לא מקרר', 'air_conditioning', 'ac_not_cooling'],
    ['ננעלתי מחוץ לבית', 'locksmith', 'locked_out'],
    ['אני צריך הדברה', 'pest_control', 'cockroaches'],
    ['אין חשמל בדירה', 'electrical', 'power_outage'],
    ['יש סתימה בצינור', 'plumbing', 'blocked_drain'],
    ['צריך לכסח את הדשא', 'gardening', 'garden_maintenance'],
    ['ניקיון דירה אחרי שיפוץ', 'cleaning', 'post_renovation'],
  ])('understands "%s"', (text, category, svc) => {
    const result = understand(text);
    expect(result.category).toBe(category);
    expect(result.service).toBe(svc);
  });

  it('is deterministic — the same text always classifies identically', () => {
    const a = understand('המזגן לא מקרר');
    const b = understand('המזגן לא מקרר');
    expect(a).toEqual(b);
  });

  it('escalates urgency on explicit distress words', () => {
    expect(understand('יש לי נזילה').urgency).toBe('high');
    expect(understand('נזילה דחוף מאוד יש הצפה').urgency).toBe('emergency');
  });

  it('prefers the more specific service when both could match', () => {
    // "ננעלתי מחוץ לרכב" must not be read as a house lockout.
    expect(understand('ננעלתי מחוץ לרכב').service).toBe('car_lockout');
    expect(understand('ננעלתי מחוץ לבית').service).toBe('locked_out');
  });

  it('asks for clarification instead of guessing when it cannot tell', () => {
    const result = understand('משהו לא עובד בבית');
    expect(result.category).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.clarifyingQuestion).not.toBeNull();
  });

  it('handles empty and near-empty input safely', () => {
    for (const text of ['', ' ', 'אה']) {
      const result = understand(text);
      expect(result.category).toBeNull();
      expect(result.clarifyingQuestion).not.toBeNull();
    }
  });

  it('tolerates niqqud, quotes and irregular spacing', () => {
    const result = understand('  יֵש   לִי "נזילה"   מתחת לכיור  ');
    expect(result.category).toBe('plumbing');
  });

  it('reports the terms it matched so a ranking can be explained', () => {
    const result = understand('יש לי נזילה מתחת לכיור והמצב דחוף');
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.signals.some((s) => s.includes('נזילה'))).toBe(true);
  });

  it('never returns a confidence outside 0..1', () => {
    const texts = ['נזילה מתחת לכיור סתימה הצפה דחוף', 'שלום', 'מזגן'];
    for (const text of texts) {
      const { confidence } = understand(text);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    }
  });
});
