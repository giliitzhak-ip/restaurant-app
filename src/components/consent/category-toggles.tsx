"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CONSENT_CATEGORIES, type OptionalCategory } from "@/lib/consent";

export type CategorySelection = Record<OptionalCategory, boolean>;

/**
 * The four category switches, plus a save.
 *
 * Shared by the banner and the settings page so there is one description of
 * each category and one save path — two copies would drift, and a cookie panel
 * that describes the categories differently from the cookie policy is worse
 * than having no panel.
 *
 * Holds the draft internally and is **keyed by the caller** on the decision in
 * force. Re-opening the panel remounts it with the current choice, which is
 * why no effect is needed to push state back down.
 */
export function CategoryToggles({
  initial,
  onSave,
  className,
  saveLabel = "שמירת הבחירה שלי",
}: {
  initial: CategorySelection;
  onSave: (selection: CategorySelection) => void;
  className?: string;
  saveLabel?: string;
}) {
  const [draft, setDraft] = React.useState<CategorySelection>(initial);
  const [saved, setSaved] = React.useState(false);

  return (
    <div className={className}>
      <ul className="space-y-3">
        {CONSENT_CATEGORIES.map((category) => {
          const optional = category.key !== "necessary";
          const key = category.key as OptionalCategory;
          return (
            <li key={category.key} className="flex items-start gap-3">
              <div className="pt-0.5">
                <Switch
                  checked={optional ? draft[key] : true}
                  disabled={!optional}
                  aria-label={`${category.title}${optional ? "" : " — חיוניים, לא ניתן לכבות"}`}
                  onCheckedChange={(next) => {
                    if (!optional) return;
                    setSaved(false);
                    setDraft((current) => ({ ...current, [key]: next === true }));
                  }}
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {category.title}
                  {category.locked ? (
                    <span className="ms-2 text-xs font-normal text-muted">תמיד פעיל</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{category.body}</p>
                <ul className="mt-1.5 space-y-0.5 ps-4 text-xs text-muted">
                  {category.items.map((item) => (
                    <li key={item} className="list-disc">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onSave(draft);
            setSaved(true);
          }}
        >
          {saveLabel}
        </Button>
        {/* A silent save leaves a screen-reader user with no way to tell
            whether the button did anything. */}
        <span
          role="status"
          aria-live="polite"
          className={cn("min-h-5 text-sm text-success", !saved && "sr-only")}
        >
          {saved ? (
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-4" aria-hidden />
              הבחירה נשמרה.
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
