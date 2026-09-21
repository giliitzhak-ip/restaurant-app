import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { rankedSearch, highlightParts, type Searchable } from '../lib/search';

export interface ComboItem {
  id: string;
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  searchable: Searchable;
}

interface Props {
  label: string;
  placeholder?: string;
  items: ComboItem[];
  /** נקרא בבחירה אמיתית – כאן מתבצעת הכנסת הרשומה למסד */
  onSelect: (id: string) => void;
  /** מוצג כשאין תוצאות */
  emptyAction?: ReactNode;
  error?: string;
  hint?: string;
  limit?: number;
  /** שדה היעד שאליו עובר הפוקוס אחרי בחירה */
  nextFieldRef?: React.RefObject<HTMLElement | null>;
  initialQuery?: string;
}

/**
 * תיבת חיפוש נגישה (combobox).
 * אין רשימה פתוחה לפני הקלדה; כל תוצאה היא <button> אמיתי;
 * הבחירה מתבצעת ב-onPointerDown כדי ש-blur של השדה לא יבלע אותה.
 */
export function SearchCombobox({
  label, placeholder = 'הקלד שם חומר…', items, onSelect, emptyAction,
  error, hint, limit = 8, nextFieldRef, initialQuery = '',
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const listId = `${inputId}-list`;

  const results = useMemo(
    () => rankedSearch(query, items, (i) => i.searchable, limit),
    [query, items, limit],
  );

  const showResults = open && query.trim().length > 0;

  function choose(item: ComboItem): void {
    onSelect(item.id);          // כאן נשמרת הרשומה בפועל
    setQuery('');               // מנקה את שדה החיפוש לבחירה הבאה
    setOpen(false);             // סוגר את התוצאות
    setActive(0);
    // מעביר את המשתמש לשדה הבא
    window.setTimeout(() => nextFieldRef?.current?.focus(), 0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (!showResults || results.length === 0) {
      if (e.key === 'Escape') { setOpen(false); setQuery(''); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[active];
      if (item) choose(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className="combo">
        <input
          id={inputId}
          ref={inputRef}
          type="search"
          role="combobox"
          autoComplete="off"
          aria-expanded={showResults}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showResults && results[active] ? `${listId}-${results[active].id}` : undefined}
          aria-invalid={error ? true : undefined}
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => { if (query.trim()) setOpen(true); }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {showResults && (
          <ul className="combo-results" id={listId} role="listbox" aria-label={label}>
            {results.map((item, i) => (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={i === active}
                  className="combo-option"
                  tabIndex={-1}
                  onMouseEnter={() => setActive(i)}
                  onPointerDown={(event) => {
                    // מונע את ה-blur של שדה החיפוש לפני שהבחירה נרשמה
                    event.preventDefault();
                    choose(item);
                  }}
                >
                  <span className="opt-title">
                    {highlightParts(item.title, query).map((part, k) =>
                      part.hit ? <mark key={k}>{part.text}</mark> : <span key={k}>{part.text}</span>,
                    )}
                    {item.badge}
                  </span>
                  {item.subtitle && <span className="opt-sub">{item.subtitle}</span>}
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="combo-empty" role="presentation">
                לא נמצאו תוצאות עבור "{query}".
                {emptyAction && <div className="mt-2">{emptyAction}</div>}
              </li>
            )}
          </ul>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
      {error && <div className="err" role="alert">{error}</div>}
    </div>
  );
}
