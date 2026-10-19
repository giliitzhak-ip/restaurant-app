import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth/auth-page";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "התחברות | SAHAR FACE MOTION AI" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <AuthPage title="התחברות" subtitle="ברוכים השבים לסטודיו">
      <AuthForm mode="login" next={next} />
    </AuthPage>
  );
}
