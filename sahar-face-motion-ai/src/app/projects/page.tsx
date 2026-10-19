import Link from "next/link";
import { FolderOpen, ImageIcon, Film, AudioLines, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { requireUser } from "@/lib/require-user";
import { listProjectsForUser } from "@/server/projects";
import { formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "פרויקטים | SAHAR FACE MOTION AI" };

export default async function ProjectsPage() {
  const user = await requireUser("/projects");
  const projects = await listProjectsForUser(user.id);

  return (
    <AppShell user={user}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">ספריית פרויקטים</h1>
          <p className="mt-1 text-sm text-ash">{projects.length ? `${projects.length} פרויקטים` : "עדיין אין פרויקטים"}</p>
        </div>
      </div>

      <div className="mb-6">
        <CreateProjectForm startOpen={projects.length === 0} />
      </div>

      {projects.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="group block focus-visible:outline-none">
                <Card className="overflow-hidden p-0 transition-colors group-hover:border-gold/50 group-focus-visible:border-gold">
                  <div className="relative grid aspect-video place-items-center bg-coal">
                    {p.coverAssetId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/assets/${p.coverAssetId}/file?v=poster`} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                    ) : (
                      <FolderOpen className="size-10 text-gold/40" aria-hidden />
                    )}
                    <span dir="ltr" className="absolute start-2 top-2 rounded-md bg-ink/80 px-1.5 py-0.5 text-[11px] text-gold">{p.aspectRatio}</span>
                  </div>
                  <div className="space-y-2 p-4">
                    <h2 className="truncate font-bold" dir="auto">{p.name}</h2>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-ash">
                      <span className="inline-flex items-center gap-1"><ImageIcon className="size-3.5" aria-hidden />{p.counts.IMAGE}</span>
                      <span className="inline-flex items-center gap-1"><Film className="size-3.5" aria-hidden />{p.counts.VIDEO}</span>
                      <span className="inline-flex items-center gap-1"><AudioLines className="size-3.5" aria-hidden />{p.counts.AUDIO}</span>
                      {p.counts.processing > 0 && (
                        <span className="inline-flex items-center gap-1 text-gold"><Loader2 className="size-3.5 animate-spin" aria-hidden />{p.counts.processing} בעיבוד</span>
                      )}
                      <span className="ms-auto">עודכן {formatRelative(p.updatedAt)}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
