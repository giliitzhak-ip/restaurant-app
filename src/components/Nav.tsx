import { navigate, useRoute } from '../router';
import { IconCustomers, IconHome, IconMore, IconPlus, IconRoute } from './icons';

/**
 * סדר הפס נגזר ממהלך יום העבודה: מסלול לפני תיעוד.
 * הפעולה הראשית אינה עיגול צף אלא לחצן מתויג, כדי שיהיה ברור מה הוא עושה.
 */
const BOTTOM = [
  { key: 'home', path: '#/', Icon: IconHome, label: 'בית' },
  { key: 'route', path: '#/route', Icon: IconRoute, label: 'מסלול' },
];

const BOTTOM_END = [
  { key: 'customers', path: '#/customers', Icon: IconCustomers, label: 'לקוחות' },
  { key: 'more', path: '#/more', Icon: IconMore, label: 'עוד' },
];

const DESKTOP = [
  { path: '#/', label: 'בית' },
  { path: '#/route', label: 'מסלול עבודה' },
  { path: '#/tasks', label: 'משימות' },
  { path: '#/calendar', label: 'לוח שנה' },
  { path: '#/journals', label: 'יומנים' },
  { path: '#/customers', label: 'לקוחות' },
  { path: '#/templates', label: 'תבניות' },
  { path: '#/materials', label: 'חומרים' },
  { path: '#/profile', label: 'פרופיל' },
];

function isCurrent(route: string, path: string): boolean {
  const target = path.replace('#', '');
  return target === '/' ? route === '/' : route.startsWith(target);
}

export function BottomNav({ onNewJournal }: { onNewJournal: () => void }) {
  const route = useRoute();
  return (
    <nav className="bottom-nav no-print" aria-label="ניווט ראשי">
      {BOTTOM.map((item) => (
        <button
          key={item.key}
          type="button"
          className="nav-item"
          aria-current={isCurrent(route, item.path) ? 'page' : undefined}
          onClick={() => navigate(item.path)}
        >
          <span className="nav-icon" aria-hidden="true"><item.Icon /></span>
          {item.label}
        </button>
      ))}
      <button type="button" className="nav-fab" onClick={onNewJournal}>
        <IconPlus />
        <span className="nav-fab-label">יומן חדש</span>
      </button>
      {BOTTOM_END.map((item) => (
        <button
          key={item.key}
          type="button"
          className="nav-item"
          aria-current={isCurrent(route, item.path) ? 'page' : undefined}
          onClick={() => navigate(item.path)}
        >
          <span className="nav-icon" aria-hidden="true"><item.Icon /></span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function DesktopNav() {
  const route = useRoute();
  return (
    <nav className="desktop-nav no-print" aria-label="ניווט מסכים">
      {DESKTOP.map((item) => (
        <button
          key={item.path}
          type="button"
          className="nav-link"
          aria-current={isCurrent(route, item.path) ? 'page' : undefined}
          onClick={() => navigate(item.path)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
