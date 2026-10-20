import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { FaceSwapStudio } from "@/components/face-swap/face-swap-studio";
import { requireUser } from "@/lib/require-user";
import { getProjectForUser } from "@/server/projects";
import { mediaLimits } from "@/server/media/policy";
import { enabledFaceSwapProviders, selectedFaceSwapProvider, unavailableReason } from "@/providers/face-swap";
import { freeMode } from "@/server/billing";
import { providerAccount } from "@/server/face-swap";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Face Swap | SAHAR FACE MOTION AI" };

export default async function FaceSwapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/projects/${id}/face-swap`);
  const project = await getProjectForUser(user.id, id);
  if (!project) notFound();
  const provider = selectedFaceSwapProvider();
  const providers = await Promise.all(
    enabledFaceSwapProviders().map(async (p) => {
      const unavailable = unavailableReason(p);
      const acct = p.paid && !unavailable ? await providerAccount(p) : { account: null, error: null };
      return {
        id: p.id,
        name: p.displayName,
        paid: p.paid,
        maxDurationSec: p.capabilities.maxDurationSec,
        notes: p.notes,
        isMock: p.id === "mock",
        hasAccountApi: Boolean(p.account) && !unavailable,
        unavailable,
        account: acct.account,
        accountError: acct.error,
      };
    }),
  );

  return (
    <AppShell user={user}>
      {!provider ? (
        <Alert>ספק החלפת הפנים שהוגדר בשרת (FACE_SWAP_PROVIDER) אינו מוכר.</Alert>
      ) : (
        <FaceSwapStudio
          initial={project}
          maxBytes={mediaLimits().maxBytes}
          providers={providers}
          defaultProviderId={provider.id}
          freeMode={freeMode()}
        />
      )}
    </AppShell>
  );
}
