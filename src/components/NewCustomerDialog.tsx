import { useMemo, useState } from 'react';
import { Dialog, Field, Notice } from './ui';
import { useStore } from '../state/store';
import { STRENGTH_LABEL, findSimilarCustomers } from '../lib/customerMatch';
import type { Customer, CustomerSite } from '../types';

const EMPTY = {
  name: '', contactName: '', phone: '', email: '', address: '', city: '', notes: '',
};

/**
 * דיאלוג "לקוח חדש" – מקום אחד במערכת.
 *
 * קודם היו שתי מימושים כמעט זהים (מסך הלקוחות ושלב 2 באשף), וכל
 * תיקון היה צריך לקרות פעמיים. כאן גם ההתראה על לקוח דומה: המערכת
 * מתריעה, המשתמש מחליט, ואין מיזוג אוטומטי.
 */
export function NewCustomerDialog({
  open, onClose, onCreated, onPickExisting,
}: {
  open: boolean;
  onClose: () => void;
  /** נקרא אחרי יצירה מוצלחת, עם הלקוח והאתר הראשי שנוצרו. */
  onCreated: (customer: Customer, site: CustomerSite) => void;
  /** נקרא כשהמשתמש בחר להשתמש בלקוח קיים שהוצע לו. */
  onPickExisting?: (customer: Customer) => void;
}) {
  const { state, createCustomer, createSite } = useStore();
  const [draft, setDraft] = useState(EMPTY);
  /** אישור מפורש להמשיך למרות לקוח דומה. */
  const [acknowledged, setAcknowledged] = useState(false);

  const similar = useMemo(
    () => (open ? findSimilarCustomers(draft, state.customers) : []),
    [open, draft, state.customers],
  );
  const blocking = similar.length > 0 && !acknowledged;

  function close(): void {
    setDraft(EMPTY);
    setAcknowledged(false);
    onClose();
  }

  function save(): void {
    if (!draft.name.trim() || !draft.address.trim() || blocking) return;
    const customer = createCustomer({ ...draft });
    const site = createSite({
      customerId: customer.id,
      label: 'אתר ראשי',
      address: customer.address,
      siteKind: 'apartment',
    });
    setDraft(EMPTY);
    setAcknowledged(false);
    onCreated(customer, site);
  }

  return (
    <Dialog
      open={open}
      title="לקוח חדש"
      onClose={close}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={close}>ביטול</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!draft.name.trim() || !draft.address.trim() || blocking}
            onClick={save}
          >
            שמור
          </button>
        </>
      }
    >
      <Field label="שם לקוח / עסק" htmlFor="nc-name">
        <input id="nc-name" type="text" value={draft.name}
          onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setAcknowledged(false); }} />
      </Field>
      <Field label="איש קשר" htmlFor="nc-contact">
        <input id="nc-contact" type="text" value={draft.contactName}
          onChange={(e) => setDraft({ ...draft, contactName: e.target.value })} />
      </Field>
      <div className="row">
        <Field label="טלפון" htmlFor="nc-phone">
          <input id="nc-phone" type="tel" value={draft.phone}
            onChange={(e) => { setDraft({ ...draft, phone: e.target.value }); setAcknowledged(false); }} />
        </Field>
        <Field label="דוא״ל" htmlFor="nc-email">
          <input id="nc-email" type="email" value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        </Field>
      </div>
      <Field label="כתובת מלאה" htmlFor="nc-address">
        <input id="nc-address" type="text" value={draft.address}
          onChange={(e) => { setDraft({ ...draft, address: e.target.value }); setAcknowledged(false); }} />
      </Field>
      <Field label="עיר" htmlFor="nc-city">
        <input id="nc-city" type="text" value={draft.city}
          onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
      </Field>
      <Field label="הערות קבועות" htmlFor="nc-notes">
        <textarea id="nc-notes" value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </Field>

      {similar.length > 0 && (
        <Notice kind="warn" title="קיים לקוח דומה">
          <div className="small">
            לפני יצירת לקוח חדש – בדקו אם זה אותו לקוח. יצירת לקוח כפול מפצלת את
            ההיסטוריה, את היומנים ואת תיבות ההאכלה בין שתי רשומות.
          </div>
          <ul className="similar-list">
            {similar.map((m) => (
              <li key={m.customer.id}>
                <div>
                  <span className="bold">{m.customer.name}</span>
                  <span className="small muted">
                    {' · '}{STRENGTH_LABEL[m.strength]} ({m.reasons.join(', ')})
                  </span>
                </div>
                <div className="small muted">
                  {[m.customer.customerNumber, m.customer.phone, m.customer.address]
                    .filter(Boolean).join(' · ')}
                </div>
                {onPickExisting && (
                  <button
                    type="button"
                    className="btn btn-soft btn-sm mt-2"
                    onClick={() => { onPickExisting(m.customer); close(); }}
                  >
                    השתמש בלקוח הזה
                  </button>
                )}
              </li>
            ))}
          </ul>
          <label className="check-line">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            בדקתי – זה לקוח אחר, צור אותו בנפרד
          </label>
        </Notice>
      )}
    </Dialog>
  );
}
