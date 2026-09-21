import { describe, expect, it } from 'vitest';
import { normalize, rankedSearch, matchRank, highlightParts, MATCH_PREFIX, MATCH_ALIAS } from '../lib/search';
import { MATERIALS } from '../data/materials';

const toSearchable = (m: (typeof MATERIALS)[number]) => ({
  primary: m.tradeName,
  secondary: [...m.aliases, ...m.activeIngredients.map((a) => a.name), m.registrationNumber],
});

describe('נרמול טקסט', () => {
  it('ממיר אותיות סופיות', () => {
    expect(normalize('תיקן')).toBe(normalize('תיקנ'));
    expect(normalize('פרעוש')).toContain('פרעוש');
  });

  it('מתעלם ממקפים, גרשיים ורווחים כפולים', () => {
    expect(normalize('דרקר-10.2')).toBe('דרקר 10 2');
    // האות הסופית נ' מנורמלת, ולכן ההשוואה היא לצורה המנורמלת
    expect(normalize('  דרגון  ')).toBe(normalize('דרגון'));
    expect(normalize('  דרגון  ')).toBe('דרגונ');
    expect(normalize('ג׳וק')).toBe('גוק');
  });
});

describe('חיפוש חומרים', () => {
  it('אין תוצאות לפני הקלדה', () => {
    expect(rankedSearch('', MATERIALS, toSearchable)).toEqual([]);
    expect(rankedSearch('   ', MATERIALS, toSearchable)).toEqual([]);
  });

  it('בדיקה 2: חיפוש "דרג" מציג את דרגון', () => {
    const results = rankedSearch('דרג', MATERIALS, toSearchable);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tradeName).toBe('דרגון');
    expect(results[0].id).toBe('mat_dragon');
  });

  it('בדיקה 3: חיפוש "דרק" מציג את דרקר 10.2', () => {
    const results = rankedSearch('דרק', MATERIALS, toSearchable);
    expect(results[0].tradeName).toBe('דרקר 10.2');
    expect(results[0].id).toBe('mat_draker');
  });

  it('מחזיר לכל היותר 8 תוצאות', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      tradeName: `חומר ${i}`, aliases: [], activeIngredients: [], registrationNumber: String(i),
    }));
    expect(rankedSearch('חומר', many, toSearchable as never, 8)).toHaveLength(8);
  });

  it('מדרג התאמה מלאה לפני "מתחיל ב" ולפני שם חלופי', () => {
    expect(matchRank('דרגון', { primary: 'דרגון' })).toBe(0);
    expect(matchRank('דרג', { primary: 'דרגון' })).toBe(MATCH_PREFIX);
    expect(matchRank('bifenthrin', { primary: 'דרגון', secondary: ['bifenthrin'] })).toBe(MATCH_ALIAS);
  });

  it('מוצא לפי חומר פעיל ומספר רישום', () => {
    expect(rankedSearch('Bifenthrin', MATERIALS, toSearchable)[0].id).toBe('mat_dragon');
    expect(rankedSearch('584', MATERIALS, toSearchable)[0].id).toBe('mat_pastion_plus');
  });

  it('מוצא גם באנגלית ובכתיב חלופי', () => {
    expect(rankedSearch('dragon', MATERIALS, toSearchable)[0].id).toBe('mat_dragon');
    expect(rankedSearch('בלוקיון', MATERIALS, toSearchable)[0].id).toBe('mat_blokion_plus');
  });

  it('מדגיש את רצף האותיות שהוקלד', () => {
    const parts = highlightParts('דרגון', 'דרג');
    expect(parts.filter((p) => p.hit).map((p) => p.text).join('')).toBe('דרג');
  });
});
