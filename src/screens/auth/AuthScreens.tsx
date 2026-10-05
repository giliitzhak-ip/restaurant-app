import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../../state/auth';
import { ApiError } from '../../lib/authClient';
import { Field, Notice } from '../../components/ui';

/** מעטפת משותפת למסכי הכניסה, לפני שיש תפריטים או ניווט. */
function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="auth-shell" dir="rtl" lang="he">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-mark" aria-hidden="true">
            <svg viewBox="0 0 512 512" width="34" height="34">
              <rect width="512" height="512" rx="112" fill="#0B3D2E" />
              <rect x="112" y="96" width="288" height="320" rx="30" fill="#FFFFFF" />
              <rect x="112" y="96" width="288" height="62" rx="30" fill="#18B765" />
              <path d="M152 334 l44 44 l84 -96" fill="none" stroke="#18B765" strokeWidth="28"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <h1>{title}</h1>
            <p className="auth-sub">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <Notice kind="error" title={errors.length > 1 ? 'יש לתקן את הפרטים הבאים' : undefined}>
      {errors.length === 1 ? errors[0] : <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
    </Notice>
  );
}

export function LoginScreen({ onRegister }: { onRegister: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors([]);
    try {
      await login(email, password);
    } catch (err) {
      setErrors(err instanceof ApiError ? err.errors : ['אירעה שגיאה. יש לנסות שוב.']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="יומן הדברה" subtitle="כניסה למערכת">
      <form onSubmit={submit} noValidate>
        <ErrorList errors={errors} />
        <Field label="דוא״ל" htmlFor="login-email">
          <input id="login-email" type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="סיסמה" htmlFor="login-password">
          <input id="login-password" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'מתחבר…' : 'כניסה'}
        </button>
      </form>
      <div className="auth-foot">
        <span className="muted small">אין לך עדיין חשבון?</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRegister}>
          רישום עסק חדש
        </button>
      </div>
    </AuthShell>
  );
}

export function RegisterScreen({ onBack }: { onBack: () => void }) {
  const { register } = useAuth();
  const [form, setForm] = useState({
    businessName: '', contactName: '', email: '', phone: '', licenseNumber: '', password: '',
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors([]);
    try {
      setDone(await register(form));
    } catch (err) {
      setErrors(err instanceof ApiError ? err.errors : ['אירעה שגיאה. יש לנסות שוב.']);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell title="ההרשמה נקלטה" subtitle={form.businessName}>
        <div className="success-check" aria-hidden="true">✓</div>
        <Notice kind="info" title="ממתין לאישור">
          {done} לאחר האישור תתקבל גישה מלאה, ואפשר יהיה להתחבר עם הדוא״ל והסיסמה שהוזנו.
        </Notice>
        <button type="button" className="btn btn-primary btn-block" onClick={onBack}>
          חזרה למסך הכניסה
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="רישום עסק" subtitle="פתיחת חשבון למדביר או לחברת הדברה">
      <form onSubmit={submit} noValidate>
        <ErrorList errors={errors} />
        <Field label="שם העסק" htmlFor="reg-business">
          <input id="reg-business" type="text" required value={form.businessName} onChange={set('businessName')} />
        </Field>
        <Field label="שם איש הקשר" htmlFor="reg-contact">
          <input id="reg-contact" type="text" required value={form.contactName} onChange={set('contactName')} />
        </Field>
        <div className="row">
          <Field label="דוא״ל" htmlFor="reg-email" hint="ישמש גם לכניסה למערכת.">
            <input id="reg-email" type="email" autoComplete="username" required value={form.email} onChange={set('email')} />
          </Field>
          <Field label="טלפון" htmlFor="reg-phone">
            <input id="reg-phone" type="tel" value={form.phone} onChange={set('phone')} />
          </Field>
        </div>
        <Field label="מספר רישיון הדברה" htmlFor="reg-license">
          <input id="reg-license" type="text" value={form.licenseNumber} onChange={set('licenseNumber')} />
        </Field>
        <Field label="סיסמה" htmlFor="reg-password" hint="לפחות 8 תווים, הכוללים אות וספרה.">
          <input id="reg-password" type="password" autoComplete="new-password" required
            value={form.password} onChange={set('password')} />
        </Field>

        <Notice kind="info">
          ההרשמה נשלחת לאישור מנהל המערכת. עד לאישור לא ניתן לתעד עבודות.
        </Notice>

        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'שולח…' : 'שליחת בקשת רישום'}
        </button>
      </form>
      <div className="auth-foot">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>חזרה לכניסה</button>
      </div>
    </AuthShell>
  );
}

/** מוצג למשתמש שהעסק שלו עדיין אינו מאושר, הושעה או נדחה. */
export function BlockedScreen() {
  const { organization, access, logout, refresh } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <AuthShell title={organization?.name ?? 'החשבון שלך'} subtitle="הגישה אינה פעילה">
      <Notice kind="warn" title="אין גישה למערכת">{access.reason}</Notice>
      <p className="small muted">
        הנתונים שלך נשמרים ואינם נמחקים. לאחר אישור מנהל המערכת הגישה תיפתח מיד.
      </p>
      <div className="stack mt-3">
        <button type="button" className="btn btn-primary btn-block" disabled={busy}
          onClick={async () => { setBusy(true); await refresh(); setBusy(false); }}>
          {busy ? 'בודק…' : 'בדיקת סטטוס מחדש'}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={() => void logout()}>
          יציאה
        </button>
      </div>
    </AuthShell>
  );
}
