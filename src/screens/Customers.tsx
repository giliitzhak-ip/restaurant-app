import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Card, Dialog, EmptyState, Field } from '../components/ui';
import { navigate } from '../router';
import { normalize } from '../lib/search';

export function CustomersScreen() {
  const { state, createCustomer, createSite } = useStore();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', contactName: '', phone: '', email: '', address: '', city: '', notes: '' });

  const results = useMemo(() => {
    const q = normalize(query);
    return state.customers
      .filter((c) => !c.archived)
      .filter((c) =>
        !q ||
        normalize([c.name, c.phone ?? '', c.address, c.customerNumber, c.contactName ?? ''].join(' ')).includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [state.customers, query]);

  return (
    <>
      <Card>
        <Field label="חיפוש לקוח" htmlFor="c-search">
          <input
            id="c-search"
            type="search"
            placeholder="שם, טלפון, כתובת או מספר לקוח…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>+ לקוח חדש</button>
      </Card>

      {results.length === 0 ? (
        <Card><EmptyState icon="☎" title="אין לקוחות תואמים." /></Card>
      ) : (
        <div className="list mt-3">
          {results.map((c) => {
            const journals = state.journals.filter((j) => j.customerId === c.id).length;
            return (
              <button key={c.id} type="button" className="list-row" onClick={() => navigate(`#/customer/${c.id}`)}>
                <span className="grow">
                  <span className="ttl">{c.name}</span>
                  <span className="sub">{[c.customerNumber, c.phone, c.address].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="tag tag-muted">{journals} יומנים</span>
              </button>
            );
          })}
        </div>
      )}

      <Dialog
        open={open}
        title="לקוח חדש"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>ביטול</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!draft.name.trim() || !draft.address.trim()}
              onClick={() => {
                const created = createCustomer({ ...draft });
                createSite({ customerId: created.id, label: 'אתר ראשי', address: created.address, siteKind: 'apartment' });
                setDraft({ name: '', contactName: '', phone: '', email: '', address: '', city: '', notes: '' });
                setOpen(false);
              }}
            >
              שמור
            </button>
          </>
        }
      >
        <Field label="שם לקוח / עסק" htmlFor="cc-name">
          <input id="cc-name" type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="איש קשר" htmlFor="cc-contact">
          <input id="cc-contact" type="text" value={draft.contactName} onChange={(e) => setDraft({ ...draft, contactName: e.target.value })} />
        </Field>
        <div className="row">
          <Field label="טלפון" htmlFor="cc-phone">
            <input id="cc-phone" type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </Field>
          <Field label="דוא״ל" htmlFor="cc-email">
            <input id="cc-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </Field>
        </div>
        <Field label="כתובת" htmlFor="cc-address">
          <input id="cc-address" type="text" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
        </Field>
        <Field label="הערות קבועות" htmlFor="cc-notes">
          <textarea id="cc-notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </Field>
      </Dialog>
    </>
  );
}
