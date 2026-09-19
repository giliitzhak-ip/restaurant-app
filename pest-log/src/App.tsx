import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from '@/state/AppContext';
import { Alert, SyncBadge } from '@/components/Common';
import { LoginPage } from '@/features/auth/LoginPage';
import { HomePage } from '@/features/home/HomePage';
import { CompletedPage } from '@/features/home/CompletedPage';
import { VerifyPage } from '@/features/home/VerifyPage';
import { PrivacyPage } from '@/features/home/PrivacyPage';
import { ArchivePage } from '@/features/archive/ArchivePage';
import { ImportPage } from '@/features/legacyImport/ImportPage';
import { WizardPage } from '@/features/wizard/WizardPage';
import { signOut } from '@/lib/supabase';

function Shell(): React.JSX.Element {
  const { profile, loading, authenticated, syncStatus, configError } = useApp();

  if (loading) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <p className="muted">טוען…</p>
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
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        דילוג לתוכן הראשי
      </a>

      <header className="app-header">
        <div className="app-header-row">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              יה
            </span>
            <span className="brand-text">
              <span className="brand-title">יומן ביצוע הדברה</span>
              <span className="brand-sub">{profile.organizationName}</span>
            </span>
          </div>
          <SyncBadge state={syncStatus.state} pendingCount={syncStatus.pendingCount} isOnline={syncStatus.isOnline} />
        </div>

        <nav className="app-nav" aria-label="ניווט ראשי">
          <NavLink to="/" end>
            בית
          </NavLink>
          <NavLink to="/archive">ארכיון</NavLink>
          <NavLink to="/import">ייבוא</NavLink>
          <NavLink to="/privacy">פרטיות</NavLink>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut().then(() => location.reload())}>
            יציאה
          </button>
        </nav>
      </header>

      <main className="app-main" id="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/logs/:logId" element={<WizardPage />} />
          <Route path="/logs/:logId/completed" element={<CompletedPage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/auth/callback" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App(): React.JSX.Element {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
