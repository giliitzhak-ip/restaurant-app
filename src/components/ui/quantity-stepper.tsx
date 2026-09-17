"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 999,
  label,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label: string;
  className?: string;
}) {
  const set = (next: number) => onChange(Math.min(Math.max(next, min), max));

  return (
    <div
      className={cn(
        "inline-flex h-11 items-center rounded-sm border border-line-strong bg-surface",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => set(value - 1)}
        disabled={value <= min}
        aria-label={`הפחתת ${label}`}
        className="flex size-10 items-center justify-center text-ink transition-colors hover:bg-surface-2 disabled:opacity-35"
      >
        <Minus className="size-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        aria-label={label}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) set(next);
        }}
        className="num h-full w-12 border-x border-line bg-transparent text-center text-sm text-ink focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={value >= max}
        aria-label={`הוספת ${label}`}
        className="flex size-10 items-center justify-center text-ink transition-colors hover:bg-surface-2 disabled:opacity-35"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
