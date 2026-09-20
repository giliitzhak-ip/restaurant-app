import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Plus, Trash2 } from 'lucide-react';
import { useApp } from '@/state/AppContext';
import { useToast } from '@/state/ToastContext';
import { Alert, EmptyState, PoisonNotice } from '@/components/Common';
import { SkeletonList } from '@/components/Skeleton';
import {
  generateRouteFromTemplate,
  listOrgMembers,
  listRouteTemplates,
  type OrgMember,
} from '@/lib/routes/repo';
import { saveTemplate } from '@/lib/routes/actions';
import { localDateIso } from '@/lib/routes/status';
import { ROUTE_KINDS, ROUTE_KIND_LABELS, type RouteKind } from '@/schema/routes';
import type { RouteTemplateRow, TemplateStop } from '@/lib/routes/types';
import { newUuid } from '@/lib/ids';
import { serverNow, serverNowIso } from '@/lib/time';

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/**
 * קווי אחזקה חוזרים.
 *
 * תבנית מגדירה רשימת לקוחות קבועה, סדר, תדירות ודגשים קבועים. יצירת
 * מסלול מתבנית מדלגת על לקוח שכבר יש לו ביקור פעיל באותו תאריך, כדי
 * שלא ייווצרו ביקורים כפולים.
 */
