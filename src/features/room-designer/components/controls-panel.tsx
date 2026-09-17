"use client";

import { MoveHorizontal, MoveVertical, RotateCcw, Rows3 } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { TextureOrientation } from "@/types/catalog";
import type { DesignerController } from "../hooks/use-designer";

const orientations: {
  value: TextureOrientation;
  label: string;
  icon: typeof MoveHorizontal;
}[] = [
  { value: "HORIZONTAL", label: t.designer.orientationHorizontal, icon: MoveHorizontal },
  { value: "VERTICAL", label: t.designer.orientationVertical, icon: MoveVertical },
  { value: "DIAGONAL", label: t.designer.orientationDiagonal, icon: Rows3 },
];

/**
 * Render controls. Everything here maps to a physical decision the customer
 * would make with an installer: which way the planks run, how big they are,
 * how the rows line up.
 */
export function ControlsPanel({ controller }: { controller: DesignerController }) {
  const surface = controller.activeSurface;
  if (!surface) {
    return (
      <p className="text-xs text-studio-ink/50">
        {t.designer.editMaskHint}
      </p>
    );
  }

  const { settings } = surface;

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs text-studio-ink/60">{t.designer.orientation}</p>
        <div className="flex gap-1.5">
          {orientations.map((entry) => {
            const Icon = entry.icon;
            const active = settings.orientation === entry.value;
            return (
              <button
                key={entry.value}
                type="button"
                onClick={() => controller.updateSettings({ orientation: entry.value })}
                aria-pressed={active}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-sm border px-2 py-2.5 text-[0.6875rem] transition-colors",
                  active
                    ? "border-studio-ink bg-studio-ink text-studio"
                    : "border-studio-line text-studio-ink/70 hover:border-studio-ink/60",
                )}
              >
                <Icon className="size-4" />
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>

      <ControlSlider
        label={t.designer.scale}
        value={settings.scale}
        min={0.4}
        max={2.4}
        step={0.05}
        format={(value) => `×${value.toFixed(2)}`}
        onChange={(value) => controller.updateSettings({ scale: value })}
      />

      <ControlSlider
        label={t.designer.brightness}
        value={settings.brightness}
        min={-0.35}
        max={0.35}
        step={0.01}
        format={(value) => `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`}
        onChange={(value) => controller.updateSettings({ brightness: value })}
      />

      <ControlSlider
        label={t.designer.alignment}
        value={settings.offsetX}
        min={0}
        max={1}
        step={0.02}
        format={(value) => `${Math.round(value * 100)}%`}
        onChange={(value) => controller.updateSettings({ offsetX: value })}
      />

      <ControlSlider
        label="שבירת שורות"
        value={settings.stagger}
        min={0}
        max={0.9}
        step={0.02}
        format={(value) => `${Math.round(value * 100)}%`}
        onChange={(value) => controller.updateSettings({ stagger: value })}
      />

      <ControlSlider
        label="שמירת תאורה מקורית"
        value={settings.lightingStrength}
        min={0}
        max={1.2}
        step={0.05}
        format={(value) => `${Math.round(value * 100)}%`}
        onChange={(value) => controller.updateSettings({ lightingStrength: value })}
      />

      <ControlSlider
        label="רוחב החדר (מ׳)"
        value={controller.roomWidthM}
        min={1.5}
        max={9}
        step={0.1}
        format={(value) => `${value.toFixed(1)} מ׳`}
        onChange={(value) => controller.setRoomWidth(value)}
        hint="קובע את הקנה מידה של הלוחות ואת אומדן המ״ר"
      />

      <Button
        size="sm"
        variant="studioOutline"
        onClick={controller.resetSettings}
        className="w-full"
      >
        <RotateCcw />
        {t.designer.reset}
      </Button>
    </div>
  );
}

function ControlSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-studio-ink/60">{label}</span>
        <span className="num text-xs text-studio-ink">{format(value)}</span>
      </div>
      <Slider
        theme="studio"
        thumbLabel={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(next[0] ?? value)}
      />
      {hint ? <p className="text-[0.6875rem] text-studio-ink/40">{hint}</p> : null}
    </div>
  );
}
