import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { FaceSwapStudio } from "@/components/face-swap/face-swap-studio";
import { requireUser } from "@/lib/require-user";
import { getProjectForUser } from "@/server/projects";
import { mediaLimits } from "@/server/media/policy";
import { selectedFaceSwapProvider } from "@/providers/face-swap";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Face Swap | SAHAR FACE MOTION AI" };

export default async function FaceSwapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/projects/${id}/face-swap`);
  const project = await getProjectForUser(user.id, id);
  if (!project) notFound();
  const provider = selectedFaceSwapProvider();

  return (
    <AppShell user={user}>
      {!provider ? (
        <Alert>ספק החלפת הפנים שהוגדר בשרת (FACE_SWAP_PROVIDER) אינו מוכר.</Alert>
      ) : (
        <FaceSwapStudio
          initial={project}
          maxBytes={mediaLimits().maxBytes}
          provider={{
            id: provider.id,
            name: provider.displayName,
            paid: provider.paid,
            maxDurationSec: provider.capabilities.maxDurationSec,
            notes: provider.notes,
            isMock: provider.id === "mock",
          }}
        />
      )}
    </AppShell>
  );
}
