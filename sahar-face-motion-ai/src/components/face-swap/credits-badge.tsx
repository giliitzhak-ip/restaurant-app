"use client";

import { useState } from "react";
import { RefreshCw, Coins } from "lucide-react";
import type { ProviderAccount } from "@/providers/face-swap/types";

/** Remaining provider credits, refreshable (reads GET /v1/account through our server). */
export function CreditsBadge({ initial, error: initialError }: { initial: ProviderAccount | null; error: string | null }) {
  const [account, setAccount] = useState(initial);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <Coins className="size-4 text-gold" aria-hidden />
      {account ? (
        <span>
          נותרו <b className="text-gold">{account.credits.toLocaleString("he-IL")}</b> קרדיטים · תוכנית: {account.subscription ?? account.tier}
        </span>
      ) : (
        <span className="text-ash">{error ?? "יתרת קרדיטים לא זמינה"}</span>
      )}
      <button
        type="button"
        aria-label="רענון יתרה"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const d = await (await fetch("/api/face-swap/status?fresh=1")).json();
            setAccount(d.account ?? null);
            setError(d.accountError ?? null);
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-md p-1 text-ash hover:text-gold"
      >
        <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} aria-hidden />
      </button>
    </span>
  );
}
