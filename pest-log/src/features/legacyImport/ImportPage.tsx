import { useCallback, useState } from 'react';
import { useApp } from '@/state/AppContext';
import { Alert, EmptyState, PoisonNotice } from '@/components/Common';
import { deleteDraft, getMeta, putDraft, putMeta } from '@/lib/db/idb';
import { idempotencyKey, newUuid } from '@/lib/ids';
import {
  excludeAlreadyImported,
  scanLegacyStorage,
  type LegacyRecord,
  type LegacyScanResult,
} from './parseLegacy';

/**
 * ייבוא בטוח מהגרסה המקומית הקודמת.
 * שלושה שלבים: סריקה → תצוגה מקדימה → ייבוא, עם אפשרות ביטול (rollback)
 * שמוחקת בדיוק את מה שנוצר בייבוא האחרון.
 */

const IMPORTED_FINGERPRINTS_KEY = 'legacyImportedFingerprints';
const LAST_IMPORT_KEY = 'legacyLastImport';

interface LastImport {
  at: string;
  draftIds: string[];
  fingerprints: string[];
}

export function ImportPage(): React.JSX.Element {
  const { profile } = useApp();
  const [scan, setScan] = useState<LegacyScanResult | null>(null);
  const [fresh, setFresh] = useState<LegacyRecord[]>([]);
  const [duplicates, setDuplicates] = useState<LegacyRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastImport, setLastImport] = useState<LastImport | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const runScan = useCallback(async () => {
    setMessage(null);
    try {
      // זו הנקודה היחידה במערכת שקוראת מ-localStorage (ראו eslint.config.js).
      const result = scanLegacyStorage(window.localStorage);
      const imported = (await getMeta<string[]>(IMPORTED_FINGERPRINTS_KEY)) ?? [];
      const split = excludeAlreadyImported(result.records, new Set(imported));
      setScan(result);
      setFresh(split.fresh);
      setDuplicates(split.duplicates);
      setSelected(new Set(split.fresh.map((record) => record.fingerprint)));
      setLastImport((await getMeta<LastImport>(LAST_IMPORT_KEY)) ?? null);

      if (result.records.length === 0) {
        setMessage({
          kind: 'info',
          text: 'לא נמצאו נתונים מהגרסה המקומית הקודמת בדפדפן הזה. יש לפתוח את המערכת מאותו דפדפן שבו עבדו עם הקובץ המקומי.',
        });
      }
    } catch (error) {
      setMessage({ kind: 'error', text: `הסריקה נכשלה: ${error instanceof Error ? error.message : String(error)}` });
    }
  }, []);

  const toggle = (fingerprint: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(fingerprint)) next.delete(fingerprint);
      else next.add(fingerprint);
      return next;
    });
  };

  const runImport = async () => {
    if (!profile) return;
    setBusy(true);
    setMessage(null);
    const createdIds: string[] = [];
    const createdFingerprints: string[] = [];

    try {
      for (const record of fresh) {
        if (!selected.has(record.fingerprint)) continue;
        const id = newUuid();
        await putDraft({
          id,
          organizationId: profile.organizationId,
          content: {
            ...record.content,
            legacy: { sourceKey: record.sourceKey, fingerprint: record.fingerprint, unmapped: record.unmapped },
          },
          serverVersion: null,
          idempotencyKey: idempotencyKey('upsert_draft', id, 'legacy'),
          updatedAt: new Date().toISOString(),
          syncedAt: null,
          syncState: 'local',
          lastError: null,
          syncedFingerprint: null,
          readOnly: false,
          serialNumber: null,
          status: 'draft',
        });
        createdIds.push(id);
        createdFingerprints.push(record.fingerprint);
      }

      const previous = (await getMeta<string[]>(IMPORTED_FINGERPRINTS_KEY)) ?? [];
      await putMeta(IMPORTED_FINGERPRINTS_KEY, [...previous, ...createdFingerprints]);
      const record: LastImport = {
        at: new Date().toISOString(),
        draftIds: createdIds,
        fingerprints: createdFingerprints,
      };
      await putMeta(LAST_IMPORT_KEY, record);
      setLastImport(record);

      setMessage({
        kind: 'success',
        text: `יובאו ${createdIds.length} יומנים כטיוטות. הנתונים המקוריים ב-localStorage לא נמחקו.`,
      });
      await runScan();
    } catch (error) {
      setMessage({ kind: 'error', text: `הייבוא נכשל: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setBusy(false);
    }
  };

  const rollback = async () => {
    if (!lastImport) return;
    setBusy(true);
    try {
      for (const id of lastImport.draftIds) await deleteDraft(id);
      const previous = (await getMeta<string[]>(IMPORTED_FINGERPRINTS_KEY)) ?? [];
      await putMeta(
        IMPORTED_FINGERPRINTS_KEY,
        previous.filter((fingerprint) => !lastImport.fingerprints.includes(fingerprint)),
      );
      await putMeta(LAST_IMPORT_KEY, null);
      setLastImport(null);
      setMessage({ kind: 'success', text: `הייבוא בוטל. ${lastImport.draftIds.length} טיוטות הוסרו.` });
      await runScan();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PoisonNotice />

      <section className="card">
        <h2>ייבוא מהגרסה המקומית הקודמת</h2>
        <p className="card-sub">
          המערכת סורקת את אחסון הדפדפן המקומי (localStorage) ומאתרת יומנים שנשמרו בגרסה הקודמת.
          הנתונים המקוריים אינם נמחקים, וניתן לבטל את הייבוא.
        </p>

        {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}

        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={() => void runScan()} disabled={busy}>
            סריקת הנתונים המקומיים
          </button>
          {lastImport ? (
            <button type="button" className="btn btn-danger" onClick={() => void rollback()} disabled={busy}>
              ביטול הייבוא האחרון ({lastImport.draftIds.length})
            </button>
          ) : null}
        </div>
      </section>

      {scan ? (
        <section className="card">
          <h3>תצוגה מקדימה</h3>
          <p className="card-sub">
            נמצאו {scan.records.length} רשומות · {fresh.length} חדשות · {duplicates.length} כבר יובאו בעבר
          </p>

          {scan.errors.length > 0 ? (
            <Alert kind="warning" title="רשומות שלא ניתן היה לפענח">
              <ul>
                {scan.errors.map((error) => (
                  <li key={error.key}>
                    <span className="mono">{error.key}</span> — {error.message}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {fresh.length === 0 ? (
            <EmptyState>אין רשומות חדשות לייבוא.</EmptyState>
          ) : (
            <>
              {fresh.map((record) => (
                <div className="repeat-item" key={record.fingerprint}>
                  <div className="checkbox-row">
                    <input
                      id={`import-${record.fingerprint}`}
                      type="checkbox"
                      checked={selected.has(record.fingerprint)}
                      onChange={() => toggle(record.fingerprint)}
                    />
                    <label htmlFor={`import-${record.fingerprint}`}>
                      {record.summary}
                      <div className="small dim mono">{record.sourceKey}</div>
                    </label>
                  </div>

                  {Object.keys(record.unmapped).length > 0 ? (
                    <details>
                      <summary className="small muted">
                        {Object.keys(record.unmapped).length} שדות שלא מופו אוטומטית (יישמרו ביומן)
                      </summary>
                      <pre className="small mono" style={{ whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(record.unmapped, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ))}

              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => void runImport()}
                disabled={busy || selected.size === 0}
              >
                ייבוא {selected.size} רשומות כטיוטות
              </button>
            </>
          )}

          {duplicates.length > 0 ? (
            <Alert kind="info" title={`${duplicates.length} רשומות דולגו`}>
              רשומות אלה כבר יובאו בעבר ולא ייווצרו שוב, כדי למנוע כפילויות.
            </Alert>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
