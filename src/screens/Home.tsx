import { useMemo } from 'react';
import { navigate } from '../router';
import { useStore } from '../state/store';
import { Card, EmptyState } from '../components/ui';
import {
  IconCalendar, IconCustomers, IconJournal, IconMaterials, IconPlus,
  IconProfile, IconRoute, IconTasks, IconTemplates,
} from '../components/icons';
import { formatDate, toDateInput } from '../lib/format';

const TILES = [
  { key: 'journals', Icon: IconJournal, label: 'יומנים', path: '#/journals' },
  { key: 'customers', Icon: IconCustomers, label: 'לקוחות', path: '#/customers' },
  { key: 'route', Icon: IconRoute, label: 'מסלול עבודה', path: '#/route' },
  { key: 'templates', Icon: IconTemplates, label: 'תבניות', path: '#/templates' },
  { key: 'tasks', Icon: IconTasks, label: 'משימות', path: '#/tasks' },
  { key: 'calendar', Icon: IconCalendar, label: 'לוח שנה', path: '#/calendar' },
  { key: 'materials', Icon: IconMaterials, label: 'חומרים', path: '#/materials' },
  { key: 'profile', Icon: IconProfile, label: 'פרופיל', path: '#/profile' },
];

export function Home({ onNewJournal }: { onNewJournal: () => void }) {
  const { state } = useStore();
  const today = toDateInput(new Date().toISOString());

  const todayRoute = useMemo(
    () => state.routes.find((r) => r.date === today),
    [state.routes, today],
  );

  const stops = useMemo(() => {
    if (!todayRoute) return [];
    return state.routeStops
      .filter((s) => s.routeId === todayRoute.id)
      .sort((a, b) => a.position - b.position);
  }, [state.routeStops, todayRoute]);

  const nextStop = stops.find((s) => s.status !== 'done');
  const nextCustomer = state.customers.find((c) => c.id === nextStop?.customerId);
  const nextSite = state.sites.find((s) => s.id === nextStop?.siteId);
  const doneCount = stops.filter((s) => s.status === 'done').length;

  const openTasks = state.tasks.filter((t) => !t.done && t.dueDate <= today).length;
  const drafts = state.journals.filter((j) => j.status === 'draft').length;

  return (
    <>
      <section className="card today-card" aria-labelledby="today-title">
        <h2 id="today-title">היום שלי</h2>
        <div className="small" style={{ opacity: 0.85 }}>{formatDate(new Date().toISOString())}</div>
        <div className="today-row mt-3">
          <div className="today-stat">
            <span className="num">{stops.length}</span>
            <span className="lbl">טיפולים להיום</span>
          </div>
          <div className="today-stat">
            <span className="num">{doneCount}</span>
            <span className="lbl">הושלמו</span>
          </div>
          <div className="today-stat">
            <span className="num">{openTasks}</span>
            <span className="lbl">משימות פתוחות</span>
          </div>
          <div className="today-stat">
            <span className="num">{drafts}</span>
            <span className="lbl">טיוטות</span>
          </div>
        </div>

        <div className="today-next">
          {nextCustomer ? (
            <>
              <div className="small" style={{ opacity: 0.8 }}>הלקוח הבא</div>
              <div className="bold">{nextCustomer.name}</div>
              <div className="small">
                {nextStop?.plannedTime ? `${nextStop.plannedTime} · ` : ''}
                {nextSite?.address ?? nextCustomer.address}
              </div>
            </>
          ) : (
            <div className="small">אין תחנות מתוכננות להיום. אפשר לבנות מסלול עבודה.</div>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary btn-lg btn-block mt-4"
          onClick={() => navigate('#/route')}
        >
          התחל מסלול
        </button>
      </section>

      <h2 className="section-title">פעולות</h2>
      <div className="home-grid">
        {TILES.map((tile) => (
          <button
            key={tile.key}
            type="button"
            className="home-tile"
            onClick={() => navigate(tile.path)}
          >
            <span className="ring" aria-hidden="true"><tile.Icon /></span>
            <span className="label">{tile.label}</span>
          </button>
        ))}
        <button type="button" className="home-tile primary" onClick={onNewJournal}>
          <span className="ring" aria-hidden="true"><IconPlus /></span>
          <span className="label">יומן חדש</span>
        </button>
      </div>

      {state.journals.length === 0 && (
        <Card className="mt-4">
          <EmptyState
            icon="❑"
            title="עוד לא נפתח יומן. אפשר להתחיל ביומן חדש – הכול נשמר אוטומטית."
            action={<button type="button" className="btn btn-primary" onClick={onNewJournal}>פתח יומן חדש</button>}
          />
        </Card>
      )}
    </>
  );
}
