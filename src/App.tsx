import { useCallback, useEffect, useState } from 'react';
import { matchRoute, navigate, useRoute } from './router';
import { STANDALONE } from './lib/config';
import { useStore } from './state/store';
import { BottomNav, DesktopNav } from './components/Nav';
import { SaveStatus } from './components/SaveStatus';
import { IconLogout, IconMoon, IconSun } from './components/icons';
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
import { AdminConsole } from './screens/AdminConsole';
import { TeamScreen } from './screens/Team';
import { useAuth } from './state/auth';
import { Notice } from './components/ui';

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
  admin: 'ניהול עסקים',
  team: 'עובדים',
};

export function App() {
  const route = useRoute();
  const { name, params } = matchRoute(route);
  const { createJournal, ready } = useStore();
  const { user, organization, access, logout } = useAuth();
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* אחסון חסום – הבחירה תקפה לסשן הנוכחי בלבד */
    }
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
      <div className="app-shell" dir="rtl" lang="he">
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
    case 'admin':
      screen = user?.isSuperAdmin
        ? <AdminConsole />
        : <Notice kind="error">אין לך הרשאה למסך זה.</Notice>;
      break;
    case 'team': screen = <TeamScreen />; break;
    default: screen = <Home onNewJournal={startJournal} />;
  }

  const isDoc = name === 'doc';

  return (
    <div className="app-shell" dir="rtl" lang="he">
      {/* מצב הדגמה מוצהר בכל מסך ולא רק בפרופיל: בבנייה ללא שרת
          אין התחברות, אין סנכרון ואין גיבוי מחוץ למכשיר, וחשוב
          שלא ייראה כמו מצב עסק אמיתי. */}
      {STANDALONE && (
        <div className="demo-banner no-print" role="status">
          גרסת הדגמה · ללא שרת, ללא התחברות וללא סנכרון · הנתונים במכשיר הזה בלבד
        </div>
      )}

      {!isDoc && (
        <header className="topbar no-print">
          <div className="topbar-inner">
            <div className="topbar-title">
              <h1>
                {name === ''
                  ? `שלום, ${user?.name ?? 'יצחק'}`
                  : TITLES[name] ?? 'יומן הדברה'}
              </h1>
              <div className="sub">
                {organization?.name ?? 'יומן הדברה דיגיטלי'}
                {user?.isSuperAdmin ? ' · מנהל מערכת' : ''}
              </div>
            </div>
            <div className="topbar-actions">
              <SaveStatus />
              <button
                type="button"
                className="icon-btn"
                aria-label={theme === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? <IconSun /> : <IconMoon />}
              </button>
              {user && (
                <button type="button" className="icon-btn" aria-label="יציאה מהחשבון"
                  onClick={() => void logout()}>
                  <IconLogout />
                </button>
              )}
            </div>
          </div>
        </header>
      )}
      {!isDoc && <DesktopNav />}
      {!isDoc && access.level === 'read_only' && (
        <div className="page no-print" style={{ paddingBottom: 0 }}>
          <Notice kind="warn" title="קריאה בלבד">
            {access.reason} ניתן לצפות בכל הנתונים ולהפיק מסמכים, אך לא לתעד עבודות חדשות.
          </Notice>
        </div>
      )}
      <main className="page" id="main">{screen}</main>
      {!isDoc && <BottomNav onNewJournal={startJournal} />}
    </div>
  );
}
