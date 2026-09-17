import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser } from "@/server/auth/session";
import { AuthForm } from "@/features/account/auth-form";

export const metadata: Metadata = {
  title: t.account.loginTitle,
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  if (await getSessionUser()) redirect(routes.account.root);

  return (
    <div className="container-page max-w-md py-16 md:py-24">
      <h1 className="text-display-sm">{t.account.loginTitle}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {t.account.loginSubtitle}
      </p>
      <div className="mt-8">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <AuthForm mode="login" />
        </Suspense>
      </div>
      <p className="mt-8 rounded-sm border border-line bg-surface p-4 text-xs leading-relaxed text-muted">
        {t.account.guestNote}
      </p>
    </div>
  );
}
