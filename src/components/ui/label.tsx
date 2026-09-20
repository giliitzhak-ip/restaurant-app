"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { Check, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn("mb-1.5 block text-[0.8125rem] font-medium text-ink-soft", className)}
    {...props}
  />
));
Label.displayName = "Label";

/**
 * A message under a field.
 *
 * It fades rather than slides. A message that slides in pushes every field
 * below it down by its own height at the exact moment someone is reading or
 * reaching for the next one, and on a form with three errors that happens
 * three times. Opacity costs nothing and moves nothing.
 *
 * The icon is not decoration: an error that is only red is invisible to a
 * good share of the people filling the form in.
 */
export function FormMessage({
  tone,
  children,
  id,
  className,
}: {
  tone: "error" | "success" | "hint";
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  if (!children) return null;
  const Icon = tone === "error" ? CircleAlert : tone === "success" ? Check : null;
  return (
    <p
      id={id}
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "mt-1.5 flex items-start gap-1 text-xs enter-soft",
        tone === "error" && "text-danger",
        tone === "success" && "text-success",
        tone === "hint" && "text-muted",
        className,
      )}
    >
      {Icon ? <Icon className="mt-px size-3.5 shrink-0" aria-hidden /> : null}
      <span>{children}</span>
    </p>
  );
}

/**
 * Label + control + message, with the wiring between them done here.
 *
 * `aria-invalid` and `aria-describedby` are applied to the control by cloning
 * it, because every form in the codebase was passing a bare `<Input>` and
 * none of them were setting either. Doing it in one place means a field with
 * an error announces the error, instead of announcing a name and leaving the
 * reason on screen for people who can see it.
 *
 * `success` is the inline confirmation the flows use instead of a modal — a
 * saved profile or an accepted coupon says so under the field that changed.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  success,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  success?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;
  const describedBy =
    [error ? errorId : null, hint && !error ? hintId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        "aria-invalid": error ? true : undefined,
        "aria-describedby":
          [
            (children.props as Record<string, unknown>)["aria-describedby"],
            describedBy,
          ]
            .filter(Boolean)
            .join(" ") || undefined,
      })
    : children;

  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="text-danger" aria-hidden>
            {" *"}
          </span>
        ) : null}
        {required ? <span className="sr-only"> (שדה חובה)</span> : null}
      </Label>
      {control}
      {hint && !error ? (
        <FormMessage tone="hint" id={hintId}>
          {hint}
        </FormMessage>
      ) : null}
      {error ? (
        <FormMessage tone="error" id={errorId}>
          {error}
        </FormMessage>
      ) : null}
      {success && !error ? <FormMessage tone="success">{success}</FormMessage> : null}
    </div>
  );
}
