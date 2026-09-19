import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { fieldDomId } from '@/schema/fieldRegistry';

/**
 * רכיבי שדה בסיסיים.
 * כל שדה מקבל label אמיתי, aria-invalid ו-aria-describedby להודעת שגיאה,
 * ומזהה DOM יציב שמאפשר קפיצה אליו מתוך רשימת השדות החסרים.
 */

interface BaseFieldProps {
  /** הנתיב בסכימה — משמש גם למזהה ה-DOM וגם לקישור שגיאות. */
  path: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | undefined;
  disabled?: boolean;
}

function FieldShell({
  path,
  label,
  required,
  hint,
  error,
  children,
  controlId,
}: BaseFieldProps & { children: ReactNode; controlId: string }): React.JSX.Element {
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  return (
    // הכוכבית מוצגת ב-CSS (.field.is-required) ולא כטקסט בתוך ה-label:
    // כך תוכן ה-label הוא שם השדה בלבד. מצב "חובה" נמסר דרך aria-required.
    <div
      className={`field${required ? ' is-required' : ''}${error ? ' has-error' : ''}`}
      id={fieldDomId(path)}
    >
      <label htmlFor={controlId}>{label}</label>
      {children}
      {hint ? (
        <div className="hint" id={hintId}>
          {hint}
        </div>
      ) : null}
      {error ? (
        <div className="field-error" id={errorId} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function describedBy(controlId: string, hint?: string, error?: string): string | undefined {
  const ids = [hint ? `${controlId}-hint` : '', error ? `${controlId}-error` : ''].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

export interface TextFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'tel' | 'email' | 'number' | 'date' | 'time';
  placeholder?: string;
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal';
  autoComplete?: string;
  max?: string | number;
  min?: string | number;
  step?: string | number;
}

export function TextField(props: TextFieldProps): React.JSX.Element {
  const generatedId = useId();
  const controlId = `input-${generatedId}`;
  const { value, onChange, type = 'text', placeholder, inputMode, autoComplete, max, min, step, disabled } = props;

  return (
    <FieldShell {...props} controlId={controlId}>
      <input
        id={controlId}
        type={type}
        value={value}
        disabled={disabled ?? false}
        placeholder={placeholder ?? ''}
        {...(inputMode ? { inputMode } : {})}
        {...(autoComplete ? { autoComplete } : {})}
        {...(max !== undefined ? { max } : {})}
        {...(min !== undefined ? { min } : {})}
        {...(step !== undefined ? { step } : {})}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy(controlId, props.hint, props.error)}
        aria-required={props.required ?? undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldShell>
  );
}

export interface TextAreaFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}

export function TextAreaField(props: TextAreaFieldProps): React.JSX.Element {
  const generatedId = useId();
  const controlId = `textarea-${generatedId}`;
  return (
    <FieldShell {...props} controlId={controlId}>
      <textarea
        id={controlId}
        value={props.value}
        rows={props.rows ?? 3}
        disabled={props.disabled ?? false}
        placeholder={props.placeholder ?? ''}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy(controlId, props.hint, props.error)}
        aria-required={props.required ?? undefined}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </FieldShell>
  );
}

export interface SelectFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
}

export function SelectField(props: SelectFieldProps): React.JSX.Element {
  const generatedId = useId();
  const controlId = `select-${generatedId}`;
  return (
    <FieldShell {...props} controlId={controlId}>
      <select
        id={controlId}
        value={props.value}
        disabled={props.disabled ?? false}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy(controlId, props.hint, props.error)}
        aria-required={props.required ?? undefined}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">{props.placeholder ?? '— בחירה —'}</option>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export interface CheckboxFieldProps {
  path: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  error?: string | undefined;
  disabled?: boolean;
}

export function CheckboxField(props: CheckboxFieldProps): React.JSX.Element {
  const generatedId = useId();
  const controlId = `checkbox-${generatedId}`;
  return (
    <div className={`field${props.error ? ' has-error' : ''}`} id={fieldDomId(props.path)}>
      <div className="checkbox-row">
        <input
          id={controlId}
          type="checkbox"
          checked={props.checked}
          disabled={props.disabled ?? false}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={describedBy(controlId, props.hint, props.error)}
          onChange={(event) => props.onChange(event.target.checked)}
        />
        <label htmlFor={controlId}>{props.label}</label>
      </div>
      {props.hint ? (
        <div className="hint" id={`${controlId}-hint`}>
          {props.hint}
        </div>
      ) : null}
      {props.error ? (
        <div className="field-error" id={`${controlId}-error`} role="alert">
          {props.error}
        </div>
      ) : null}
    </div>
  );
}

export interface ComboOption {
  value: string;
  label: string;
  sublabel?: string;
  recent?: boolean;
}

export interface ComboFieldProps extends BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<ComboOption>;
  placeholder?: string;
  /** מאפשר ערך חופשי שאינו ברשימה (ברירת מחדל: כן). */
  allowFreeText?: boolean;
  onSelectOption?: (option: ComboOption) => void;
}

/**
 * שדה עם השלמה אוטומטית.
 * מצמצם הקלדה: מציג בחירות אחרונות ומסנן לפי מה שהוקלד, אך מאפשר
 * להזין ערך חופשי במקומות שבהם אין רשימה סגורה רשמית.
 */
export function ComboField(props: ComboFieldProps): React.JSX.Element {
  const generatedId = useId();
  const controlId = `combo-${generatedId}`;
  const listId = `${controlId}-list`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const needle = props.value.trim().toLowerCase();
    const matches = needle
      ? props.options.filter(
          (o) => o.label.toLowerCase().includes(needle) || (o.sublabel ?? '').toLowerCase().includes(needle),
        )
      : props.options;
    return matches.slice(0, 40);
  }, [props.options, props.value]);

  const select = (option: ComboOption) => {
    props.onChange(option.label);
    props.onSelectOption?.(option);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <FieldShell {...props} controlId={controlId}>
      <div className="combo">
        <input
          id={controlId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={props.error ? true : undefined}
          aria-describedby={describedBy(controlId, props.hint, props.error)}
          aria-required={props.required ?? undefined}
          autoComplete="off"
          value={props.value}
          disabled={props.disabled ?? false}
          placeholder={props.placeholder ?? ''}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // השהייה קצרה כדי שלחיצה על אפשרות תספיק להירשם.
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onChange={(event) => {
            props.onChange(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter' && open && activeIndex >= 0) {
              const option = filtered[activeIndex];
              if (option) {
                event.preventDefault();
                select(option);
              }
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {open && filtered.length > 0 ? (
          <ul className="combo-list" id={listId} role="listbox">
            {filtered.map((option, index) => (
              <li
                key={`${option.value}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className="combo-option"
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  select(option);
                }}
              >
                <span>
                  {option.label}
                  {option.recent ? <span className="combo-recent"> · נבחר לאחרונה</span> : null}
                </span>
                {option.sublabel ? <span className="combo-sub">{option.sublabel}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </FieldShell>
  );
}
