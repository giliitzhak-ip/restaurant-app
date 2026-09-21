import { useCallback, useEffect, useState } from 'react';
import { matchRoute, navigate, useRoute } from './router';
import { useStore } from './state/store';
import { BottomNav, DesktopNav } from './components/Nav';
import { SaveIndicator } from './components/ui';
import { IconMoon, IconSun } from './components/icons';
import { Home } from './screens/Home';
import { JournalsScreen } from './screens/Journals';
import { CustomersScreen } from './screens/Customers';
import { CustomerCard } from './screens/CustomerCard';
import { RouteScreen } from './screens/RouteScreen';
import { TemplatesScreen } from './screens/Templates';
import { TasksScreen } from './screens/Tasks';
import { CalendarScreen } from './screens/Calendar';
import { MaterialsScreen } from './screens/Materials';
import { ProfileScreen } from './screens/Profile';
import { MoreScreen } from './screens/More';
import { JournalWizard } from './screens/wizard/JournalWizard';
import { JournalDocument } from './screens/JournalDocument';

const TITLES: Record<string, string> = {
  '': 'שלום, יצחק',
  journals: 'יומנים',
  journal: 'אשף יומן',
  customers: 'לקוחות',
  customer: 'כרטיס לקוח',
  route: 'מסלול עבודה',
  templates: 'תבניות',
  tasks: 'משימות',
  calendar: 'לוח שנה',
  materials: 'חומרים',
  profile: 'פרופיל',
  more: 'עוד',
  doc: 'מסמך יומן',
};

export function App() {
  const route = useRoute();
  const { name, params } = matchRoute(route);
  const { createJournal, saveState, pendingSync, online, ready } = useStore();
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.title = `${TITLES[name] ?? 'יומן הדברה'} · יומן הדברה – יצחק הדברות`;
  }, [name]);

  const startJournal = useCallback(() => {
    const journal = createJournal();
    navigate(`#/journal/${journal.id}/1`);
  }, [createJournal]);

  if (!ready) {
    return (
      <div className="app-shell">
        <main className="page"><p className="muted">טוען נתונים…</p></main>
      </div>
    );
  }

  let screen: React.ReactNode;
  switch (name) {
    case '': screen = <Home onNewJournal={startJournal} />; break;
    case 'journals': screen = <JournalsScreen />; break;
    case 'journal': screen = <JournalWizard journalId={params[0]} step={Number(params[1] ?? 1)} />; break;
    case 'doc': screen = <JournalDocument journalId={params[0]} />; break;
    case 'customers': screen = <CustomersScreen />; break;
    case 'customer': screen = <CustomerCard customerId={params[0]} />; break;
    case 'route': screen = <RouteScreen />; break;
    case 'templates': screen = <TemplatesScreen />; break;
    case 'tasks': screen = <TasksScreen />; break;
    case 'calendar': screen = <CalendarScreen />; break;
    case 'materials': screen = <MaterialsScreen />; break;
    case 'profile': screen = <ProfileScreen />; break;
    case 'more': screen = <MoreScreen onNewJournal={startJournal} />; break;
    default: screen = <Home onNewJournal={startJournal} />;
  }

  const isDoc = name === 'doc';

  return (
    <div className="app-shell">
      {!isDoc && (
        <header className="topbar no-print">
          <div className="topbar-inner">
            <div>
              <h1>{name === '' ? 'שלום, יצחק' : TITLES[name] ?? 'יומן הדברה'}</h1>
              <div className="sub">יצחק הדברות · יומן הדברה דיגיטלי</div>
            </div>
            <div className="topbar-actions">
              <SaveIndicator state={saveState} pending={pendingSync} online={online} />
              <button
                type="button"
                className="icon-btn"
                aria-label={theme === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? <IconSun /> : <IconMoon />}
              </button>
            </div>
          </div>
        </header>
      )}
      {!isDoc && <DesktopNav />}
      <main className="page" id="main">{screen}</main>
      {!isDoc && <BottomNav onNewJournal={startJournal} />}
    </div>
  );
}
