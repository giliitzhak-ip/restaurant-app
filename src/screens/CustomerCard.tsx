import { useState } from 'react';
import { useStore } from '../state/store';
import { Card, EmptyState, Field, Notice, Tag } from '../components/ui';
import { navigate } from '../router';
import { formatDate, journalNumberText, JOURNAL_STATUS_LABEL, SITE_KIND_LABEL, TASK_KIND_LABEL } from '../lib/format';
import { pestName } from '../data/pests';

export function CustomerCard({ customerId }: { customerId?: string }) {
  const { state, updateCustomer, saveCustomerTemplate, createJournal, updateJournal } = useStore();
  const customer = state.customers.find((c) => c.id === customerId);
  const [saved, setSaved] = useState(false);

  if (!customer) {
    return <Card><EmptyState icon="☎" title="הלקוח לא נמצא." /></Card>;
  }

  const sites = state.sites.filter((s) => s.customerId === customer.id);
  const journals = state.journals
    .filter((j) => j.customerId === customer.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const tasks = state.tasks.filter((t) => t.customerId === customer.id && !t.done);
  const templates = state.customerTemplates.filter((t) => t.customerId === customer.id && !t.archived);
  const stations = state.baitStations.filter((b) => b.customerId === customer.id);
  const photos = state.attachments.filter((a) => journals.some((j) => j.id === a.journalId));

  const commonPests = Array.from(
    new Set(
      state.journalPests
        .filter((p) => journals.some((j) => j.id === p.journalId))
        .map((p) => p.pestId),
    ),
  );

  const preferredMaterialId = state.journalMaterials
    .filter((m) => journals.some((j) => j.id === m.journalId))
    .map((m) => m.materialId)[0];

  function startJournalForCustomer(): void {
    const journal = createJournal();
    const site = sites[0];
    updateJournal(journal.id, {
      customerId: customer!.id,
      siteId: site?.id,
      siteAddress: site?.address ?? customer!.address,
      siteKind: site?.siteKind ?? 'apartment',
      siteAccessNotes: site?.accessNotes,
    });
    navigate(`#/journal/${journal.id}/1`);
  }

  return (
    <>
      <Card>
        <div className="card-title">
          <h2>{customer.name}</h2>
          <Tag kind="muted">מס' {customer.customerNumber}</Tag>
        </div>
        <div className="row">
          <Field label="איש קשר" htmlFor="cd-contact">
            <input id="cd-contact" type="text" value={customer.contactName ?? ''} onChange={(e) => updateCustomer(customer.id, { contactName: e.target.value })} />
          </Field>
          <Field label="טלפון" htmlFor="cd-phone">
            <input id="cd-phone" type="tel" value={customer.phone ?? ''} onChange={(e) => updateCustomer(customer.id, { phone: e.target.value })} />
          </Field>
        </div>
        <div className="row">
          <Field label="דוא״ל" htmlFor="cd-email">
            <input id="cd-email" type="email" value={customer.email ?? ''} onChange={(e) => updateCustomer(customer.id, { email: e.target.value })} />
          </Field>
          <Field label="כתובת" htmlFor="cd-address">
            <input id="cd-address" type="text" value={customer.address} onChange={(e) => updateCustomer(customer.id, { address: e.target.value })} />
          </Field>
        </div>
        <Field label="הערות קבועות" htmlFor="cd-notes">
          <textarea id="cd-notes" value={customer.notes ?? ''} onChange={(e) => updateCustomer(customer.id, { notes: e.target.value })} />
        </Field>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={startJournalForCustomer}>פתח יומן ללקוח</button>
          {customer.phone && <a className="btn btn-soft" href={`tel:${customer.phone}`}>חיוג</a>}
        </div>
      </Card>

      <Card>
        <div className="card-title"><h3>אתרים</h3></div>
        {sites.length ? (
          <div className="list">
            {sites.map((s) => (
              <div key={s.id} className="list-row" style={{ cursor: 'default' }}>
                <span className="grow">
                  <span className="ttl">{s.label} · {SITE_KIND_LABEL[s.siteKind]}</span>
                  <span className="sub">{s.address}</span>
                </span>
              </div>
            ))}
          </div>
        ) : <p className="muted small">לא הוגדרו אתרים נוספים.</p>}
      </Card>

      <Card>
        <div className="card-title"><h3>היסטוריית יומנים</h3></div>
        {journals.length ? (
          <div className="list">
            {journals.map((j) => (
              <button key={j.id} type="button" className="list-row" onClick={() => navigate(`#/journal/${j.id}/${j.lastStep || 1}`)}>
                <span className="grow">
                  <span className="ttl">{journalNumberText(j.journalNumber)}</span>
                  <span className="sub">{formatDate(j.startedAt)} · {JOURNAL_STATUS_LABEL[j.status]}</span>
                </span>
              </button>
            ))}
          </div>
        ) : <p className="muted small">אין עדיין יומנים ללקוח זה.</p>}
      </Card>

      <Card>
        <div className="card-title"><h3>תיבות האכלה ומפגעים חוזרים</h3></div>
        <p className="small">
          <span className="bold">מזיקים חוזרים: </span>
          {commonPests.length ? commonPests.map(pestName).join(', ') : '—'}
        </p>
        {stations.length ? (
          <ul className="small">
            {stations.map((b) => <li key={b.id}>{b.stationCode} · {b.location || '—'}</li>)}
          </ul>
        ) : <p className="muted small">לא תועדו תיבות האכלה.</p>}
        {photos.length > 0 && <p className="small">תמונות מצורפות: {photos.length}</p>}
      </Card>

      <Card>
        <div className="card-title"><h3>משימות פתוחות</h3></div>
        {tasks.length ? (
          <ul className="small">
            {tasks.map((t) => <li key={t.id}>{TASK_KIND_LABEL[t.kind]} · {t.title} · {formatDate(t.dueDate)}</li>)}
          </ul>
        ) : <p className="muted small">אין משימות פתוחות.</p>}
      </Card>

      <Card>
        <div className="card-title"><h3>תבנית לקוח</h3></div>
        <Notice kind="info">
          תבנית הלקוח שומרת פרטים קבועים בלבד. אצווה, תפוגה, תאריך, כמויות, ממצאים וחתימות
          אינם נשמרים בתבנית ויש למלא אותם בכל יומן מחדש.
        </Notice>
        {templates.length > 0 && (
          <ul className="small">{templates.map((t) => <li key={t.id}>{t.name}</li>)}</ul>
        )}
        <button
          type="button"
          className="btn btn-soft"
          onClick={() => {
            saveCustomerTemplate({
              name: `תבנית · ${customer.name}`,
              customerId: customer.id,
              siteId: sites[0]?.id,
              siteKind: sites[0]?.siteKind,
              fixedAreas: [],
              baitStationLocations: stations.map((b) => b.location).filter(Boolean),
              commonPestIds: commonPests,
              preferredMaterialId,
              accessInstructions: sites[0]?.accessNotes,
              frequencyDays: 90,
            });
            setSaved(true);
          }}
        >
          שמור כתבנית ללקוח
        </button>
        {saved && <p className="small mt-2">התבנית נשמרה.</p>}
      </Card>
    </>
  );
}
