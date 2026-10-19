"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { postJson } from "@/lib/api-client";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden />
        מחיקת החשבון וכל המידע
      </Button>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const password = String(new FormData(e.currentTarget).get("password") ?? "");
        const res = await postJson("/api/account", { password }, "DELETE");
        if (!res.ok) {
          setError(res.error);
          setBusy(false);
          return;
        }
        window.location.href = "/?deleted=1";
      }}
    >
      <Alert>פעולה זו בלתי הפיכה: החשבון, הפרויקטים, הקבצים, הקולות ורשומות ההסכמה יימחקו לצמיתות.</Alert>
      <div className="space-y-2">
        <Label htmlFor="del-password">הזינו סיסמה לאישור</Label>
        <Input id="del-password" name="password" type="password" dir="ltr" autoComplete="current-password" required className="text-left" />
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          מחיקה לצמיתות
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>ביטול</Button>
      </div>
    </form>
  );
}
