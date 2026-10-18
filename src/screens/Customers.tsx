import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Card, EmptyState, Field } from '../components/ui';
import { NewCustomerDialog } from '../components/NewCustomerDialog';
import { navigate } from '../router';
import { normalize } from '../lib/search';

export function CustomersScreen() {
  const { state } = useStore();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

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

      <NewCustomerDialog
        open={open}
        onClose={() => setOpen(false)}
        /* נשארים ברשימה אחרי היצירה, כפי שהיה קודם. הניווט היחיד
           שנוסף הוא מעבר ללקוח קיים שהוצע בהתראת הכפילות. */
        onCreated={() => setOpen(false)}
        onPickExisting={(customer) => navigate(`#/customer/${customer.id}`)}
      />
    </>
  );
}
