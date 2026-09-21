import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Card, EmptyState, Field, Notice, Tag } from '../components/ui';
import { normalize } from '../lib/search';
import { pestName } from '../data/pests';

export function TemplatesScreen() {
  const { state, updateTreatmentTemplate, duplicateTreatmentTemplate, archiveTreatmentTemplate, archiveCustomerTemplate } = useStore();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'system' | 'customer'>('system');

  const treatment = useMemo(() => {
    const q = normalize(query);
    return state.treatmentTemplates.filter((t) => !q || normalize(t.name).includes(q));
  }, [state.treatmentTemplates, query]);

  const customerTemplates = useMemo(() => {
    const q = normalize(query);
    return state.customerTemplates.filter((t) => !q || normalize(t.name).includes(q));
  }, [state.customerTemplates, query]);

  return (
    <>
      <Card>
        <div className="chips mb-3" role="tablist" aria-label="סוגי תבניות">
          <button type="button" role="tab" className="chip" aria-selected={tab === 'system'} aria-pressed={tab === 'system'} onClick={() => setTab('system')}>
            תבניות חומרים
          </button>
          <button type="button" role="tab" className="chip" aria-selected={tab === 'customer'} aria-pressed={tab === 'customer'} onClick={() => setTab('customer')}>
            תבניות לקוחות
          </button>
        </div>
        <Field label="חיפוש תבנית" htmlFor="tpl-search">
          <input id="tpl-search" type="search" placeholder="שם תבנית…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>
      </Card>

      {tab === 'system' && treatment.map((t) => {
        const material = state.materials.find((m) => m.id === t.materialId);
        return (
          <Card key={t.id}>
            <div className="card-title">
              <h3>{t.name}</h3>
              {t.system && <Tag kind="muted">תבנית מערכת</Tag>}
              {t.archived && <Tag kind="error">בארכיון</Tag>}
            </div>
            <p className="small">
              חומר: {material?.tradeName ?? '—'} · מזיקים: {t.pestIds.map(pestName).join(', ') || '—'}
            </p>
            {t.conditionFields.length > 0 && (
              <p className="small muted">
                שדות מותנים: {t.conditionFields.map((f) => f.question).join(' · ')}
              </p>
            )}
            {t.requiresBaitStations && <p className="small muted">כולל תיעוד תיבות האכלה.</p>}
            {t.notes && <p className="small muted">{t.notes}</p>}

            <Field label="שם התבנית" htmlFor={`tname-${t.id}`}>
              <input
                id={`tname-${t.id}`}
                type="text"
                value={t.name}
                disabled={t.system}
                onChange={(e) => updateTreatmentTemplate(t.id, { name: e.target.value })}
              />
            </Field>
            {t.system && <p className="small muted">תבנית מערכת אינה ניתנת לעריכה. אפשר לשכפל ולערוך עותק.</p>}

            <div className="row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => duplicateTreatmentTemplate(t.id)}>שכפול</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => archiveTreatmentTemplate(t.id)}>
                {t.archived ? 'שחזר מארכיון' : 'העבר לארכיון'}
              </button>
            </div>
          </Card>
        );
      })}

      {tab === 'customer' && (
        <>
          <Card>
            <Notice kind="info" title="מה תבנית לקוח שומרת">
              פרטי לקוח וכתובת, סוג אתר, אזורים קבועים, מיקומי תיבות, מזיקים נפוצים, חומר מועדף,
              הוראות כניסה ותדירות מעקב. <span className="bold">אינה שומרת</span> אצווה, תפוגת אריזה,
              תאריך ושעה, כמויות בפועל, ממצאים נוכחיים או חתימות.
            </Notice>
          </Card>

          {customerTemplates.length === 0 ? (
            <Card>
              <EmptyState icon="⧉" title="אין עדיין תבניות לקוח. אפשר ליצור תבנית מתוך כרטיס לקוח." />
            </Card>
          ) : (
            customerTemplates.map((t) => {
              const customer = state.customers.find((c) => c.id === t.customerId);
              const material = state.materials.find((m) => m.id === t.preferredMaterialId);
              return (
                <Card key={t.id}>
                  <div className="card-title">
                    <h3>{t.name}</h3>
                    {t.archived && <Tag kind="error">בארכיון</Tag>}
                  </div>
                  <p className="small">
                    לקוח: {customer?.name ?? '—'} · מזיקים נפוצים: {t.commonPestIds.map(pestName).join(', ') || '—'}
                  </p>
                  <p className="small muted">
                    חומר מועדף: {material?.tradeName ?? '—'} · תדירות: {t.frequencyDays ? `${t.frequencyDays} ימים` : '—'}
                  </p>
                  {t.baitStationLocations.length > 0 && (
                    <p className="small muted">מיקומי תיבות: {t.baitStationLocations.join(', ')}</p>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => archiveCustomerTemplate(t.id)}>
                    {t.archived ? 'שחזר מארכיון' : 'העבר לארכיון'}
                  </button>
                </Card>
              );
            })
          )}
        </>
      )}
    </>
  );
}
