import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Check, Plus, Trash2 } from 'lucide-react';
import { useApp } from '@/state/AppContext';
import { useToast } from '@/state/ToastContext';
import { Alert } from '@/components/Common';
import {
  FOCUS_CATEGORIES,
  FOCUS_CATEGORY_LABELS,
  FOCUS_IMPORTANCES,
  FOCUS_IMPORTANCE_LABELS,
  FOCUS_SOURCE_LABELS,
  FOCUS_STATUSES,
  FOCUS_STATUS_LABELS,
  type FocusCategory,
  type FocusImportance,
  type FocusStatus,
} from '@/schema/routes';
import { removeFocusItem, saveFocusItem } from '@/lib/routes/actions';
import { listVisitPhotos, storeVisitPhoto } from '@/lib/routes/photos';
import type { FocusItemRow, RouteVisitRow } from '@/lib/routes/types';
import { newUuid } from '@/lib/ids';
import { serverNowIso } from '@/lib/time';
import { listOrgMembers, type OrgMember } from '@/lib/routes/repo';

/**
 * „דגשים לביקור הנוכחי”.
 *
 * הצעות אוטומטיות מוצגות בנפרד וממתינות לאישור: הן נוצרות רק מנתונים
 * שקיימים במערכת (יומן קודם, משימה פתוחה, תחנת האכלה, תלונה), ואין
 * להן תוקף עד שהמדביר מאשר, עורך או מוחק אותן.
 */
