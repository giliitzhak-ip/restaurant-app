"use client";

import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "9:16", label: "9:16", hint: "טיקטוק / ריל", box: "h-8 w-[18px]" },
  { value: "16:9", label: "16:9", hint: "יוטיוב", box: "h-[18px] w-8" },
  { value: "1:1", label: "1:1", hint: "ריבוע", box: "size-6" },
] as const;

export function AspectPicker({ value, onChange, name }: { value: string; onChange: (v: string) => void; name: string }) {
  return (
    <div role="radiogroup" className="grid grid-cols-3 gap-2">
      {OPTIONS.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-3 text-sm transition-colors",
            value === o.value ? "border-gold bg-gold/10 text-gold" : "border-steel bg-coal text-pearl/80 hover:border-gold/50",
          )}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
          <span className={cn("rounded-sm border-2 border-current", o.box)} aria-hidden />
          <span dir="ltr" className="font-semibold">{o.label}</span>
          <span className="text-[11px] text-ash">{o.hint}</span>
        </label>
      ))}
    </div>
  );
}
