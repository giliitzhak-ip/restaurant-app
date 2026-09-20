import * as React from "react";
import { Check, Circle, CircleDot, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A progress timeline.
 *
 * Used for the stages of an order and for the sections of the checkout form.
 * Both of those are things that genuinely have a state, and the component
 * renders that state and nothing else: there is no animation that implies
 * movement, no pulsing "in progress" marker on a step nothing is happening
 * to, and no estimated time. If the data says an order is awaiting payment,
 * the timeline says awaiting payment and stops there.
 *
 * Each state carries an icon, a shape and a word, never a colour on its own —
 * and the current step is marked with `aria-current`, so the position is
 * available to a screen reader rather than implied by a filled dot.
 *
 * The rail is a static line, not a filled bar that animates on mount: a
 * checkout progress bar sliding forward as the page loads is an animation of
 * something that did not just happen.
 */

export type StepState = "done" | "current" | "upcoming" | "failed";

export interface Step {
  id: string;
  label: string;
  /** Optional second line: a date, a reason, whatever the data actually says. */
  detail?: string;
  state: StepState;
}

const marks: Record<
  StepState,
  {
    icon: React.ComponentType<{ className?: string }>;
    dot: string;
    text: string;
    word: string;
  }
> = {
  done: {
    icon: Check,
    dot: "border-success bg-success text-white",
    text: "text-ink",
    word: "הושלם",
  },
  current: {
    icon: CircleDot,
    dot: "border-ink bg-ink text-canvas",
    text: "text-ink font-medium",
    word: "השלב הנוכחי",
  },
  upcoming: {
    icon: Circle,
    dot: "border-line-strong bg-surface text-muted",
    text: "text-muted",
    word: "טרם התחיל",
  },
  failed: {
    icon: TriangleAlert,
    dot: "border-danger bg-danger text-white",
    text: "text-danger",
    word: "נעצר",
  },
};

export function Steps({
  steps,
  className,
  compact = false,
}: {
  steps: readonly Step[];
  className?: string;
  /** Horizontal, label-under-dot. For a form header rather than an order. */
  compact?: boolean;
}) {
  return (
    <ol
      className={cn(
        compact ? "flex items-start gap-1" : "space-y-0",
        className,
      )}
    >
      {steps.map((step, index) => {
        const mark = marks[step.state];
        const Icon = mark.icon;
        const last = index === steps.length - 1;

        return (
          <li
            key={step.id}
            aria-current={step.state === "current" ? "step" : undefined}
            className={cn(
              "relative",
              compact ? "flex-1 text-center" : "flex gap-3 pb-6 last:pb-0",
            )}
          >
            {/* The rail. Drawn behind the dot, stopping at the last step. */}
            {!last ? (
              <span
                aria-hidden
                className={cn(
                  "absolute bg-line",
                  compact
                    ? "start-1/2 top-[11px] h-px w-full"
                    : "start-[11px] top-6 h-[calc(100%-1.5rem)] w-px",
                )}
              />
            ) : null}

            <span
              className={cn(
                "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border",
                compact && "mx-auto",
                mark.dot,
              )}
            >
              <Icon className="size-3" aria-hidden />
            </span>

            <span className={cn(compact ? "mt-1.5 block" : "min-w-0 pt-0.5")}>
              <span className={cn("block text-[0.8125rem]", mark.text)}>
                <span className="sr-only">{mark.word}: </span>
                {step.label}
              </span>
              {step.detail ? (
                <span className="num mt-0.5 block text-xs text-muted">
                  {step.detail}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
