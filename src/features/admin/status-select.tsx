"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { t } from "@/i18n";
import { useToast } from "@/components/ui/toast";

/** Inline status dropdown used by the orders and quotes tables. */
export function StatusSelect<T extends string>({
  value,
  options,
  onSave,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onSave: (next: T) => Promise<{ ok: boolean }>;
  label: string;
}) {
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  return (
    <select
      aria-label={label}
      value={value}
      disabled={pending}
      onChange={async (event) => {
        setPending(true);
        const result = await onSave(event.target.value as T);
        setPending(false);
        toast(
          result.ok
            ? { title: t.admin.saved }
            : { tone: "error", title: t.states.errorTitle },
        );
        router.refresh();
      }}
      className="h-9 rounded-sm border border-line-strong bg-surface px-2 text-xs text-ink focus:border-ink focus:outline-none disabled:opacity-50"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
