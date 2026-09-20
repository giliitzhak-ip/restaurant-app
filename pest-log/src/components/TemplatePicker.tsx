import { useMemo, useState } from 'react';
import { BookmarkPlus, Check, Trash2 } from 'lucide-react';
import { useApp } from '@/state/AppContext';
import { useToast } from '@/state/ToastContext';
import { deleteTextTemplate, saveTextTemplate } from '@/lib/legacy/repo';
import { TEMPLATE_LIBRARIES, type TemplateKind } from '@/schema/textLibraries';

/**
 * „הוסף מתבנית” — ספריית הניסוחים שהייתה בגרסה הקודמת של היומן.
 *
 * הבחירה מוסיפה שורות לטקסט הקיים ואינה דורסת אותו. כל ניסוח הוא הצעה
 * בלבד: המדביר עורך ומאשר אותו, והאחריות על תוכן היומן נשארת שלו.
 * אזהרות ספציפיות לתכשיר וזמן כניסה מחדש נקבעים לפי התווית, לא לפי
 * הרשימה הזו.
 */
export function TemplatePicker({
  kind,
  value,
  onChange,
  disabled = false,
  label,
}: {
  kind: TemplateKind;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  label?: string;
}): React.JSX.Element {
  const { profile, reference, syncEngine, setTextTemplates } = useApp();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const library = TEMPLATE_LIBRARIES[kind];
  const mine = useMemo(
    () => reference.textTemplates.filter((row) => row.kind === kind),
    [kind, reference.textTemplates],
  );

  const normalized = query.trim().toLowerCase();
  const matches = (text: string) => !normalized || text.toLowerCase().includes(normalized);
  const builtin = library.items.filter(matches);
  const saved = mine.filter((row) => matches(row.body));

  const toggle = (text: string) =>
    setSelected((current) =>
      current.includes(text) ? current.filter((item) => item !== text) : [...current, text],
    );

  const addSelected = () => {
    if (selected.length === 0) {
      showToast('לא נבחרו ניסוחים', 'error');
      return;
    }
    const existing = value.trim();
    onChange([existing, ...selected].filter(Boolean).join('\n'));
    showToast(`נוספו ${selected.length} ניסוחים — יש לערוך ולאשר`, 'success');
    setSelected([]);
    setOpen(false);
  };

  const saveCurrent = async () => {
    if (!profile) return;
    const text = value.trim();
    if (!text) {
      showToast('אין טקסט לשמירה', 'error');
      return;
    }
    let rows = reference.textTemplates;
    let added = 0;
    for (const line of text.split('\n').map((item) => item.trim()).filter(Boolean)) {
      const before = rows.length;
      rows = await saveTextTemplate(syncEngine, rows, profile.organizationId, kind, line);
      if (rows.length > before) added += 1;
    }
    setTextTemplates(rows);
    showToast(added > 0 ? `${added} ניסוחים נשמרו לתבניות שלך` : 'הניסוחים כבר שמורים', 'success');
  };

  const removeTemplate = async (id: string) => {
    const rows = await deleteTextTemplate(syncEngine, reference.textTemplates, id);
    setTextTemplates(rows);
    showToast('התבנית נמחקה', 'success');
  };

  return (
    <>
      <div className="btn-row btn-row-compact">
        <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => setOpen(true)}>
          הוסף מתבנית{label ? ` — ${label}` : ''}
        </button>
        {value.trim() ? (
          <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => void saveCurrent()}>
            <BookmarkPlus size={16} aria-hidden="true" /> שמירת הטקסט כתבנית
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={library.title}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{library.title}</h3>
            <p className="small muted">{library.hint}</p>
            <p className="small dim">
              הניסוחים הם הצעה בלבד. אזהרות ייחודיות לתכשיר וזמן כניסה מחדש נקבעים לפי התווית התקפה.
            </p>

            <div className="field">
              <label htmlFor={`tpl-search-${kind}`}>חיפוש</label>
              <input
                id={`tpl-search-${kind}`}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className="template-list">
              {saved.length > 0 ? (
                <>
                  <p className="small muted">התבניות שלי</p>
                  {saved.map((row) => (
                    <div className="template-row" key={row.id}>
                      <button
                        type="button"
                        className={`btn btn-sm${selected.includes(row.body) ? ' btn-primary' : ''}`}
                        aria-pressed={selected.includes(row.body)}
                        onClick={() => toggle(row.body)}
                      >
                        {selected.includes(row.body) ? <Check size={14} aria-hidden="true" /> : '+'}
                      </button>
                      <span>{row.body}</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        aria-label={`מחיקת התבנית ${row.body}`}
                        onClick={() => void removeTemplate(row.id)}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </>
              ) : null}

              <p className="small muted">ניסוחים מובנים</p>
              {builtin.length === 0 ? (
                <p className="small dim">לא נמצאו ניסוחים מתאימים.</p>
              ) : (
                builtin.map((text) => (
                  <div className="template-row" key={text}>
                    <button
                      type="button"
                      className={`btn btn-sm${selected.includes(text) ? ' btn-primary' : ''}`}
                      aria-pressed={selected.includes(text)}
                      onClick={() => toggle(text)}
                    >
                      {selected.includes(text) ? <Check size={14} aria-hidden="true" /> : '+'}
                    </button>
                    <span>{text}</span>
                  </div>
                ))
              )}
            </div>

            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={addSelected}>
                הוספת הנבחרים{selected.length > 0 ? ` (${selected.length})` : ''}
              </button>
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                סגירה
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
