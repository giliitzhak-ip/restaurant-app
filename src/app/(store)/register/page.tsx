import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser } from "@/server/auth/session";
import { AuthForm } from "@/features/account/auth-form";

export const metadata: Metadata = {
  title: t.account.registerTitle,
  robots: { index: false, follow: false },
};

export default async function RegisterPage() {
  if (await getSessionUser()) redirect(routes.account.root);

  return (
    <div className="container-page max-w-md py-16 md:py-24">
      <h1 className="text-display-sm">{t.account.registerTitle}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {t.account.registerSubtitle}
      </p>
      <div className="mt-8">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <AuthForm mode="register" />
        </Suspense>
      </div>
    </div>
  );
}
