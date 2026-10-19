import Link from "next/link";
import { Clock, CheckCircle2, FlaskConical, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { requireUser } from "@/lib/require-user";
import { CURRENT_PHASE, STUDIO_MODULES } from "@/lib/modules";
import { providerStatus } from "@/providers/registry";

export const metadata = { title: "סטודיו | SAHAR FACE MOTION AI" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");

  return (
    <AppShell user={user}>
      <section className="mb-8">
        <h1 className="text-3xl font-black sm:text-4xl">
          <span className="gold-text">הסטודיו שלך</span>
        </h1>
        <p className="mt-2 max-w-2xl text-ash">
          כאן יופיעו כלי היצירה. כל מודול מוצג עם מצבו האמיתי, ומודול שעדיין לא חובר מסומן ככזה ואינו מבצע פעולות מדומות.
        </p>
      </section>

      <Alert variant="info" className="mb-6">
        המערכת נמצאת בשלב {CURRENT_PHASE} מתוך 8: ספריית פרויקטים, העלאת קבצים לאחסון, בדיקת FFprobe ותצוגה מקדימה פעילים. כלי ה-AI ייפתחו לפי מפת הדרכים.
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STUDIO_MODULES.map((m) => {
          const live = m.phase <= CURRENT_PHASE;
          const provider = m.provider ? providerStatus(m.provider) : null;
          return (
            <Card key={m.slug} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle dir="auto">{m.title}</CardTitle>
                  <p className="text-xs text-gold/80">{m.subtitle}</p>
                </div>
                {live ? (
                  <Badge variant="success"><CheckCircle2 className="size-3" aria-hidden />פעיל</Badge>
                ) : (
                  <Badge variant="muted"><Clock className="size-3" aria-hidden />שלב {m.phase}</Badge>
                )}
              </div>
              <CardDescription className="flex-1">{m.description}</CardDescription>
              {live && m.href && (
                <Link href={m.href} className="inline-flex items-center gap-1 text-sm font-semibold text-gold hover:underline">
                  כניסה
                  <ArrowLeft className="size-4" aria-hidden />
                </Link>
              )}
              {provider && (
                <p className="flex items-center gap-1.5 text-xs text-ash">
                  <FlaskConical className="size-3.5 text-gold" aria-hidden />
                  ספק נבחר: {provider.displayName}
                  {provider.isMock && " (מצב בדיקות, ללא AI אמיתי)"}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
