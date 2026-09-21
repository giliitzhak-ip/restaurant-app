import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Card, Field, Notice, Tag } from '../components/ui';
import { pestName } from '../data/pests';
import { NOT_ENTERED } from '../types';
import { rankedSearch } from '../lib/search';
import { formatDate } from '../lib/format';

export function MaterialsScreen() {
  const { state, labelFor } = useStore();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return state.materials;
    return rankedSearch(
      query,
      state.materials,
      (m) => ({
        primary: m.tradeName,
        secondary: [...m.aliases, ...m.activeIngredients.map((a) => a.name), m.registrationNumber],
      }),
      20,
    );
  }, [state.materials, query]);

  return (
    <>
      <Card>
        <div className="card-title"><h2>מאגר חומרים</h2></div>
        <Field label="חיפוש חומר" htmlFor="m-search" hint="שם מסחרי, חומר פעיל או מספר רישום.">
          <input id="m-search" type="search" placeholder="הקלד שם חומר…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        <Notice kind="warn" title="מצב נתוני התוויות">
          מינונים, אזהרות, הוראות ללקוח וזמני כניסה מחדש טרם הוזנו מהתוויות הרשמיות ומסומנים "{NOT_ENTERED}".
          יש להשלים אותם מהתווית העדכנית של כל תכשיר ורק אז לסמן אימות.
        </Notice>
      </Card>

      {results.map((m) => {
        const label = labelFor(m.id);
        const verified = label?.verificationStatus === 'verified';
        return (
          <Card key={m.id}>
            <div className="card-title">
              <h3>{m.tradeName}</h3>
              {verified ? <Tag kind="ok">מאומת</Tag> : <Tag kind="warn">מידע יושלם בהמשך</Tag>}
            </div>
            <p className="small">
              חומר פעיל: {m.activeIngredients.length
                ? m.activeIngredients.map((a) => `${a.name} ${a.concentration}`).join(' · ')
                : NOT_ENTERED}
            </p>
            <p className="small muted">
              מספר רישום: {m.registrationNumber} · תוארית: {m.formulation} ·
              תוקף רישום: {label?.registrationValidUntil ? formatDate(label.registrationValidUntil) : NOT_ENTERED}
            </p>
            <p className="small muted">
              מזיקים מורשים: {label?.approvedPestIds.length ? label.approvedPestIds.map(pestName).join(', ') : NOT_ENTERED}
            </p>
            <p className="small muted">
              זמן כניסה מחדש: {label?.reEntryHours === null
                ? 'לא חל (טיפול בפיתיון)'
                : typeof label?.reEntryHours === 'number' ? `${label.reEntryHours} שעות` : NOT_ENTERED}
            </p>
            {label?.reEntryNote && <p className="small muted">{label.reEntryNote}</p>}
            {label?.sourceUrl ? (
              <p className="small wrap-anywhere">
                תווית: <a href={label.sourceUrl} target="_blank" rel="noreferrer">{label.sourceUrl}</a>
              </p>
            ) : <p className="small muted">קישור לתווית: {NOT_ENTERED}</p>}

            <div className="section-title">תבניות טיפול</div>
            <ul className="small">
              {state.treatmentTemplates.filter((t) => t.materialId === m.id).map((t) => (
                <li key={t.id}>{t.name}</li>
              ))}
              {state.treatmentTemplates.every((t) => t.materialId !== m.id) && <li className="muted">אין תבניות לחומר זה.</li>}
            </ul>
          </Card>
        );
      })}

      {results.length === 0 && <Card><p className="muted">אין חומר תואם.</p></Card>}
    </>
  );
}
