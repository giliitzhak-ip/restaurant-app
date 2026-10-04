import { useMemo } from 'react';
import { navigate } from '../router';
import { useStore } from '../state/store';
import {
  IconCalendar, IconChevron, IconCustomers, IconJournal, IconMaterials,
  IconPlus, IconProfile, IconRoute, IconTasks, IconTemplates,
} from '../components/icons';
import { formatDate, toDateInput } from '../lib/format';

/**
 * מסך הבית מסודר לפי מהלך העבודה של המדביר ולא כרשת אייקונים אחידה:
 * קודם מה שקורה היום, אחר כך פתיחת יומן, ואז הקבוצות לפי שימוש.
 */
const GROUPS = [
  {
    title: 'בשטח',
    hint: 'מה שפתוח עכשיו',
    items: [
      { key: 'route', Icon: IconRoute, label: 'מסלול עבודה', hint: 'תחנות היום', path: '#/route' },
      { key: 'tasks', Icon: IconTasks, label: 'משימות', hint: 'מעקב וביקורות', path: '#/tasks' },
      { key: 'calendar', Icon: IconCalendar, label: 'לוח שנה', hint: 'תכנון קדימה', path: '#/calendar' },
    ],
  },
  {
    title: 'התיק',
    hint: 'תיעוד ולקוחות',
    items: [
      { key: 'journals', Icon: IconJournal, label: 'יומנים', hint: 'חיפוש והפקה', path: '#/journals' },
      { key: 'customers', Icon: IconCustomers, label: 'לקוחות', hint: 'כרטיס והיסטוריה', path: '#/customers' },
      { key: 'templates', Icon: IconTemplates, label: 'תבניות', hint: 'חומרים ולקוחות', path: '#/templates' },
    ],
  },
  {
    title: 'מאגר והגדרות',
    hint: '',
    items: [
      { key: 'materials', Icon: IconMaterials, label: 'חומרים', hint: 'תוויות ומינונים', path: '#/materials' },
      { key: 'profile', Icon: IconProfile, label: 'פרופיל', hint: 'רישיון וסנכרון', path: '#/profile' },
    ],
  },
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
      <section className="today-card" aria-labelledby="today-title">
        <div className="today-head">
          <h2 id="today-title">היום שלי</h2>
          <span className="today-date">{formatDate(new Date().toISOString())}</span>
        </div>

        {nextCustomer ? (
          <div className="today-hero">
            <span className="today-eyebrow">התחנה הבאה</span>
            <span className="today-name">{nextCustomer.name}</span>
            <span className="today-meta">
              {nextStop?.plannedTime ? `${nextStop.plannedTime} · ` : ''}
              {nextSite?.address ?? nextCustomer.address}
            </span>
          </div>
        ) : (
          <div className="today-hero">
            <span className="today-eyebrow">אין תחנות להיום</span>
            <span className="today-meta">אפשר לבנות מסלול עבודה ולהתחיל.</span>
          </div>
        )}

        <ul className="today-chips">
          <li><b>{stops.length}</b> טיפולים</li>
          <li><b>{doneCount}</b> הושלמו</li>
          <li><b>{openTasks}</b> משימות</li>
          <li><b>{drafts}</b> טיוטות</li>
        </ul>

        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => navigate('#/route')}>
          התחל מסלול
        </button>
      </section>

      <button type="button" className="start-journal" onClick={onNewJournal}>
        <span className="start-mark" aria-hidden="true"><IconPlus /></span>
        <span className="start-text">
          <span className="start-title">פתיחת יומן חדש</span>
          <span className="start-hint">אשף בשמונה שלבים · נשמר אוטומטית</span>
        </span>
        <span className="start-go" aria-hidden="true"><IconChevron /></span>
      </button>

      {GROUPS.map((group) => (
        <section className="home-group" key={group.title} aria-labelledby={`g-${group.title}`}>
          <div className="group-head">
            <h2 id={`g-${group.title}`}>{group.title}</h2>
            {group.hint && <span className="group-hint">{group.hint}</span>}
          </div>
          <div className="group-grid">
            {group.items.map((item) => (
              <button
                key={item.key}
                type="button"
                className="group-tile"
                onClick={() => navigate(item.path)}
              >
                <span className="tile-icon" aria-hidden="true"><item.Icon /></span>
                <span className="tile-text">
                  <span className="tile-label">{item.label}</span>
                  <span className="tile-hint">{item.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
