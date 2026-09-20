import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The panel.
 *
 * `rounded-lg border border-line bg-surface` was typed out in roughly fifty
 * places across the account pages, the admin tables, checkout and the cart,
 * with the radius and the border drifting between them. This is that panel,
 * named once.
 *
 * `interactive` is for a card that is itself a link or a button: the border
 * firms up and a shadow appears on hover, on pointer devices only, and never
 * a scale — a card that grows under the cursor pushes the grid around.
 *
 * `index` staggers a card's arrival inside a list. Pass the array index; the
 * delay is capped in CSS so row 40 is not held back.
 */
export function Card({
  className,
  as: Tag = "div",
  interactive,
  enter,
  index,
  style,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "article" | "li" | "section";
  interactive?: boolean;
  enter?: boolean;
  index?: number;
}) {
  return (
    <Tag
      className={cn(
        "card",
        interactive && "card-interactive",
        enter && "enter-item",
        className,
      )}
      style={
        enter && index !== undefined
          ? ({ ...style, "--enter-index": index } as React.CSSProperties)
          : style
      }
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-b border-line px-5 py-4", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg", className)} {...props} />;
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-t border-line px-5 py-4",
        className,
      )}
      {...props}
    />
  );
}
