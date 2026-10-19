import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/require-user";
import { systemStatus } from "@/server/system-status";
import type { ModuleKey } from "@/providers/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "מצב מערכת | SAHAR FACE MOTION AI" };

const CHECK_LABELS = {
  database: "מסד נתונים",
  queue: "תור משימות (Redis)",
  storage: "אחסון קבצים",
  worker: "Worker עיבוד מדיה",
  ffmpeg: "FFmpeg",
  ffprobe: "FFprobe",
} as const;
const MODULE_LABELS: Record<ModuleKey, string> = {
  faceSwap: "Face Swap",
  motion: "Motion Transfer",
  voice: "Voice",
  lipSync: "Lip Sync",
};

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="תקין" /> : <XCircle className="size-5 shrink-0 text-danger" aria-label="תקלה" />;
}

export default async function SystemPage() {
  const user = await requireUser("/system");
  const status = await systemStatus();

  return (
    <AppShell user={user}>
      <h1 className="mb-6 text-2xl font-bold">מצב מערכת</h1>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardTitle className="mb-4">תשתית</CardTitle>
          <ul className="space-y-3">
            {(Object.keys(CHECK_LABELS) as (keyof typeof CHECK_LABELS)[]).map((k) => (
              <li key={k} className="flex items-start gap-3">
                <StatusIcon ok={status.checks[k].ok} />
                <div className="min-w-0">
                  <p className="font-medium">{CHECK_LABELS[k]}</p>
                  <p dir="auto" className="truncate text-xs text-ash">{status.checks[k].detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle className="mb-4">ספקי AI</CardTitle>
          <ul className="space-y-4">
            {status.providers.map((p) => (
              <li key={p.module} className="flex items-start gap-3">
                {p.ready && !p.isMock ? (
                  <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
                ) : (
                  <AlertTriangle className="size-5 shrink-0 text-gold" aria-hidden />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {MODULE_LABELS[p.module]}: <span className="text-gold">{p.displayName}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.isMock && <Badge variant="gold">מצב בדיקות (Mock), לא מתבצע AI אמיתי</Badge>}
                    {!p.implemented && <Badge variant="muted">החיבור עדיין לא נבנה</Badge>}
                    {p.missingEnv.length > 0 && (
                      <Badge variant="danger">חסר: <span dir="ltr">{p.missingEnv.join(", ")}</span></Badge>
                    )}
                    {p.paid && !p.paidAllowed && <Badge variant="danger">שירות בתשלום חסום (ALLOW_PAID_PROVIDERS)</Badge>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}
