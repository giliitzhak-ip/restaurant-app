import { describe, expect, it } from 'vitest';
import { parseActiveIngredients, parseIngredient, formatIngredients } from '../lib/activeIngredients';
import { NOT_ENTERED } from '../types';

describe('פענוח חומר פעיל וריכוז', () => {
  it('מפענח אחוז פשוט באנגלית', () => {
    expect(parseIngredient('Bifenthrin 9.6%')).toEqual({ name: 'Bifenthrin', concentration: '9.6%' });
  });

  it('מפענח אחוז בעברית', () => {
    expect(parseIngredient('ציפרמתרין 10%')).toEqual({ name: 'ציפרמתרין', concentration: '10%' });
  });

  it('מתמודד עם רווח לפני סימן האחוז', () => {
    expect(parseIngredient('Brodifacoum 0.005 %')).toEqual({ name: 'Brodifacoum', concentration: '0.005%' });
  });

  it('מקבל פסיק עשרוני', () => {
    expect(parseIngredient('Deltamethrin 2,5%')).toEqual({ name: 'Deltamethrin', concentration: '2.5%' });
  });

  it('שומר יחידות שאינן אחוז', () => {
    expect(parseIngredient('Imidacloprid 200 g/l')).toEqual({ name: 'Imidacloprid', concentration: '200 g/l' });
  });

  it('אינו מנחש ריכוז כשאינו קיים', () => {
    expect(parseIngredient('Fipronil')).toEqual({ name: 'Fipronil', concentration: NOT_ENTERED });
  });

  it('מפצל כמה חומרים פעילים', () => {
    const r = parseActiveIngredients('Cypermethrin 10%, Tetramethrin 2%, Piperonyl Butoxide 10%');
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({ name: 'Cypermethrin', concentration: '10%' });
    expect(r[2]).toEqual({ name: 'Piperonyl Butoxide', concentration: '10%' });
  });

  it('מפצל גם לפי נקודה-פסיק ולפי פלוס', () => {
    expect(parseActiveIngredients('A 1%; B 2%')).toHaveLength(2);
    expect(parseActiveIngredients('A 1% + B 2%')).toHaveLength(2);
  });

  it('משתמש בעמודת ריכוז נפרדת כשיש חומר פעיל יחיד', () => {
    expect(parseActiveIngredients('Bifenthrin', '9.6%')).toEqual([
      { name: 'Bifenthrin', concentration: '9.6%' },
    ]);
  });

  it('אינו מחיל עמודת ריכוז על כמה חומרים', () => {
    const r = parseActiveIngredients('A, B', '5%');
    expect(r.every((i) => i.concentration === NOT_ENTERED)).toBe(true);
  });

  it('מחזיר רשימה ריקה לטקסט ריק', () => {
    expect(parseActiveIngredients('')).toEqual([]);
    expect(parseActiveIngredients('   ')).toEqual([]);
  });

  it('מנקה תווים עודפים משם החומר', () => {
    expect(parseIngredient('  Bifenthrin -  9.6%  ')?.name).toBe('Bifenthrin');
  });

  it('מעצב רשימה לתצוגה', () => {
    expect(formatIngredients(parseActiveIngredients('A 1%, B 2%'))).toBe('A 1% · B 2%');
    expect(formatIngredients([])).toBe(NOT_ENTERED);
  });
});
