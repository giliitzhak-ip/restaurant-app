import { useEffect, useState } from 'react';
import { ApiError, authApi } from '../../lib/authClient';
import { useAuth } from '../../state/auth';
import { Field, Notice } from '../../components/ui';
import { navigate } from '../../router';

interface InviteInfo {
  kind: 'invite' | 'reset';
  name: string;
  email: string;
  organizationName: string;
}

/**
 * קביעת סיסמה מתוך קישור הזמנה או איפוס.
 *
 * זה המסך שמחליף מסירת סיסמה בטקסט: העובד קובע את הסיסמה שלו
 * בעצמו, והמזמין אינו יודע אותה. הקישור חד-פעמי ובעל תוקף.
 */
export function SetPassword({ token }: { token?: string }) {
  const { acceptInvite } = useAuth();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(
    token ? null : 'הקישור חסר.',
  );
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void authApi.readInvite(token)
      .then((res) => { if (!cancelled) setInfo(res); })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.errors[0] : 'הקישור אינו פעיל.');
      });
    return () => { cancelled = true; };
  }, [token]);

  async function submit(): Promise<void> {
    if (busy || !token) return;
    if (password !== again) {
      setErrors(['שתי הסיסמאות אינן זהות.']);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      await acceptInvite(token, password);
      /* יוצאים מנתיב ההזמנה: הוא נשאר מסך פתוח גם אחרי התחברות,
         והאסימון שבכתובת אינו צריך להישאר בהיסטוריית הדפדפן. */
      navigate('#/');
    } catch (err) {
      setErrors(err instanceof ApiError ? err.errors : ['קביעת הסיסמה נכשלה.']);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="auth-shell" dir="rtl" lang="he">
        <div className="auth-card">
          <h1>קישור לא פעיל</h1>
          <Notice kind="error">{loadError}</Notice>
          <p className="small muted">
            יש לבקש קישור חדש ממי ששלח אותו. קישור קביעת סיסמה הוא חד-פעמי
            ותקף לזמן מוגבל.
          </p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="auth-shell" dir="rtl" lang="he">
        <p className="muted">טוען…</p>
      </div>
    );
  }

  return (
    <div className="auth-shell" dir="rtl" lang="he">
      <div className="auth-card">
        <h1>{info.kind === 'invite' ? 'הצטרפות לעסק' : 'קביעת סיסמה חדשה'}</h1>
        <p className="small">
          {info.name} · {info.email}
          {info.organizationName ? ` · ${info.organizationName}` : ''}
        </p>

        {errors.length > 0 && <Notice kind="error">{errors.join(' ')}</Notice>}

        <Field label="סיסמה חדשה" htmlFor="sp-password" hint="לפחות 8 תווים, אות וספרה.">
          <input
            id="sp-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="שוב, לאישור" htmlFor="sp-again">
          <input
            id="sp-again"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
        </Field>

        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy || !password}
          onClick={() => void submit()}
        >
          {busy ? 'קובע…' : 'קביעת סיסמה וכניסה'}
        </button>

        <Notice kind="info">
          הסיסמה נשמרת כגיבוב בלבד. מי שהזמין אותך אינו יכול לראות אותה.
        </Notice>
      </div>
    </div>
  );
}
