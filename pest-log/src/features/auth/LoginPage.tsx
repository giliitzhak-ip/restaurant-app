import { useState } from 'react';
import { Alert } from '@/components/Common';
import { signInWithEmail, verifyEmailOtp } from '@/lib/supabase';
import { useApp } from '@/state/AppContext';

/**
 * התחברות בקישור קסם (magic link) או בקוד חד-פעמי (OTP).
 * אין סיסמאות במערכת.
 */
export function LoginPage(): React.JSX.Element {
  const { refreshProfile, configError } = useApp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const sendLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signInWithEmail(email.trim());
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setStage('code');
    setInfo('נשלח אליך דוא״ל עם קישור התחברות ועם קוד בן שש ספרות. אפשר ללחוץ על הקישור או להזין את הקוד כאן.');
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await verifyEmailOtp(email.trim(), code.trim());
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    await refreshProfile();
  };

  return (
    <div className="auth-page">
      <div className="auth-logo">
        <div className="brand-mark" aria-hidden="true">
          יה
        </div>
        <h1 style={{ fontSize: '1.2rem', margin: 0 }}>יומן ביצוע הדברה</h1>
        <p className="muted small">יצחק אחזקות והדברות</p>
      </div>

      {configError ? (
        <Alert kind="error" title="המערכת אינה מוגדרת">
          {configError}
        </Alert>
      ) : null}

      {error ? <Alert kind="error">{error}</Alert> : null}
      {info ? <Alert kind="info">{info}</Alert> : null}

      <section className="card">
        {stage === 'email' ? (
          <form onSubmit={(event) => void sendLink(event)}>
            <div className="field">
              <label htmlFor="login-email">כתובת דוא״ל</label>
              <input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
              />
              <div className="hint">נשלח קישור התחברות חד-פעמי. אין צורך בסיסמה.</div>
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || Boolean(configError)}>
              {busy ? 'שולח…' : 'שליחת קישור התחברות'}
            </button>
          </form>
        ) : (
          <form onSubmit={(event) => void submitCode(event)}>
            <div className="field">
              <label htmlFor="login-code">קוד חד-פעמי</label>
              <input
                id="login-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="mono"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'מאמת…' : 'כניסה'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => {
                setStage('email');
                setInfo(null);
              }}
            >
              שינוי כתובת הדוא״ל
            </button>
          </form>
        )}
      </section>

      <p className="small dim" style={{ textAlign: 'center' }}>
        השימוש במערכת כפוף ל<a href="/privacy">הודעת הפרטיות ומדיניות שמירת המידע</a>.
      </p>
    </div>
  );
}
