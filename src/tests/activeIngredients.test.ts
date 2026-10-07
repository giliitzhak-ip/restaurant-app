import { describe, expect, it } from 'vitest';
import { parseActiveIngredients, formatIngredients } from '../lib/activeIngredients';
import { NOT_ENTERED } from '../types';
import cases from '../../scripts/tests/fixtures/ingredient-cases.json';

interface Case {
  why: string;
  input: string;
  hint?: string;
  expect: { name: string; concentration: string }[];
}

/**
 * אותה טבלת מקרים נבדקת גם מול המימוש של היבואן
 * (scripts/tests/import.test.mjs), כדי שהשניים לא יתפצלו.
 */
describe('פענוח חומר פעיל וריכוז', () => {
  for (const c of cases as Case[]) {
    it(c.why, () => {
      expect(parseActiveIngredients(c.input, c.hint)).toEqual(c.expect);
    });
  }

  it('מעצב רשימה לתצוגה', () => {
    expect(formatIngredients(parseActiveIngredients('A 1%, B 2%'))).toBe('A 1% · B 2%');
    expect(formatIngredients([])).toBe(NOT_ENTERED);
  });
});
