import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/state/AppContext';
import { Alert, EmptyState, PoisonNotice } from '@/components/Common';
import { SkeletonList } from '@/components/Skeleton';
import { listBaitStations, type BaitStationRow } from '@/lib/repo';
import { BAIT_STATION_STATUS_LABELS } from '@/schema/sections';
import { formatDateTimeHe } from '@/lib/time';

/** תווית רמת אכילה. */
const CONSUMPTION_LABELS: Record<string, string> = {
  none: 'ללא',
  partial: 'חלקית',
  full: 'מלאה',
};

/** תחנות האכלה — מצבן העדכני לפי האתרים. */
export function BaitStationsPage(): React.JSX.Element {
  const { reference } = useApp();
  const [stations, setStations] = useState<BaitStationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStations(await listBaitStations());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const siteLabel = useCallback(
    (siteId: string | null) => reference.sites.find((site) => site.id === siteId)?.label ?? 'ללא אתר משויך',
    [reference.sites],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return stations;
    return stations.filter(
      (station) =>
        station.stationNumber.toLowerCase().includes(needle) ||
        station.locationDescription.toLowerCase().includes(needle) ||
        siteLabel(station.clientSiteId).toLowerCase().includes(needle),
    );
  }, [stations, query, siteLabel]);

  const grouped = useMemo(() => {
    const map = new Map<string, BaitStationRow[]>();
    for (const station of visible) {
      const key = siteLabel(station.clientSiteId);
      const list = map.get(key);
      if (list) list.push(station);
      else map.set(key, [station]);
    }
    return Array.from(map.entries());
  }, [visible, siteLabel]);

  return (
    <>
      <PoisonNotice />

      <section className="card">
        <h2>תחנות האכלה</h2>
        <p className="card-sub">
          מצב התחנות כפי שתועד ביומנים ובאתרים. תיעוד תחנה בביקור מתבצע בשלב 4 של האשף.
        </p>

        {error ? (
          <Alert kind="error">
            {error}
            <div className="btn-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-sm" onClick={() => void load()}>
                נסה שוב
              </button>
            </div>
          </Alert>
        ) : null}

        <div className="field">
          <label htmlFor="stations-search">חיפוש</label>
          <input
            id="stations-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="מספר תחנה, מיקום או אתר"
          />
        </div>

        {loading ? <SkeletonList rows={3} /> : null}

        {!loading && visible.length === 0 ? (
          <EmptyState>
            {stations.length === 0 ? 'טרם תועדו תחנות האכלה.' : 'לא נמצאו תחנות מתאימות.'}
          </EmptyState>
        ) : null}

        {grouped.map(([site, list]) => (
          <div key={site} style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.4rem' }}>
              {site} <span className="small dim">({list.length})</span>
            </h3>
            {list.map((station) => (
              <article className="repeat-item" key={station.id}>
                <div className="repeat-item-head">
                  <h4>תחנה {station.stationNumber}</h4>
                  <span
                    className={`tag ${
                      station.status === 'missing' || station.status === 'damaged' ? 'tag-danger' : 'tag-brand'
                    }`}
                  >
                    {BAIT_STATION_STATUS_LABELS[station.status as keyof typeof BAIT_STATION_STATUS_LABELS] ??
                      station.status}
                  </span>
                </div>
                <div className="small">{station.locationDescription}</div>
                <div className="small muted">
                  {station.consumptionLevel
                    ? `רמת אכילה: ${CONSUMPTION_LABELS[station.consumptionLevel] ?? station.consumptionLevel}`
                    : null}
                  {station.productTradeName ? ` · תכשיר: ${station.productTradeName}` : ''}
                </div>
                <div className="small dim">עודכן: {formatDateTimeHe(station.updatedAt)}</div>
              </article>
            ))}
          </div>
        ))}
      </section>
    </>
  );
}
