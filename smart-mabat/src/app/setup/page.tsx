import { missingConfig } from "@/lib/env";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const missing = missingConfig();
  return (
    <main className="safe-top mx-auto max-w-lg px-5 py-10">
      <h1 className="h1">הגדרה ראשונית</h1>
      {missing.length === 0 ? (
        <p className="mt-4 text-mute">המערכת מוגדרת. העמוד הזה כבוי.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-mute">
            העמוד מייצר מפתחות אקראיים ו-hash לסיסמה, כדי שתוכלו להעתיק אותם ל-Vercel מהאייפון. שום דבר לא נשמר בשרת, והעמוד נכבה
            אוטומטית אחרי שכל המשתנים מוגדרים.
          </p>
          <div className="card mt-4 text-sm">
            <div className="mb-1 text-mute">משתנים חסרים כרגע:</div>
            <div className="font-mono text-xs" dir="ltr">
              {missing.join(", ")}
            </div>
          </div>
          <SetupForm />
        </>
      )}
    </main>
  );
}
