import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import {
  ApiError, authApi, readToken, writeToken,
  type Access, type AuthUser, type Organization, type RegisterInput,
} from '../lib/authClient';
import { STANDALONE } from '../lib/config';
import { syncQueue } from '../lib/sync';

type Status = 'loading' | 'anonymous' | 'authenticated' | 'standalone';

interface AuthValue {
  status: Status;
  user: AuthUser | null;
  organization: Organization | null;
  access: Access;
  /** מפתח האחסון המקומי. מפריד בין משתמשים על אותו מכשיר. */
  scopeKey: string;
  login: (email: string, password: string) => Promise<void>;
  /** קביעת סיסמה מתוך קישור הזמנה או איפוס, והתחברות מיד אחריה. */
  acceptInvite: (token: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<string>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const FULL_ACCESS: Access = { level: 'full', reason: '' };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // המצב ההתחלתי נגזר מיד, בלי setState בתוך effect
  const [status, setStatus] = useState<Status>(() => {
    if (STANDALONE) return 'standalone';
    return readToken() ? 'loading' : 'anonymous';
  });
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [access, setAccess] = useState<Access>(FULL_ACCESS);

  const applySession = useCallback(
    (session: { user: AuthUser; organization: Organization | null; access: Access }) => {
      setUser(session.user);
      setOrganization(session.organization);
      setAccess(session.access);
      setStatus('authenticated');
    },
    [],
  );

  const clearSession = useCallback(() => {
    writeToken(null);
    syncQueue.setToken(null);
    setUser(null);
    setOrganization(null);
    setAccess(FULL_ACCESS);
    setStatus('anonymous');
  }, []);

  /* שחזור התחברות קיימת בעת טעינת האפליקציה */
  useEffect(() => {
    if (STANDALONE) return;
    const token = readToken();
    if (!token) return;
    syncQueue.setToken(token);
    let cancelled = false;
    void authApi
      .me()
      .then((session) => {
        if (!cancelled) applySession(session);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // אסימון שפג או בוטל – מנקים. תקלת רשת אינה מנתקת.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clearSession();
        else setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession]);

  const login = useCallback<AuthValue['login']>(
    async (email, password) => {
      const result = await authApi.login(email, password);
      writeToken(result.token);
      syncQueue.setToken(result.token);
      applySession(result);
    },
    [applySession],
  );

  const acceptInvite = useCallback<AuthValue['acceptInvite']>(
    async (token, password) => {
      const result = await authApi.acceptInvite(token, password);
      writeToken(result.token);
      syncQueue.setToken(result.token);
      applySession(result);
    },
    [applySession],
  );

  const register = useCallback<AuthValue['register']>(async (input) => {
    const result = await authApi.register(input);
    return result.message;
  }, []);

  const logout = useCallback<AuthValue['logout']>(async () => {
    try {
      await authApi.logout();
    } catch {
      /* גם אם השרת לא זמין, מנתקים מקומית */
    }
    clearSession();
  }, [clearSession]);

  const refresh = useCallback<AuthValue['refresh']>(async () => {
    try {
      applySession(await authApi.me());
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clearSession();
    }
  }, [applySession, clearSession]);

  /**
   * הנתונים המקומיים מופרדים לפי עסק ומשתמש, כך שעובד אחד
   * אינו רואה את מה שנשמר במכשיר עבור משתמש אחר.
   */
  const scopeKey = useMemo(() => {
    if (STANDALONE) return 'demo';
    if (!user) return 'anonymous';
    return `${user.orgId ?? 'system'}:${user.id}`;
  }, [user]);

  const value = useMemo<AuthValue>(
    () => ({
      status, user, organization, access, scopeKey,
      login, acceptInvite, register, logout, refresh,
    }),
    [status, user, organization, access, scopeKey, login, acceptInvite, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
