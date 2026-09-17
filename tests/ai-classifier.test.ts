import { describe, expect, it } from 'vitest';
import { KeywordJobClassifier } from '@/lib/services/ai/job-classifier';

const classifier = new KeywordJobClassifier();
const categorySlugs = [
  'plumbing',
  'electricity',
  'pest-control',
  'hvac',
  'locksmith',
  'cleaning',
  'moving',
  'sealing',
];

describe('AIJobClassifier (keyword implementation)', () => {
  it('classifies the brief’s own example', async () => {
    const result = await classifier.classify({
      text: 'תיקון נזילה מתחת לכיור',
      categorySlugs,
    });

    expect(result.categorySlug).toBe('plumbing');
    expect(result.serviceSlug).toBe('leak');
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it('recognises an electrical fault', async () => {
    const result = await classifier.classify({ text: 'יש קצר בלוח החשמל', categorySlugs });
    expect(result.categorySlug).toBe('electricity');
  });

  it('recognises pest control', async () => {
    const result = await classifier.classify({
      text: 'יש לי תיקנים במטבח, צריך הדברה',
      categorySlugs,
    });
    expect(result.categorySlug).toBe('pest-control');
    expect(result.serviceSlug).toBe('cockroaches');
  });

  it('reads urgency out of the wording', async () => {
    expect((await classifier.classify({ text: 'הצפה דחוף עכשיו', categorySlugs })).urgency).toBe(
      'now',
    );
    expect(
      (await classifier.classify({ text: 'צריך לתקן מזגן מחר', categorySlugs })).urgency,
    ).toBe('tomorrow');
  });

  it('returns nothing rather than guessing on unrelated text', async () => {
    const result = await classifier.classify({ text: 'שלום מה נשמע', categorySlugs });
    expect(result.categorySlug).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('handles empty input without throwing', async () => {
    const result = await classifier.classify({ text: '   ', categorySlugs });
    expect(result.categorySlug).toBeNull();
    expect(result.urgency).toBe('today');
  });

  it('only suggests categories the platform actually offers', async () => {
    const result = await classifier.classify({
      text: 'יש נזילה מתחת לכיור',
      categorySlugs: ['electricity', 'cleaning'],
    });
    expect(result.categorySlug).not.toBe('plumbing');
  });

  it('only suggests services that belong to the chosen category', async () => {
    const result = await classifier.classify({
      text: 'יש נזילה מתחת לכיור',
      categorySlugs,
      serviceSlugs: { plumbing: ['blockage'] },
    });
    expect(result.categorySlug).toBe('plumbing');
    expect(result.serviceSlug).not.toBe('leak');
  });

  it('is more confident when several keywords agree', async () => {
    const weak = await classifier.classify({ text: 'ברז', categorySlugs });
    const strong = await classifier.classify({
      text: 'נזילה מהברז באינסטלציה של הכיור',
      categorySlugs,
    });
    expect(strong.confidence).toBeGreaterThan(weak.confidence);
  });
});
