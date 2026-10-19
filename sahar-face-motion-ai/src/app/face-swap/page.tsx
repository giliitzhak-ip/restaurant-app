import Link from "next/link";
import { ScanFace, FolderOpen } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { JobStatusBadge } from "@/components/face-swap/job-status";
import { requireUser } from "@/lib/require-user";
import { db } from "@/lib/db";
import { usd } from "@/lib/money";
import { formatRelative } from "@/lib/format";
import { listProjectsForUser } from "@/server/projects";
import { selectedFaceSwapProvider } from "@/providers/face-swap";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Face Swap | SAHAR FACE MOTION AI" };

export default async function FaceSwapHome() {
  const user = await requireUser("/face-swap");
  const [projects, jobs] = await Promise.all([
    listProjectsForUser(user.id),
    db.job.findMany({
      where: { userId: user.id, type: "FACE_SWAP", approvedAt: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { project: { select: { id: true, name: true } } },
    }),
  ]);
  const provider = selectedFaceSwapProvider();

  return (
    <AppShell user={user}>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <ScanFace className="size-7 text-gold" aria-hidden />
          <span className="gold-text">AI Face Swap Studio</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ash">
          החלפת פנים בסרטון תוך שמירה על תנועות הגוף, תנועות הראש והאודיו המקורי. בוחרים פרויקט, מעלים תמונת פנים וסרטון, בוחרים את האדם, מאשרים זכויות ועלות, ומקבלים תצוגת לפני ואחרי.
        </p>
        {provider && (
          <p className="mt-2 text-xs text-ash">
            ספק פעיל: <span className="text-gold">{provider.displayName}</span>
            {provider.id === "mock" && " (מצב בדיקות)"}
          </p>
        )}
      </div>

      <h2 className="mb-3 text-lg font-bold">בחרו פרויקט</h2>
      <div className="mb-4">
        <CreateProjectForm startOpen={projects.length === 0} />
      </div>
      {projects.length > 0 && (
        <ul className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}/face-swap`} className="block">
                <Card className="flex items-center gap-3 p-3 hover:border-gold/50">
                  <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-coal">
                    {p.coverAssetId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/assets/${p.coverAssetId}/file?v=poster`} alt="" className="size-full object-cover" />
                    ) : (
                      <FolderOpen className="size-6 text-gold/50" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0">
                    <CardTitle className="truncate text-base" dir="auto">{p.name}</CardTitle>
                    <CardDescription>{p.counts.IMAGE} תמונות · {p.counts.VIDEO} סרטונים</CardDescription>
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {jobs.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-bold">משימות אחרונות</h2>
          <ul className="space-y-2">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link href={`/projects/${j.project.id}/face-swap#jobs`}>
                  <Card className="flex flex-wrap items-center gap-3 p-3 hover:border-gold/50">
                    <JobStatusBadge status={j.status} />
                    <span dir="auto" className="min-w-0 flex-1 truncate text-sm">{j.project.name}</span>
                    <Badge>{usd(j.actualCostCents ?? j.approvedCostCents ?? 0)}</Badge>
                    <span className="text-xs text-ash">{formatRelative(j.createdAt.toISOString())}</span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}
