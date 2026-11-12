import { missingConfig } from "@/lib/env";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const missing = missingConfig();
  return (
    <main className="safe-top flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-tech/40 bg-ink-900 shadow-[0_0_40px_-8px_var(--color-tech)]">
            <svg viewBox="0 0 64 64" className="h-10 w-10" aria-hidden>
              <circle cx="32" cy="32" r="18" fill="none" stroke="#1e90ff" strokeWidth="3" />
              <circle cx="32" cy="32" r="9" fill="#12305c" />
              <circle cx="29" cy="29" r="3.5" fill="#5fb4ff" />
            </svg>
          </div>
          <div className="text-xs font-bold tracking-[0.3em] text-tech-glow">SMART MABAT</div>
          <h1 className="mt-1 text-2xl font-bold">מבט חכם</h1>
          <p className="mt-1 text-sm text-mute">AI Marketing · מבית יצחק פרוייקטים</p>
        </div>
        {missing.length > 0 ? (
          <div className="card border-amber-500/40 text-sm text-amber-200">
            <p className="font-bold">המערכת עדיין לא מוגדרת.</p>
            <p className="mt-2 text-amber-200/80">חסרים משתני סביבה ב-Vercel:</p>
            <ul className="mt-2 list-inside list-disc font-mono text-xs" dir="ltr">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <a href="/setup" className="btn-primary mt-4 w-full">
              ליצירת מפתחות וסיסמה
            </a>
          </div>
        ) : (
          <LoginForm />
        )}
      </div>
    </main>
  );
}
