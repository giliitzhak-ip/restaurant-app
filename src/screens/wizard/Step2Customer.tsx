import { useMemo, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { Card, Dialog, Field, Notice, Tag } from '../../components/ui';
import { SearchCombobox, type ComboItem } from '../../components/SearchCombobox';
import { SITE_KIND_LABEL } from '../../lib/format';
import type { SiteKind } from '../../types';
import type { StepProps } from './JournalWizard';

export function Step2Customer({ journalId }: StepProps) {
  const { state, updateJournal, createCustomer, createSite, loadFromLastJournal } = useStore();
  const journal = state.journals.find((j) => j.id === journalId)!;
  const customer = state.customers.find((c) => c.id === journal.customerId);
  const [newOpen, setNewOpen] = useState(false);
  const [loadResult, setLoadResult] = useState<{ copied: string[]; cleared: string[] } | null>(null);
  const [draft, setDraft] = useState({
    name: '', contactName: '', phone: '', email: '', address: '', city: '', notes: '',
  });
  const addressRef = useRef<HTMLInputElement>(null);

  const items = useMemo<ComboItem[]>(
    () =>
      state.customers
        .filter((c) => !c.archived)
        .map((c) => ({
          id: c.id,
          title: c.name,
          subtitle: [c.customerNumber, c.phone, c.address].filter(Boolean).join(' · '),
          searchable: {
            primary: c.name,
            secondary: [c.phone ?? '', c.phoneAlt ?? '', c.address, c.customerNumber, c.contactName ?? '', c.email ?? ''],
          },
        })),
    [state.customers],
  );

  const hasPrevious = useMemo(
    () =>
      Boolean(
        journal.customerId &&
          state.journals.some(
            (j) => j.customerId === journal.customerId && j.id !== journal.id && j.status !== 'cancelled',
          ),
      ),
    [state.journals, journal.customerId, journal.id],
  );

  function pickCustomer(id: string): void {
    const picked = state.customers.find((c) => c.id === id);
    if (!picked) return;
    const site = state.sites.find((s) => s.customerId === id);
    updateJournal(journal.id, {
      customerId: picked.id,
      siteId: site?.id,
      siteAddress: site?.address ?? picked.address,
      siteKind: site?.siteKind ?? journal.siteKind ?? 'apartment',
      siteAccessNotes: site?.accessNotes ?? journal.siteAccessNotes,
    });
  }

  function saveNewCustomer(): void {
    if (!draft.name.trim() || !draft.address.trim()) return;
    const created = createCustomer({ ...draft });
    const site = createSite({
      customerId: created.id,
      label: 'אתר ראשי',
      address: created.address,
      siteKind: 'apartment',
    });
    updateJournal(journal.id, {
      customerId: created.id,
      siteId: site.id,
      siteAddress: site.address,
      siteKind: 'apartment',
    });
    setDraft({ name: '', contactName: '', phone: '', email: '', address: '', city: '', notes: '' });
    setNewOpen(false);
  }

  return (
    <>
      <Card>
        <div className="card-title"><h2>לקוח ואתר</h2></div>

        <SearchCombobox
          label="חיפוש לקוח קיים"
          placeholder="שם, טלפון, כתובת או מספר לקוח…"
          items={items}
          onSelect={pickCustomer}
          hint="אין רשימה נפתחת לפני הקלדה. התוצאות מדורגות לפי התאמה."
          nextFieldRef={addressRef}
          emptyAction={
            <button type="button" className="btn btn-soft btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => setNewOpen(true)}>
              צור לקוח חדש
            </button>
          }
        />

        <div className="row mb-3">
          <button type="button" className="btn btn-soft" onClick={() => setNewOpen(true)}>
            + לקוח חדש
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!hasPrevious}
            onClick={() => {
              if (!journal.customerId) return;
              setLoadResult(loadFromLastJournal(journal.id, journal.customerId));
            }}
          >
            טען מיומן אחרון
          </button>
        </div>

        {customer ? (
          <Notice kind="info" title={`לקוח משויך: ${customer.name}`}>
            {[customer.customerNumber, customer.phone, customer.address].filter(Boolean).join(' · ')}
          </Notice>
        ) : (
          <Notice kind="warn">עדיין לא נבחר לקוח. אפשר לבחור מהחיפוש או ליצור לקוח חדש בלי לצאת מהיומן.</Notice>
        )}

        {loadResult && (
          <Notice kind="warn" title="נטען מיומן קודם – השוואה">
            <div><span className="bold">הועתק:</span> {loadResult.copied.join(', ')}</div>
            <div><span className="bold">נוקה ודורש מילוי מחדש:</span> {loadResult.cleared.join(', ')}</div>
            <div className="mt-2 small">יש לאשר מחדש את החומר, המזיק, המינון, האזהרות והאחריות.</div>
          </Notice>
        )}
      </Card>

      <Card>
        <div className="card-title"><h3>פרטי האתר</h3></div>

        <Field label="כתובת מלאה של האתר" htmlFor="site-address">
          <input
            id="site-address"
            ref={addressRef}
            type="text"
            value={journal.siteAddress ?? ''}
            onChange={(e) => updateJournal(journal.id, { siteAddress: e.target.value })}
          />
        </Field>

        <Field label="סוג אתר" htmlFor="site-kind">
          <select
            id="site-kind"
            value={journal.siteKind ?? 'apartment'}
            onChange={(e) => updateJournal(journal.id, { siteKind: e.target.value as SiteKind })}
          >
            {(Object.keys(SITE_KIND_LABEL) as SiteKind[]).map((k) => (
              <option key={k} value={k}>{SITE_KIND_LABEL[k]}</option>
            ))}
          </select>
        </Field>

        <Field
          label="הערות כניסה"
          htmlFor="access-notes"
          hint="מפתח, שער, חניה, קוד כניסה או איש קשר באתר."
        >
          <textarea
            id="access-notes"
            value={journal.siteAccessNotes ?? ''}
            onChange={(e) => updateJournal(journal.id, { siteAccessNotes: e.target.value })}
          />
        </Field>

        {customer && (
          <div className="small muted">
            פרטי קשר: {customer.contactName || '—'} · {customer.phone || '—'} · {customer.email || '—'}
          </div>
        )}
      </Card>

      <Dialog
        open={newOpen}
        title="לקוח חדש"
        onClose={() => setNewOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setNewOpen(false)}>ביטול</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!draft.name.trim() || !draft.address.trim()}
              onClick={saveNewCustomer}
            >
              שמור ושייך ליומן
            </button>
          </>
        }
      >
        <Field label="שם לקוח / עסק" htmlFor="nc-name">
          <input id="nc-name" type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="איש קשר" htmlFor="nc-contact">
          <input id="nc-contact" type="text" value={draft.contactName} onChange={(e) => setDraft({ ...draft, contactName: e.target.value })} />
        </Field>
        <div className="row">
          <Field label="טלפון" htmlFor="nc-phone">
            <input id="nc-phone" type="tel" inputMode="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </Field>
          <Field label="דוא״ל" htmlFor="nc-email">
            <input id="nc-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </Field>
        </div>
        <Field label="כתובת מלאה" htmlFor="nc-address">
          <input id="nc-address" type="text" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
        </Field>
        <Field label="עיר" htmlFor="nc-city">
          <input id="nc-city" type="text" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
        </Field>
        <Field label="הערות קבועות" htmlFor="nc-notes">
          <textarea id="nc-notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </Field>
        {!draft.name.trim() || !draft.address.trim() ? (
          <div className="small muted">שם וכתובת הם שדות חובה. <Tag kind="muted">ולידציה גם בשרת</Tag></div>
        ) : null}
      </Dialog>
    </>
  );
}
