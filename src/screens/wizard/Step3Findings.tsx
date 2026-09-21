import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { Card, ChipGroup, Field, Notice } from '../../components/ui';
import { PESTS, SIGNS, AREAS } from '../../data/pests';
import { SEVERITY_LABEL } from '../../lib/format';
import { normalize } from '../../lib/search';
import type { Severity } from '../../types';
import type { StepProps } from './JournalWizard';

export function Step3Findings({ journalId }: StepProps) {
  const { state, updateJournal, setJournalPest, removeJournalPest, addAttachment, removeAttachment } = useStore();
  const journal = state.journals.find((j) => j.id === journalId)!;
  const selected = state.journalPests.filter((p) => p.journalId === journalId);
  const attachments = state.attachments.filter((a) => a.journalId === journalId);
  const [pestQuery, setPestQuery] = useState('');

  const visiblePests = useMemo(() => {
    const q = normalize(pestQuery);
    if (!q) return PESTS;
    return PESTS.filter(
      (p) => normalize(p.name).includes(q) || p.aliases.some((a) => normalize(a).includes(q)),
    );
  }, [pestQuery]);

  async function onFiles(files: FileList | null): Promise<void> {
    if (!files) return;
    for (const file of Array.from(files).slice(0, 6)) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      addAttachment({ journalId, kind: 'photo', name: file.name, dataUrl });
    }
  }

  return (
    <>
      <Card>
        <div className="card-title"><h2>ניטור וממצאים</h2></div>

        <Field label="חיפוש מזיק" htmlFor="pest-search" hint="אפשר להקליד בעברית או באנגלית.">
          <input
            id="pest-search"
            type="search"
            placeholder="הקלד שם מזיק…"
            value={pestQuery}
            onChange={(e) => setPestQuery(e.target.value)}
          />
        </Field>

        <div className="chips" role="group" aria-label="בחירת מזיקים">
          {visiblePests.map((pest) => {
            const on = selected.some((p) => p.pestId === pest.id);
            return (
              <button
                key={pest.id}
                type="button"
                className="chip"
                aria-pressed={on}
                onClick={() => (on ? removeJournalPest(journalId, pest.id) : setJournalPest(journalId, pest.id))}
              >
                {pest.name}
              </button>
            );
          })}
          {visiblePests.length === 0 && <span className="muted small">אין מזיק תואם. אפשר לבחור "אחר".</span>}
        </div>

        {selected.length === 0 && (
          <Notice kind="warn">לא נבחר מזיק. אפשר להמשיך ולשמור טיוטה, אך יומן שהושלם אמור לכלול ממצא.</Notice>
        )}
      </Card>

      {selected.map((jp) => {
        const pest = PESTS.find((p) => p.id === jp.pestId);
        return (
          <Card key={jp.id}>
            <div className="card-title"><h3>{pest?.name ?? jp.pestId}</h3></div>

            <ChipGroup<Severity>
              label="רמת נגיעות"
              options={(Object.keys(SEVERITY_LABEL) as Severity[]).map((k) => ({ value: k, label: SEVERITY_LABEL[k] }))}
              value={jp.severity}
              onChange={(v) => setJournalPest(journalId, jp.pestId, { severity: v[0] })}
            />

            <ChipGroup
              label="אזורים שבהם נמצאה פעילות"
              multiple
              options={AREAS.map((a) => ({ value: a, label: a }))}
              value={jp.areas}
              onChange={(v) => setJournalPest(journalId, jp.pestId, { areas: v })}
            />

            <ChipGroup
              label="סימנים שנמצאו"
              multiple
              options={SIGNS.map((s) => ({ value: s, label: s }))}
              value={jp.signs}
              onChange={(v) => setJournalPest(journalId, jp.pestId, { signs: v })}
            />

            <Field label="מקור משוער למפגע" htmlFor={`src-${jp.id}`}>
              <input
                id={`src-${jp.id}`}
                type="text"
                value={jp.suspectedSource ?? ''}
                onChange={(e) => setJournalPest(journalId, jp.pestId, { suspectedSource: e.target.value })}
              />
            </Field>
          </Card>
        );
      })}

      <Card>
        <div className="card-title"><h3>תמונות והערות מקצועיות</h3></div>

        <Field label="הוספת תמונות" htmlFor="photos" hint="התמונות נשמרות במכשיר ומצורפות ליומן.">
          <input id="photos" type="file" accept="image/*" multiple onChange={(e) => void onFiles(e.target.files)} />
        </Field>

        {attachments.length > 0 && (
          <div className="chips mb-3">
            {attachments.map((a) => (
              <span key={a.id} className="tag tag-muted">
                {a.name}
                <button
                  type="button"
                  className="icon-btn"
                  style={{ minWidth: 26, minHeight: 26, border: 'none', background: 'transparent', color: 'inherit' }}
                  aria-label={`הסר את ${a.name}`}
                  onClick={() => removeAttachment(a.id)}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <Field label="הערות מקצועיות" htmlFor="findings-notes">
          <textarea
            id="findings-notes"
            value={journal.findingsNotes ?? ''}
            onChange={(e) => updateJournal(journalId, { findingsNotes: e.target.value })}
          />
        </Field>
      </Card>
    </>
  );
}
