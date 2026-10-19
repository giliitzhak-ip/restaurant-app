import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-20 w-full rounded-xl border border-steel bg-coal px-4 py-3 text-pearl placeholder:text-ash/70 focus-visible:border-gold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold",
        className,
      )}
      {...props}
    />
  );
}
