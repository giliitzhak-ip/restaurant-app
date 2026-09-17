import type { Metadata } from "next";
import { t } from "@/i18n";
import { getSessionUser } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";
import { ProfileForm } from "@/features/account/profile-form";

export const metadata: Metadata = {
  title: t.account.profile,
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const session = await getSessionUser();
  if (!session) return null;
  const user = await getRepository().getUserById(session.id);

  return (
    <div className="max-w-lg">
      <h2 className="text-xl">{t.account.profile}</h2>
      <div className="mt-6">
        <ProfileForm
          fullName={user?.fullName ?? session.fullName}
          phone={user?.phone ?? ""}
          email={session.email}
        />
      </div>
    </div>
  );
}
