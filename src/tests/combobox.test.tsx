import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchCombobox, type ComboItem } from '../components/SearchCombobox';
import { MATERIALS } from '../data/materials';

const items: ComboItem[] = MATERIALS.map((m) => ({
  id: m.id,
  title: m.tradeName,
  subtitle: m.registrationNumber,
  searchable: {
    primary: m.tradeName,
    secondary: [...m.aliases, ...m.activeIngredients.map((a) => a.name), m.registrationNumber],
  },
}));

function setup(onSelect = vi.fn()) {
  render(<SearchCombobox label="חיפוש חומר" items={items} onSelect={onSelect} />);
  return { input: screen.getByRole('combobox'), onSelect };
}

describe('תיבת חיפוש החומרים', () => {
  it('אינה מציגה רשימה לפני הקלדה', () => {
    setup();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('משתמשת ב-placeholder הנדרש', () => {
    const { input } = setup();
    expect(input).toHaveProperty('placeholder', 'הקלד שם חומר…');
  });

  it('מציגה תוצאות אחרי אות ראשונה', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.type(input, 'ד');
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    // כל תוצאה היא button אמיתי ולא div
    for (const option of options) expect(option.tagName).toBe('BUTTON');
  });

  it('בדיקה 4: לחיצה (pointer) בוחרת את החומר בפועל', () => {
    const { input, onSelect } = setup();
    fireEvent.change(input, { target: { value: 'דרג' } });
    const option = screen.getAllByRole('option')[0];
    expect(option.textContent).toContain('דרגון');
    fireEvent.pointerDown(option);
    expect(onSelect).toHaveBeenCalledWith('mat_dragon');
  });

  it('בדיקה 5: blur של שדה החיפוש אינו מבטל את הבחירה', () => {
    const { input, onSelect } = setup();
    fireEvent.change(input, { target: { value: 'דרק' } });
    const option = screen.getAllByRole('option')[0];

    // pointerDown עם preventDefault מונע את ה-blur; הבחירה נרשמת
    const event = fireEvent.pointerDown(option);
    expect(event).toBe(false); // preventDefault נקרא
    fireEvent.blur(input);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('mat_draker');
  });

  it('תומכת בחצים וב-Enter', () => {
    const { input, onSelect } = setup();
    fireEvent.change(input, { target: { value: 'ד' } });
    const first = screen.getAllByRole('option')[0].textContent;
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    // נבחר הפריט השני, לא הראשון
    const selectedId = onSelect.mock.calls[0][0];
    expect(items.find((i) => i.id === selectedId)?.title).not.toBe(first);
  });

  it('Escape סוגר את רשימת התוצאות', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'דרג' } });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('מנקה את שדה החיפוש אחרי בחירה כדי לאפשר בחירת חומר נוסף', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'דרג' } });
    fireEvent.pointerDown(screen.getAllByRole('option')[0]);
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('מציגה הודעה כשאין תוצאות', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'זזזזז' } });
    expect(screen.getByText(/לא נמצאו תוצאות/)).toBeTruthy();
  });
});
