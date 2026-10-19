import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth/auth-page";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "הרשמה | SAHAR FACE MOTION AI" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <AuthPage title="יצירת חשבון" subtitle="פתחו חשבון כדי להתחיל ליצור">
      <AuthForm mode="register" />
    </AuthPage>
  );
}
