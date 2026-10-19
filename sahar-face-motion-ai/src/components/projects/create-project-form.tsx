"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { AspectPicker } from "./aspect-picker";

export function CreateProjectForm({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [aspect, setAspect] = useState("9:16");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="lg">
        <Plus aria-hidden />
        פרויקט חדש
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const f = new FormData(e.currentTarget);
          try {
            const res = await fetch("/api/projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: f.get("name"), description: f.get("description"), aspectRatio: aspect }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok) throw new Error(data?.error ?? "יצירת הפרויקט נכשלה");
            window.location.href = `/projects/${data.id}`;
          } catch (err) {
            setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "אין חיבור לשרת. נסו שוב.");
            setBusy(false);
          }
        }}
      >
        <h2 className="text-lg font-bold">פרויקט חדש</h2>
        <div className="space-y-2">
          <Label htmlFor="p-name">שם הפרויקט</Label>
          <Input id="p-name" name="name" required maxLength={80} placeholder="למשל: ריקוד חתונה" autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-desc">תיאור (לא חובה)</Label>
          <Textarea id="p-desc" name="description" maxLength={500} rows={2} />
        </div>
        <div className="space-y-2">
          <Label>יחס מסך</Label>
          <AspectPicker name="aspect" value={aspect} onChange={setAspect} />
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            יצירה
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>ביטול</Button>
        </div>
      </form>
    </Card>
  );
}
