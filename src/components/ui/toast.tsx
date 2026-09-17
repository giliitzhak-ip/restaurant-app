"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

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

const icons: Record<ToastTone, React.ComponentType<{ className?: string }>> = {
  success: Check,
  error: AlertTriangle,
  info: Info,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = React.useCallback<ToastContextValue["toast"]>(
    ({ tone = "success", ...rest }) => {
      const id = Math.random().toString(36).slice(2, 10);
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
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-start"
      >
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const Icon = icons[item.tone];
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-sm border bg-surface p-3.5 shadow-raised",
                  item.tone === "error" ? "border-danger/40" : "border-line",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                    item.tone === "success" && "bg-success text-white",
                    item.tone === "error" && "bg-danger text-white",
                    item.tone === "info" && "bg-ink text-canvas",
                  )}
                >
                  <Icon className="size-3" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  {item.description ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">
                      {item.description}
                    </p>
                  ) : null}
                  {item.action ? (
                    <a
                      href={item.action.href}
                      className="mt-2 inline-block text-xs font-medium text-brass underline underline-offset-4"
                    >
                      {item.action.label}
                    </a>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="rounded-xs p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  aria-label="סגירת ההודעה"
                >
                  <X className="size-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