export function FocusPanel({
  visit,
  items,
  onChange,
}: {
  visit: RouteVisitRow;
  items: FocusItemRow[];
  onChange: (items: FocusItemRow[]) => void;
}): React.JSX.Element {
  const { profile, syncEngine } = useApp();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftCategory, setDraftCategory] = useState<FocusCategory>('note');
  const [draftDetails, setDraftDetails] = useState('');
  const [draftInternal, setDraftInternal] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string[]>>({});
  const [members, setMembers] = useState<OrgMember[]>([]);

  useEffect(() => {
    void listOrgMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  const refreshPreviews = useCallback(async () => {
    const photos = await listVisitPhotos(visit.id);
    const map: Record<string, string[]> = {};
    for (const photo of photos) {
      const key = photo.focusItemId ?? 'visit';
      (map[key] ??= []).push(URL.createObjectURL(photo.blob));
    }
    setPreviews((previous) => {
      for (const urls of Object.values(previous)) urls.forEach((url) => URL.revokeObjectURL(url));
      return map;
    });
  }, [visit.id]);

  useEffect(() => {
    void refreshPreviews();
    return () => {
      setPreviews((previous) => {
        for (const urls of Object.values(previous)) urls.forEach((url) => URL.revokeObjectURL(url));
        return {};
      });
    };
  }, [refreshPreviews]);

  const pending = useMemo(() => items.filter((item) => !item.approved), [items]);
  const approved = useMemo(
    () => items.filter((item) => item.approved).sort((a, b) => a.position - b.position),
    [items],
  );

  const persist = async (next: FocusItemRow[], changed: FocusItemRow) => {
    onChange(next);
    await saveFocusItem(syncEngine, visit.routeId, next, changed);
  };

  const update = async (item: FocusItemRow, patch: Partial<FocusItemRow>) => {
    const updated = { ...item, ...patch, updatedAt: serverNowIso() };
    await persist(
      items.map((current) => (current.id === item.id ? updated : current)),
      updated,
    );
  };

  const approve = async (item: FocusItemRow) => {
    await update(item, { approved: true, approvedAt: serverNowIso() });
    showToast('הדגש אושר ונכנס לרשימת הביקור', 'success');
  };

  const drop = async (item: FocusItemRow) => {
    const next = items.filter((current) => current.id !== item.id);
    onChange(next);
    await removeFocusItem(syncEngine, visit.routeId, next, item);
    showToast('הדגש הוסר', 'success');
  };

  const add = async () => {
    if (!profile || draftTitle.trim().length === 0) return;
    const item: FocusItemRow = {
      id: newUuid(),
      organizationId: profile.organizationId,
      visitId: visit.id,
      category: draftCategory,
      title: draftTitle.trim(),
      details: draftDetails.trim() || null,
      siteLocation: null,
      importance: 'normal',
      status: 'to_check',
      source: 'manual',
      sourceReference: {},
      approved: true,
      approvedAt: serverNowIso(),
      assigneeId: null,
      dueDate: null,
      isInternal: draftInternal,
      attachmentId: null,
      position: approved.length + 1,
      updatedAt: serverNowIso(),
    };
    await persist([...items, item], item);
    setDraftTitle('');
    setDraftDetails('');
    setDraftInternal(false);
    setAdding(false);
    showToast('הדגש נוסף', 'success');
  };

  const attachPhoto = async (item: FocusItemRow, file: File) => {
    try {
      await storeVisitPhoto(visit.id, file, item.id);
      await refreshPreviews();
      showToast(
        navigator.onLine ? 'התמונה נשמרה ותועלה' : 'התמונה נשמרה במכשיר ותועלה כשהחיבור יחזור',
        'success',
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'שמירת התמונה נכשלה', 'error');
    }
  };

  const renderItem = (item: FocusItemRow) => (
    <article className={`focus-item importance-${item.importance}`} key={item.id} data-testid={`focus-${item.id}`}>
      <div className="focus-item-head">
        <h4>{item.title}</h4>
        <span className="tag">{FOCUS_CATEGORY_LABELS[item.category]}</span>
        {item.isInternal ? <span className="tag tag-danger">פנימי — לא מוצג ללקוח</span> : null}
      </div>
      {item.details ? <p className="small">{item.details}</p> : null}
      <p className="small dim">{FOCUS_SOURCE_LABELS[item.source]}</p>

      <div className="focus-item-controls">
        <label className="field field-inline">
          <span className="field-label">סטטוס</span>
          <select
            value={item.status}
            aria-label={`סטטוס הדגש ${item.title}`}
            onChange={(event) => void update(item, { status: event.target.value as FocusStatus })}
          >
            {FOCUS_STATUSES.map((status) => (
              <option key={status} value={status}>
                {FOCUS_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="field field-inline">
          <span className="field-label">חשיבות</span>
          <select
            value={item.importance}
            aria-label={`חשיבות הדגש ${item.title}`}
            onChange={(event) => void update(item, { importance: event.target.value as FocusImportance })}
          >
            {FOCUS_IMPORTANCES.map((importance) => (
              <option key={importance} value={importance}>
                {FOCUS_IMPORTANCE_LABELS[importance]}
              </option>
            ))}
          </select>
        </label>

        <label className="field field-inline">
          <span className="field-label">אחראי</span>
          <select
            value={item.assigneeId ?? ''}
            aria-label={`אחראי לדגש ${item.title}`}
            onChange={(event) => void update(item, { assigneeId: event.target.value || null })}
          >
            <option value="">ללא</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName}
              </option>
            ))}
          </select>
        </label>

        <label className="field field-inline">
          <span className="field-label">תאריך יעד</span>
          <input
            type="date"
            value={item.dueDate ?? ''}
            aria-label={`תאריך יעד לדגש ${item.title}`}
            onChange={(event) => void update(item, { dueDate: event.target.value || null })}
          />
        </label>

        <label className="field field-inline">
          <span className="field-label">מיקום באתר</span>
          <input
            type="text"
            value={item.siteLocation ?? ''}
            aria-label={`מיקום באתר לדגש ${item.title}`}
            onChange={(event) => void update(item, { siteLocation: event.target.value || null })}
          />
        </label>
      </div>

      <div className="btn-row btn-row-compact">
        <label className="btn btn-sm">
          <Camera size={16} aria-hidden="true" /> צירוף תמונה
          <input
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void attachPhoto(item, file);
              event.target.value = '';
            }}
          />
        </label>
        <button type="button" className="btn btn-sm btn-danger" onClick={() => void drop(item)}>
          <Trash2 size={16} aria-hidden="true" /> מחיקה
        </button>
      </div>

      {(previews[item.id] ?? []).length > 0 ? (
        <div className="focus-photos">
          {(previews[item.id] ?? []).map((url) => (
            <img key={url} src={url} alt={`תמונה שצורפה לדגש ${item.title}`} />
          ))}
        </div>
      ) : null}
    </article>
  );

  return (
    <section className="card focus-panel" aria-labelledby="focus-heading">
      <h2 id="focus-heading">דגשים לביקור הנוכחי</h2>

      {pending.length > 0 ? (
        <>
          <Alert kind="warning" title={`${pending.length} הצעות ממתינות לאישור`}>
            ההצעות נוצרו מהנתונים הקיימים בלבד — היומן האחרון, משימות פתוחות, תחנות האכלה ותלונות. יש לאשר,
            לערוך או למחוק כל הצעה לפני תחילת הביקור.
          </Alert>
          <div className="focus-list">
            {pending.map((item) => (
              <article className="focus-item is-suggestion" key={item.id} data-testid={`suggestion-${item.id}`}>
                <div className="focus-item-head">
                  <h4>{item.title}</h4>
                  <span className="tag">{FOCUS_CATEGORY_LABELS[item.category]}</span>
                </div>
                {item.details ? <p className="small">{item.details}</p> : null}
                <p className="small dim">{FOCUS_SOURCE_LABELS[item.source]}</p>
                <div className="btn-row btn-row-compact">
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => void approve(item)}>
                    <Check size={16} aria-hidden="true" /> אישור הדגש
                  </button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => void drop(item)}>
                    מחיקה
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}

      {approved.length === 0 ? (
        <p className="muted small">אין עדיין דגשים מאושרים לביקור הזה.</p>
      ) : (
        <div className="focus-list">{approved.map(renderItem)}</div>
      )}

      {adding ? (
        <div className="card card-inner">
          <div className="field">
            <label htmlFor="focus-title">כותרת הדגש</label>
            <input id="focus-title" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="focus-category">סוג</label>
            <select
              id="focus-category"
              value={draftCategory}
              onChange={(event) => setDraftCategory(event.target.value as FocusCategory)}
            >
              {FOCUS_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {FOCUS_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="focus-details">פירוט</label>
            <textarea id="focus-details" rows={2} value={draftDetails} onChange={(event) => setDraftDetails(event.target.value)} />
          </div>
          <label className="check-row">
            <input type="checkbox" checked={draftInternal} onChange={(event) => setDraftInternal(event.target.checked)} />
            <span>הערה פנימית לצוות — לא תוצג ללקוח ולא תיכנס ל-PDF של היומן</span>
          </label>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => void add()} disabled={!draftTitle.trim()}>
              הוספה
            </button>
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden="true" /> הוספת דגש
        </button>
      )}
    </section>
  );
}
