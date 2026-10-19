"use client";

import { useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { usd } from "@/lib/money";
import type { BudgetStatus } from "@/server/billing";

export function BudgetForm({ initial, maxCents }: { initial: BudgetStatus; maxCents: number }) {
  const [budget, setBudget] = useState(initial);
  const [value, setValue] = useState((initial.monthlyBudgetCents / 100).toFixed(0));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const used = budget.spentCents + budget.reservedCents;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const res = await fetch("/api/account/budget", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ monthlyBudgetCents: Math.round(Number(value || 0) * 100) }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error ?? "השמירה נכשלה");
          setBudget(data.budget);
          setMsg({ ok: true, text: "התקציב נשמר" });
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-ash">נוצל החודש</span><span>{usd(budget.spentCents)}</span></div>
        <div className="flex justify-between"><span className="text-ash">שמור למשימות פעילות</span><span>{usd(budget.reservedCents)}</span></div>
        <div className="flex justify-between font-semibold"><span>יתרה</span><span className="text-gold">{usd(budget.availableCents)}</span></div>
        {budget.monthlyBudgetCents > 0 && <Progress value={(used / budget.monthlyBudgetCents) * 100} className="mt-2" label="ניצול התקציב" />}
        <p className="text-xs text-ash">משימות היום: {budget.jobsToday} מתוך {budget.dailyJobLimit}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="budget">תקציב חודשי לשירותי AI בתשלום (דולר)</Label>
        <div className="flex gap-2">
          <Input id="budget" type="number" inputMode="decimal" min={0} max={maxCents / 100} step={1} dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} className="text-left" />
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Wallet aria-hidden />}
            שמירה
          </Button>
        </div>
        <p className="text-xs text-ash">0 = שירותים בתשלום חסומים עבורכם. מקסימום {usd(maxCents)} לחודש. כל משימה דורשת בנוסף אישור עלות מפורש.</p>
      </div>
      {msg && <Alert variant={msg.ok ? "info" : "danger"}>{msg.text}</Alert>}
    </form>
  );
}
