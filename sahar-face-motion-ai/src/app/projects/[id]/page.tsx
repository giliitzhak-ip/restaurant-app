import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { requireUser } from "@/lib/require-user";
import { getProjectForUser } from "@/server/projects";
import { ACCEPT_ATTR, mediaLimits } from "@/server/media/policy";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/projects/${id}`);
  const project = await getProjectForUser(user.id, id);
  if (!project) notFound();
  const limits = mediaLimits();

  return (
    <AppShell user={user}>
      <ProjectWorkspace
        initial={project}
        accept={ACCEPT_ATTR}
        limits={{ maxBytes: limits.maxBytes, maxVideoSeconds: limits.maxVideoSeconds }}
      />
    </AppShell>
  );
}