export function RouteTemplatesPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { profile, reference, syncEngine } = useApp();
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<RouteTemplateRow[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RouteTemplateRow | null>(null);
  const [generateDate, setGenerateDate] = useState(localDateIso(serverNow()));
  const [busy, setBusy] = useState(false);

  const isAdmin = profile?.role === 'owner' || profile?.role === 'manager';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await listRouteTemplates());
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void listOrgMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [load]);

  const clientsById = useMemo(
    () => new Map(reference.clients.map((client) => [client.id, client])),
    [reference.clients],
  );

  const blankTemplate = (): RouteTemplateRow => ({
    id: newUuid(),
    organizationId: profile?.organizationId ?? '',
    name: '',
    routeKind: 'maintenance_line',
    areaName: null,
    weekday: null,
    defaultStartTime: null,
    defaultTeamName: null,
    defaultVehicle: null,
    defaultAssigneeId: null,
    startPointAddress: null,
    startPointCoordinates: null,
    stops: [],
    notes: null,
    isActive: true,
    updatedAt: serverNowIso(),
  });

  const persist = async (template: RouteTemplateRow) => {
    setBusy(true);
    try {
      await saveTemplate(syncEngine, template);
      setTemplates((current) => {
        const exists = current.some((item) => item.id === template.id);
        return exists ? current.map((item) => (item.id === template.id ? template : item)) : [...current, template];
      });
      setEditing(null);
      showToast('קו האחזקה נשמר', 'success');
    } finally {
      setBusy(false);
    }
  };

  const generate = async (template: RouteTemplateRow) => {
    setBusy(true);
    try {
      const result = await generateRouteFromTemplate(template.id, generateDate, template.defaultAssigneeId);
      showToast(
        result.skipped > 0
          ? `נוצר מסלול עם ${result.created} תחנות. ${result.skipped} דולגו — כבר קיים להן ביקור באותו תאריך.`
          : `נוצר מסלול עם ${result.created} תחנות.`,
        'success',
      );
      navigate(`/routes/${result.routeId}`);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'יצירת המסלול נכשלה. יצירה מתבנית מחייבת חיבור לרשת.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const updateStop = (index: number, patch: Partial<TemplateStop>) => {
    setEditing((current) =>
      current
        ? {
            ...current,
            stops: current.stops.map((stop, position) => (position === index ? { ...stop, ...patch } : stop)),
          }
        : current,
    );
  };

  if (loading) return <SkeletonList rows={3} />;

  return (
    <>
      <PoisonNotice />

      <Alert kind="info" title="קו אחזקה קבוע">
        לדוגמה: „קו ירושלים – יום ראשון”. התבנית שומרת את רשימת הלקוחות, הסדר, התדירות, סוג הטיפול והדגשים
        הקבועים, ומאפשרת ליצור ממנה מסלול לכל יום, שבוע או חודש.
      </Alert>

      {isAdmin ? (
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={() => setEditing(blankTemplate())}>
            <Plus size={16} aria-hidden="true" /> קו אחזקה חדש
          </button>
        </div>
      ) : null}

      {editing ? (
        <section className="card">
          <h2>{editing.name || 'קו אחזקה חדש'}</h2>
          <div className="field">
            <label htmlFor="template-name">שם הקו</label>
            <input
              id="template-name"
              value={editing.name}
              onChange={(event) => setEditing({ ...editing, name: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="template-kind">סוג</label>
            <select
              id="template-kind"
              value={editing.routeKind}
              onChange={(event) => setEditing({ ...editing, routeKind: event.target.value as RouteKind })}
            >
              {ROUTE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {ROUTE_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="template-area">אזור</label>
            <input
              id="template-area"
              value={editing.areaName ?? ''}
              onChange={(event) => setEditing({ ...editing, areaName: event.target.value || null })}
            />
          </div>
          <div className="field">
            <label htmlFor="template-weekday">יום מועדף</label>
            <select
              id="template-weekday"
              value={editing.weekday === null ? '' : String(editing.weekday)}
              onChange={(event) =>
                setEditing({ ...editing, weekday: event.target.value === '' ? null : Number(event.target.value) })
              }
            >
              <option value="">ללא יום קבוע</option>
              {WEEKDAYS.map((day, index) => (
                <option key={day} value={index}>
                  יום {day}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="template-time">שעת יציאה</label>
            <input
              id="template-time"
              type="time"
              value={editing.defaultStartTime ?? ''}
              onChange={(event) => setEditing({ ...editing, defaultStartTime: event.target.value || null })}
            />
          </div>
          <div className="field">
            <label htmlFor="template-assignee">עובד קבוע</label>
            <select
              id="template-assignee"
              value={editing.defaultAssigneeId ?? ''}
              onChange={(event) => setEditing({ ...editing, defaultAssigneeId: event.target.value || null })}
            >
              <option value="">ללא</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="template-vehicle">רכב קבוע</label>
            <input
              id="template-vehicle"
              value={editing.defaultVehicle ?? ''}
              onChange={(event) => setEditing({ ...editing, defaultVehicle: event.target.value || null })}
            />
          </div>
          <div className="field">
            <label htmlFor="template-origin">נקודת יציאה</label>
            <input
              id="template-origin"
              value={editing.startPointAddress ?? ''}
              onChange={(event) => setEditing({ ...editing, startPointAddress: event.target.value || null })}
            />
          </div>

          <h3>לקוחות בקו</h3>
          {editing.stops.length === 0 ? <p className="muted small">עדיין לא נוספו לקוחות.</p> : null}
          <ol className="plain-list">
            {editing.stops.map((stop, index) => (
              <li key={`${stop.clientId}-${index}`} className="card card-inner">
                <div className="route-header-top">
                  <strong>
                    {index + 1}. {clientsById.get(stop.clientId)?.name ?? 'לקוח'}
                  </strong>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    aria-label={`הסרת ${clientsById.get(stop.clientId)?.name ?? 'הלקוח'} מהקו`}
                    onClick={() =>
                      setEditing({
                        ...editing,
                        stops: editing.stops
                          .filter((_, position) => position !== index)
                          .map((item, position) => ({ ...item, position: position + 1 })),
                      })
                    }
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="focus-item-controls">
                  <label className="field field-inline">
                    <span className="field-label">אתר</span>
                    <select
                      value={stop.clientSiteId ?? ''}
                      aria-label="אתר הלקוח בקו"
                      onChange={(event) => updateStop(index, { clientSiteId: event.target.value || null })}
                    >
                      <option value="">ללא אתר מסוים</option>
                      {reference.sites
                        .filter((site) => site.clientId === stop.clientId)
                        .map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="field field-inline">
                    <span className="field-label">סוג טיפול</span>
                    <input
                      value={stop.serviceType ?? ''}
                      aria-label="סוג הטיפול הקבוע"
                      onChange={(event) => updateStop(index, { serviceType: event.target.value || null })}
                    />
                  </label>
                  <label className="field field-inline">
                    <span className="field-label">תדירות (ימים)</span>
                    <input
                      type="number"
                      min={1}
                      value={stop.frequencyDays ?? ''}
                      aria-label="תדירות הטיפול בימים"
                      onChange={(event) =>
                        updateStop(index, { frequencyDays: event.target.value ? Number(event.target.value) : null })
                      }
                    />
                  </label>
                  <label className="field field-inline">
                    <span className="field-label">משך משוער (דק׳)</span>
                    <input
                      type="number"
                      min={1}
                      value={stop.estimatedDurationMinutes ?? ''}
                      aria-label="משך טיפול משוער בדקות"
                      onChange={(event) =>
                        updateStop(index, {
                          estimatedDurationMinutes: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                    />
                  </label>
                  <label className="field field-inline">
                    <span className="field-label">דגש קבוע</span>
                    <input
                      value={stop.standingFocus?.[0]?.title ?? ''}
                      aria-label="דגש קבוע ללקוח"
                      onChange={(event) =>
                        updateStop(index, {
                          standingFocus: event.target.value ? [{ title: event.target.value }] : [],
                        })
                      }
                    />
                  </label>
                </div>
              </li>
            ))}
          </ol>

          <div className="field">
            <label htmlFor="template-add-client">הוספת לקוח לקו</label>
            <select
              id="template-add-client"
              value=""
              onChange={(event) => {
                const clientId = event.target.value;
                if (!clientId) return;
                setEditing({
                  ...editing,
                  stops: [...editing.stops, { clientId, clientSiteId: null, position: editing.stops.length + 1 }],
                });
              }}
            >
              <option value="">בחירת לקוח</option>
              {reference.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void persist(editing)}
              disabled={busy || editing.name.trim().length < 2}
            >
              שמירת הקו
            </button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              ביטול
            </button>
          </div>
        </section>
      ) : null}

      {templates.length === 0 ? (
        <EmptyState>לא הוגדרו עדיין קווי אחזקה.</EmptyState>
      ) : (
        templates.map((template) => (
          <article className="card" key={template.id}>
            <div className="route-header-top">
              <div>
                <h3>{template.name}</h3>
                <p className="small muted">
                  {ROUTE_KIND_LABELS[template.routeKind]}
                  {template.areaName ? ` · ${template.areaName}` : ''}
                  {template.weekday !== null ? ` · יום ${WEEKDAYS[template.weekday]}` : ''}
                  {` · ${template.stops.length} לקוחות`}
                </p>
                <p className="small dim">
                  {members.find((member) => member.id === template.defaultAssigneeId)?.fullName ?? 'ללא עובד קבוע'}
                  {template.defaultVehicle ? ` · ${template.defaultVehicle}` : ''}
                </p>
              </div>
            </div>
            <div className="btn-row btn-row-compact">
              <label className="field field-inline">
                <span className="field-label">תאריך היעד</span>
                <input type="date" value={generateDate} onChange={(event) => setGenerateDate(event.target.value)} />
              </label>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void generate(template)} disabled={busy}>
                <CalendarPlus size={16} aria-hidden="true" /> יצירת מסלול מהתבנית
              </button>
              {isAdmin ? (
                <button type="button" className="btn btn-sm" onClick={() => setEditing(template)}>
                  עריכה
                </button>
              ) : null}
            </div>
          </article>
        ))
      )}
    </>
  );
}
