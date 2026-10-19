"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";

/** Two-step destructive button: first tap asks, second tap confirms. Works well on touch screens. */
export function ConfirmButton({
  onConfirm,
  confirmLabel,
  children,
  ...props
}: Omit<ButtonProps, "onClick"> & { onConfirm: () => Promise<void> | void; confirmLabel: string }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <Button {...props} onClick={() => setAsking(true)}>
        {children}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        {...props}
        variant="destructive"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
      >
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        {confirmLabel}
      </Button>
      <Button size={props.size} variant="ghost" disabled={busy} onClick={() => setAsking(false)}>
        ביטול
      </Button>
    </span>
  );
}
