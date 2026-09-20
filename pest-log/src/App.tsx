import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AppProvider, useApp } from '@/state/AppContext';
import { ToastProvider } from '@/state/ToastContext';
import { RouteTransition } from '@/components/motion/RouteTransition';
import { Alert, SyncBadge } from '@/components/Common';
import { LoginPage } from '@/features/auth/LoginPage';
import { HomePage } from '@/features/home/HomePage';
import { DraftsPage } from '@/features/home/DraftsPage';
import { CompletedPage } from '@/features/home/CompletedPage';
import { VerifyPage } from '@/features/home/VerifyPage';
import { PrivacyPage } from '@/features/home/PrivacyPage';
import { ArchivePage } from '@/features/archive/ArchivePage';
import { ClientsPage } from '@/features/clients/ClientsPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { BaitStationsPage } from '@/features/baitStations/BaitStationsPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { ProfilePage } from '@/features/settings/ProfilePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { DiagnosticsPage } from '@/features/settings/DiagnosticsPage';
import { ImportPage } from '@/features/legacyImport/ImportPage';
import { WizardPage } from '@/features/wizard/WizardPage';
import { RoutesPage } from '@/features/routes/RoutesPage';
import { RouteDayPage } from '@/features/routes/RouteDayPage';
import { RouteMapPage } from '@/features/routes/RouteMapPage';
import { RouteReportPage } from '@/features/routes/RouteReportPage';
import { RouteTemplatesPage } from '@/features/routes/RouteTemplatesPage';
import { RouteAdminPage } from '@/features/routes/RouteAdminPage';
import { VisitPage } from '@/features/routes/VisitPage';

/** כותרות המסכים הפנימיים, לכותרת העליונה. */
const PAGE_TITLES: Array<[RegExp, string]> = [
  [/^\/drafts$/, 'טיוטות'],
  [/^\/routes$/, 'מסלול עבודה'],
  [/^\/routes\/templates$/, 'קווי אחזקה קבועים'],
  [/^\/routes\/admin$/, 'ניהול מסלולים'],
  [/^\/routes\/[^/]+\/map$/, 'מפת המסלול'],
  [/^\/routes\/[^/]+\/report$/, 'דוח מסלול'],
  [/^\/routes\/[^/]+\/visits\//, 'ביקור במסלול'],
  [/^\/routes\/[^/]+$/, 'מסלול עבודה'],
  [/^\/archive$/, 'ארכיון יומנים'],
  [/^\/clients$/, 'מזמינים ואתרים'],
  [/^\/bait-stations$/, 'תחנות האכלה'],
  [/^\/products$/, 'תכשירי הדברה'],
  [/^\/tasks$/, 'משימות ומעקבים'],
  [/^\/profile$/, 'פרופיל המדביר'],
  [/^\/settings$/, 'הגדרות'],
  [/^\/diagnostics$/, 'בדיקת מערכת'],
  [/^\/import$/, 'ייבוא'],
  [/^\/privacy$/, 'פרטיות'],
  [/^\/verify/, 'אימות עותק'],
  [/^\/logs\/[^/]+\/completed$/, 'היומן הושלם'],
  [/^\/logs\//, 'מילוי יומן'],
];

function titleForPath(pathname: string): string {
  return PAGE_TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? '';
}

/** כותרת המסכים הפנימיים, עם חזרה שעובדת גם בדפדפן וגם בטלפון. */
function InnerHeader(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, syncStatus } = useApp();
  const title = titleForPath(location.pathname);

  return (
    <header className="app-header">
      <div className="app-header-row">
        <div className="brand">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            aria-label="חזרה למסך הקודם"
            onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate('/'))}
          >
            <ArrowRight size={20} strokeWidth={2} aria-hidden="true" />
          </button>
          <span className="brand-text">
            <span className="brand-title">{title || 'יומן ביצוע הדברה'}</span>
            <span className="brand-sub">{profile?.organizationName ?? ''}</span>
          </span>
        </div>
        <SyncBadge state={syncStatus.state} pendingCount={syncStatus.pendingCount} isOnline={syncStatus.isOnline} />
      </div>

      <nav className="app-nav" aria-label="ניווט ראשי">
        <NavLink to="/" end>
          בית
        </NavLink>
        <NavLink to="/routes">מסלול</NavLink>
        <NavLink to="/drafts">טיוטות</NavLink>
        <NavLink to="/archive">ארכיון</NavLink>
        <NavLink to="/tasks">משימות</NavLink>
        <NavLink to="/settings">הגדרות</NavLink>
      </nav>
    </header>
  );
}

