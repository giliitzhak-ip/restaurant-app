import { useCallback, useEffect, useState } from 'react';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { useApp } from '@/state/AppContext';
import { useToast } from '@/state/ToastContext';
import { Alert } from '@/components/Common';
import {
  addSiteStations,
  listSiteStations,
  removeSiteStation,
  siteKeyOf,
  updateSiteStation,
  type SiteStationRow,
} from '@/lib/legacy/repo';
import {
  BAIT_STATION_STATUS_LABELS,
  SITE_STATION_TYPE_COLORS,
  SITE_STATION_TYPE_LABELS,
  type SiteStationType,
} from '@/schema/sections';
import { getArray, getString } from '@/lib/paths';
import type { DraftApi } from '@/state/useDraft';

/**
 * מאגר תחנות ההאכלה והניטור של האתר — הועבר מהגרסה הקודמת.
 *
 * התחנה מוגדרת פעם אחת לאתר ונשארת בין ביקורים; בכל יומן נרשם רק מצבה
 * באותו ביקור. כך אין צורך להקליד מחדש 20 תחנות בכל טיפול, והמספור
 * נשמר יציב לאורך זמן.
 */
export function SiteStationsSection({ draft }: { draft: DraftApi }): React.JSX.Element | null {
  const { profile, syncEngine } = useApp();
  const { showToast } = useToast();
  const { content, setField, appendTo, readOnly } = draft;

  const siteId = getString(content, 'location.siteId') || null;
  const clientName = getString(content, 'orderer.name');
  const placeText = [
    getString(content, 'location.street'),
    getString(content, 'location.houseNumber'),
    getString(content, 'location.city'),
    getString(content, 'location.siteLabel'),
  ]
    .filter(Boolean)
    .join(' ');
  const siteKey = siteId ? null : clientName && placeText ? siteKeyOf(clientName, placeText) : null;

  const [stations, setStations] = useState<SiteStationRow[]>([]);
  const [managing, setManaging] = useState(false);
  const [newType, setNewType] = useState<SiteStationType>('bait_poison');
  const [newLocation, setNewLocation] = useState('');
  const [newCount, setNewCount] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!siteId && !siteKey) {
      setStations([]);
      return;
    }
    void listSiteStations(siteId, siteKey)
      .then(setStations)
      .catch(() => setStations([]));
  }, [siteId, siteKey]);

  const visitStations = getArray(content, 'baitStations');

  /** מוצא את שורת הביקור של תחנה מהמאגר, או יוצר אותה. */
  const indexOfVisitRow = useCallback(
    (station: SiteStationRow): number =>
      visitStations.findIndex(
        (row) => (row as Record<string, unknown>).siteStationId === station.id,
      ),
    [visitStations],
  );

  const setStatus = (station: SiteStationRow, status: string) => {
    const index = indexOfVisitRow(station);
    if (index === -1) {
      appendTo('baitStations', {
        siteStationId: station.id,
        stationNumber: String(station.stationNumber),
        stationType: station.stationType,
        locationDescription: station.locationDescription ?? SITE_STATION_TYPE_LABELS[station.stationType],
        status,
      });
      return;
    }
    setField(`baitStations.${index}.status`, status);
  };

  const statusOf = (station: SiteStationRow): string => {
    const index = indexOfVisitRow(station);
    return index === -1 ? '' : getString(content, `baitStations.${index}.status`);
  };

  const markAllIntact = () => {
    for (const station of stations) {
      if (!statusOf(station)) setStatus(station, 'intact');
    }
    showToast('כל התחנות סומנו כשלמות — יש לוודא שזה המצב בפועל', 'success');
  };

  const add = async () => {
    if (!profile || (!siteId && !siteKey)) return;
    setBusy(true);
    try {
      const next = await addSiteStations(syncEngine, stations, {
        organizationId: profile.organizationId,
        clientSiteId: siteId,
        siteKey,
        stationType: newType,
        locationDescription: newLocation.trim(),
        count: newCount,
      });
      setStations(next);
      setNewLocation('');
      setNewCount(1);
      showToast(newCount > 1 ? `${newCount} תחנות נוספו לאתר` : 'תחנה נוספה לאתר', 'success');
    } finally {
      setBusy(false);
    }
  };

  const rename = async (station: SiteStationRow, location: string) => {
    const next = await updateSiteStation(syncEngine, stations, {
      ...station,
      locationDescription: location || null,
    });
    setStations(next);
  };

  const remove = async (station: SiteStationRow) => {
    const confirmed = globalThis.confirm(
      `להסיר את תחנה ${station.stationNumber} מהאתר? המספור של שאר התחנות לא ישתנה, ויומנים קודמים יישארו כפי שהם.`,
    );
    if (!confirmed) return;
    const next = await removeSiteStation(syncEngine, stations, station);
    setStations(next);
    showToast('התחנה הוסרה מהמאגר', 'success');
  };

  if (!siteId && !siteKey) {
    return (
      <section className="card">
        <h2>תחנות האכלה וניטור באתר</h2>
        <p className="card-sub">
          כדי לנהל מאגר תחנות קבוע לאתר, יש להשלים תחילה את שם המזמין ואת פרטי המקום בשלבים 1 ו-2.
        </p>
      </section>
    );
  }

  const checked = stations.filter((station) => {
    const status = statusOf(station);
    return status && status !== '';
  }).length;

  return (
    <section className="card" aria-labelledby="site-stations">
      <div className="route-header-top">
        <div>
          <h2 id="site-stations">תחנות האכלה וניטור באתר</h2>
          <p className="card-sub">
            התחנות מוגדרות פעם אחת לאתר. בכל ביקור נרשם רק מצבן.
          </p>
        </div>
        <span className={`tag ${checked < stations.length ? 'tag-warning' : 'tag-brand'}`}>
          {checked}/{stations.length}
        </span>
      </div>

      {stations.length === 0 ? (
        <Alert kind="info" title="לאתר הזה עדיין לא הוגדרו תחנות">
          אפשר להגדיר אותן פעם אחת, והן יופיעו בכל ביקור באתר.
        </Alert>
      ) : (
        <>
          <div className="btn-row btn-row-compact">
            <button type="button" className="btn btn-sm" disabled={readOnly} onClick={markAllIntact}>
              סימון הכל כשלמות
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setManaging((value) => !value)}>
              <Settings2 size={16} aria-hidden="true" /> ניהול התחנות
            </button>
          </div>

          {stations.map((station) => (
            <div className="station-row" key={station.id}>
              <span
                className="station-number"
                style={{ background: SITE_STATION_TYPE_COLORS[station.stationType] }}
                aria-hidden="true"
              >
                {station.stationNumber}
              </span>
              <div className="station-main">
                <strong>{station.locationDescription || SITE_STATION_TYPE_LABELS[station.stationType]}</strong>
                <span className="small muted">{SITE_STATION_TYPE_LABELS[station.stationType]}</span>
              </div>
              <label className="field field-inline">
                <span className="field-label">
                  מצב תחנה {station.stationNumber}
                </span>
                <select
                  value={statusOf(station)}
                  disabled={readOnly}
                  aria-label={`מצב תחנה ${station.stationNumber} — ${SITE_STATION_TYPE_LABELS[station.stationType]}`}
                  onChange={(event) => setStatus(station, event.target.value)}
                >
                  <option value="">טרם נבדקה</option>
                  {Object.entries(BAIT_STATION_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}

          {checked < stations.length ? (
            <p className="small dim">{stations.length - checked} תחנות עדיין לא תועדו בביקור הזה.</p>
          ) : (
            <p className="small dim">כל התחנות תועדו.</p>
          )}
        </>
      )}

      {managing || stations.length === 0 ? (
        <div className="card card-inner">
          <h3>הגדרת תחנות לאתר</h3>

          {stations.map((station) => (
            <div className="station-row" key={`manage-${station.id}`}>
              <span
                className="station-number"
                style={{ background: SITE_STATION_TYPE_COLORS[station.stationType] }}
                aria-hidden="true"
              >
                {station.stationNumber}
              </span>
              <label className="field field-inline station-main">
                <span className="field-label">מיקום תחנה {station.stationNumber}</span>
                <input
                  type="text"
                  defaultValue={station.locationDescription ?? ''}
                  placeholder="מחסן צפוני, פינת מטבח…"
                  onBlur={(event) => void rename(station, event.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                aria-label={`הסרת תחנה ${station.stationNumber}`}
                onClick={() => void remove(station)}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}

          <div className="field">
            <label htmlFor="station-type">סוג התחנה</label>
            <select
              id="station-type"
              value={newType}
              onChange={(event) => setNewType(event.target.value as SiteStationType)}
            >
              {(Object.keys(SITE_STATION_TYPE_LABELS) as SiteStationType[]).map((type) => (
                <option key={type} value={type}>
                  {SITE_STATION_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="station-location">מיקום</label>
              <input
                id="station-location"
                type="text"
                value={newLocation}
                onChange={(event) => setNewLocation(event.target.value)}
                placeholder="מחסן צפוני"
              />
            </div>
            <div className="field">
              <label htmlFor="station-count">כמה תחנות</label>
              <input
                id="station-count"
                type="number"
                min={1}
                max={60}
                value={newCount}
                onChange={(event) => setNewCount(Number(event.target.value) || 1)}
              />
            </div>
          </div>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void add()}>
            <Plus size={16} aria-hidden="true" /> הוספה למאגר האתר
          </button>
        </div>
      ) : null}
    </section>
  );
}
