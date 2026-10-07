import { useState, type ReactNode } from 'react';
import { useAuth } from './state/auth';
import { matchRoute, useRoute } from './router';
import { SharedDocument } from './screens/SharedDocument';
import { StoreProvider } from './state/store';
import { LoginScreen, RegisterScreen, BlockedScreen } from './screens/auth/AuthScreens';

/**
 * שומר הסף: קובע מה מוצג לפי מצב ההתחברות והגישה של העסק.
 * המאגר המקומי נפתח רק אחרי שידוע מיהו המשתמש, כדי שנתונים
 * של משתמש אחד לא ייטענו אצל אחר על אותו מכשיר.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, access, user, scopeKey } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  const route = useRoute();

  /* מסמך שנשלח ללקוח בקישור. הנתיב הזה פתוח בכוונה: הלקוח אינו
     משתמש במערכת. ההגנה היא באסימון שבקישור, בתוקף שלו ובכך
     שהוא מצביע על מסמך אחד בלבד. אין כאן חנות מקומית. */
  const shared = matchRoute(route);
  if (shared.name === 'shared') {
    return <SharedDocument token={shared.params[0]} />;
  }

  if (status === 'loading') {
    return (
      <div className="auth-shell" dir="rtl" lang="he">
        <p className="muted">טוען…</p>
      </div>
    );
  }

  if (status === 'anonymous') {
    return showRegister
      ? <RegisterScreen onBack={() => setShowRegister(false)} />
      : <LoginScreen onRegister={() => setShowRegister(true)} />;
  }

  // מנהל מערכת ללא עסק משויך נכנס ישירות לקונסולה
  if (status === 'authenticated' && access.level === 'blocked' && !user?.isSuperAdmin) {
    return <BlockedScreen />;
  }

  return <StoreProvider scope={scopeKey}>{children}</StoreProvider>;
}