/** עטיפה למסכים הפנימיים: כותרת + אזור תוכן. */
function InnerLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        דילוג לתוכן הראשי
      </a>
      <InnerHeader />
      <main className="app-main" id="main-content">
        {children}
      </main>
    </div>
  );
}

function Shell(): React.JSX.Element {
  const { profile, loading, authenticated, configError } = useApp();

  if (loading) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <span className="visually-hidden">טוען…</span>
        </main>
      </div>
    );
  }

  if (configError && !authenticated) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <Alert kind="error" title="המערכת אינה מוגדרת">
            {configError}
          </Alert>
        </main>
      </div>
    );
  }

  if (!authenticated || !profile) {
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <RouteTransition>
      <Routes>
        {/* מסך הבית מציג כותרת משלו, ולכן אינו עטוף ב-InnerLayout. */}
        <Route path="/" element={<HomePage />} />

        <Route path="/logs/:logId" element={<InnerLayout><WizardPage /></InnerLayout>} />
        <Route path="/logs/:logId/completed" element={<InnerLayout><CompletedPage /></InnerLayout>} />
        <Route path="/routes" element={<InnerLayout><RoutesPage /></InnerLayout>} />
        <Route path="/routes/templates" element={<InnerLayout><RouteTemplatesPage /></InnerLayout>} />
        <Route path="/routes/admin" element={<InnerLayout><RouteAdminPage /></InnerLayout>} />
        <Route path="/routes/:routeId" element={<InnerLayout><RouteDayPage /></InnerLayout>} />
        <Route path="/routes/:routeId/map" element={<InnerLayout><RouteMapPage /></InnerLayout>} />
        <Route path="/routes/:routeId/report" element={<InnerLayout><RouteReportPage /></InnerLayout>} />
        <Route path="/routes/:routeId/visits/:visitId" element={<InnerLayout><VisitPage /></InnerLayout>} />
        <Route path="/drafts" element={<InnerLayout><DraftsPage /></InnerLayout>} />
        <Route path="/archive" element={<InnerLayout><ArchivePage /></InnerLayout>} />
        <Route path="/clients" element={<InnerLayout><ClientsPage /></InnerLayout>} />
        <Route path="/bait-stations" element={<InnerLayout><BaitStationsPage /></InnerLayout>} />
        <Route path="/products" element={<InnerLayout><ProductsPage /></InnerLayout>} />
        <Route path="/tasks" element={<InnerLayout><TasksPage /></InnerLayout>} />
        <Route path="/profile" element={<InnerLayout><ProfilePage /></InnerLayout>} />
        <Route path="/settings" element={<InnerLayout><SettingsPage /></InnerLayout>} />
        <Route path="/diagnostics" element={<InnerLayout><DiagnosticsPage /></InnerLayout>} />
        <Route path="/import" element={<InnerLayout><ImportPage /></InnerLayout>} />
        <Route path="/verify" element={<InnerLayout><VerifyPage /></InnerLayout>} />
        <Route path="/privacy" element={<InnerLayout><PrivacyPage /></InnerLayout>} />
        <Route path="/auth/callback" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RouteTransition>
  );
}

export function App(): React.JSX.Element {
  return (
    <AppProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </AppProvider>
  );
}
