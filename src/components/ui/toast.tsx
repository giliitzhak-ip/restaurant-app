"use client";

import * as React from "react";
import { AlertTriangle, Check, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/icon-button";

/**
 * Transient confirmations.
 *
 * Three things this had to get right and one it used to get wrong:
 *
 * · It no longer pulls in framer-motion. The enter and exit are two CSS
 *   keyframes; the only state React keeps is which toasts are on their way
 *   out, so they stay mounted long enough to animate and are then dropped.
 *   That is the entire animation library this file needed, and it takes the
 *   last client-side motion dependency out of the bundle with it.
 *
 * · Four tones, each with its own icon and its own word. Nothing here is
 *   distinguishable by colour alone.
 *
 * · `aria-live="polite"` on a region that is always in the DOM, so a screen
 *   reader announces what arrives instead of announcing the region itself.
 *
 * · The thing it got wrong: the stack sat flush against the bottom edge, on
 *   top of the mobile buy bar. It now honours `--toast-offset`, which a
 *   sticky action bar raises while it is showing, so a confirmation never
 *   covers the button that produced it.
 */

type ToastTone = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  action?: { label: string; href: string };
}

interface ToastContextValue {
  toast: (input: Omit<ToastItem, "id" | "tone"> & { tone?: ToastTone }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/** Icon and screen-reader word per tone — the tone is never only a colour. */
const tones: Record<
  ToastTone,
  { icon: React.ComponentType<{ className?: string }>; badge: string; word: string }
> = {
  success: { icon: Check, badge: "bg-success text-white", word: "הצלחה" },
  error: { icon: AlertTriangle, badge: "bg-danger text-white", word: "שגיאה" },
  warning: { icon: TriangleAlert, badge: "bg-warning text-white", word: "שימו לב" },
  info: { icon: Info, badge: "bg-ink text-canvas", word: "הודעה" },
};

/** Long enough to read the exit, short enough not to hold the slot. */
const EXIT_MS = 200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const [leaving, setLeaving] = React.useState<readonly string[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = React.useCallback((key: string) => {
    const timer = timers.current.get(key);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(key);
    }
  }, []);

  const dismiss = React.useCallback(
    (id: string) => {
      clearTimer(id);
      setLeaving((current) => (current.includes(id) ? current : [...current, id]));
      timers.current.set(
        `exit:${id}`,
        setTimeout(() => {
          setItems((current) => current.filter((item) => item.id !== id));
          setLeaving((current) => current.filter((value) => value !== id));
          timers.current.delete(`exit:${id}`);
        }, EXIT_MS),
      );
    },
    [clearTimer],
  );

  const toast = React.useCallback<ToastContextValue["toast"]>(
    ({ tone = "success", ...rest }) => {
      const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      // At most three on screen; the oldest leaves rather than the newest
      // being dropped, because the newest is the one that was just caused.
      setItems((current) => [...current.slice(-2), { id, tone, ...rest }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4500),
      );
    },
    [dismiss],
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className={cn(
          "pointer-events-none fixed inset-x-0 z-100 flex flex-col items-center gap-2 p-4 sm:items-start",
          // Sits above a mobile action bar when one is up, above the home
          // indicator when one is not.
          "bottom-[var(--toast-offset,0px)] pb-[max(1rem,env(safe-area-inset-bottom))]",
          "transition-[bottom] duration-[var(--dur-gentle)] ease-[var(--ease-out-soft)]",
        )}
      >
        {items.map((item) => {
          const { icon: Icon, badge, word } = tones[item.tone];
          const isLeaving = leaving.includes(item.id);
          return (
            <div
              key={item.id}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-sm border bg-surface p-3.5 shadow-raised",
                item.tone === "error" ? "border-danger/40" : "border-line",
                isLeaving
                  ? "animate-[exit-fade_var(--dur-gentle)_var(--ease-out-soft)_forwards]"
                  : "animate-[enter-rise_var(--dur-enter)_var(--ease-out-soft)_both]",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                  badge,
                )}
              >
                <Icon className="size-3" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">
                  <span className="sr-only">{word}: </span>
                  {item.title}
                </p>
                {item.description ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    {item.description}
                  </p>
                ) : null}
                {item.action ? (
                  <a
                    href={item.action.href}
                    className="interactive mt-2 inline-block rounded-xs text-xs font-medium text-brass underline underline-offset-4 hover:text-ink"
                  >
                    {item.action.label}
                  </a>
                ) : null}
              </div>
              <IconButton
                size="iconSm"
                label="סגירת ההודעה"
                variant="ghost"
                className="-me-1 -mt-1 shrink-0 text-muted"
                onClick={() => dismiss(item.id)}
              >
                <X />
              </IconButton>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
