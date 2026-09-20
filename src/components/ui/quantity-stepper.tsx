"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/icon-button";

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
      <IconButton
        label={`הפחתת ${label}`}
        size="icon"
        className="size-10 rounded-none tap-target"
        onClick={() => set(value - 1)}
        disabled={value <= min}
      >
        <Minus />
      </IconButton>
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
        className="num h-full w-12 border-x border-line bg-transparent text-center text-sm text-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <IconButton
        label={`הוספת ${label}`}
        size="icon"
        className="size-10 rounded-none tap-target"
        onClick={() => set(value + 1)}
        disabled={value >= max}
      >
        <Plus />
      </IconButton>
    </div>
  );
}
