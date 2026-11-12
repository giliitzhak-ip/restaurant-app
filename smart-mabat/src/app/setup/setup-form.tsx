"use client";

import { useActionState, useState } from "react";
import { generateSetupValues } from "@/actions/setup";

export function SetupForm() {
  const [state, action, pending] = useActionState(generateSetupValues, undefined);
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <div className="mt-4 space-y-4">
      <form action={action} className="card space-y-3">
        <label className="label" htmlFor="password">
          סיסמת מנהל חדשה (12+ תווים)
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} className="input" dir="ltr" />
        {state?.error && <p className="text-sm text-red-300">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? "מייצר…" : "צור ערכים"}
        </button>
      </form>

      {state?.values && (
        <div className="card space-y-3">
          <p className="text-sm text-amber-200">העתיקו כל ערך ל-Vercel → Settings → Environment Variables. אל תשתפו אותם עם אף אחד.</p>
          {Object.entries(state.values).map(([k, v]) => (
            <div key={k}>
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-xs text-soft" dir="ltr">
                  {k}
                </span>
                <button
                  type="button"
                  className="text-xs text-tech-glow"
                  onClick={() => {
                    navigator.clipboard.writeText(v);
                    setCopied(k);
                  }}
                >
                  {copied === k ? "הועתק ✓" : "העתק"}
                </button>
              </div>
              <div className="rounded-lg bg-ink-850 p-2 font-mono text-[11px] break-all select-all" dir="ltr">
                {v}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
