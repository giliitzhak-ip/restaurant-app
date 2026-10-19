"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { postJson } from "@/lib/api-client";

export function AuthForm({ mode, next }: { mode: "login" | "register"; next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      ...(isRegister && { name: String(form.get("name") ?? ""), acceptTerms: form.get("acceptTerms") === "on" }),
    };
    setBusy(true);
    const res = await postJson(isRegister ? "/api/auth/register" : "/api/auth/login", payload);
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    // Only allow same-site relative redirects.
    window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {isRegister && (
        <div className="space-y-2">
          <Label htmlFor="name">שם מלא</Label>
          <Input id="name" name="name" autoComplete="name" required minLength={2} maxLength={80} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">אימייל</Label>
        <Input id="email" name="email" type="email" dir="ltr" inputMode="email" autoComplete="email" autoCapitalize="none" required className="text-left" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">סיסמה</Label>
        <Input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={isRegister ? 10 : 1}
          className="text-left"
        />
        {isRegister && <p className="text-xs text-ash">לפחות 10 תווים, כולל אותיות וספרות.</p>}
      </div>

      {isRegister && (
        <label className="flex items-start gap-3 rounded-xl border border-steel bg-coal/60 p-3 text-sm leading-relaxed text-pearl/90">
          <input type="checkbox" name="acceptTerms" className="mt-1 size-5 shrink-0 accent-[#d4af37]" required />
          <span>
            קראתי ואני מסכים/ה ל
            <Link href="/terms" target="_blank" className="text-gold underline underline-offset-4">
              תנאי השימוש ומדיניות ההסכמה
            </Link>
            . אשתמש בפנים, בקולות ובסרטונים של אנשים רק בהסכמתם המפורשת, ולא אציג תוכן שנוצר ב-AI כהקלטה אותנטית.
          </span>
        </label>
      )}

      {error && <Alert>{error}</Alert>}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        {isRegister ? "יצירת חשבון" : "התחברות"}
      </Button>

      <p className="text-center text-sm text-ash">
        {isRegister ? (
          <>
            כבר יש לך חשבון?{" "}
            <Link href="/login" className="text-gold hover:underline">התחברות</Link>
          </>
        ) : (
          <>
            אין לך חשבון?{" "}
            <Link href="/register" className="text-gold hover:underline">הרשמה</Link>
          </>
        )}
      </p>
    </form>
  );
}
