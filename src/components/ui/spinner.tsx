import { cn } from "@/lib/utils";

/**
 * The one busy indicator.
 *
 * Four places used to import `Loader2` from lucide and spin it themselves,
 * each with its own size and colour. This is that, once, with the part they
 * all forgot: the spin is decoration, so the state is also carried as text
 * for anything that is not looking at the screen.
 *
 * `currentColor` throughout, so it inherits whatever it is placed on — the
 * ink button, the dark studio panel or a white card — without a prop.
 */
export function Spinner({
  className,
  label = "טוען",
  labelled = true,
}: {
  className?: string;
  /** Announced while the spinner is on screen. */
  label?: string;
  /**
   * Set to false when the surrounding control already announces the state
   * (a button with `aria-busy` and its own label), so it is not read twice.
   */
  labelled?: boolean;
}) {
  return (
    <span
      className={cn("inline-flex", className)}
      role={labelled ? "status" : undefined}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className="size-[1em] animate-[spin-soft_0.7s_linear_infinite]"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="2.5"
          opacity="0.25"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      {labelled ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
