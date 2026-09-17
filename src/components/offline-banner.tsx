"use client";

import * as React from "react";
import { WifiOff } from "lucide-react";
import { t } from "@/i18n";

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

const getSnapshot = () => navigator.onLine;
// Server render assumes online; the first client check corrects it.
const getServerSnapshot = () => true;

/**
 * Offline notice.
 *
 * The room designer keeps working without a connection (rendering is local),
 * but saving, checkout and search need the server — so say that plainly
 * instead of letting a button fail silently.
 */
export function OfflineBanner() {
  const online = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-xs text-white"
    >
      <WifiOff className="size-3.5 shrink-0" />
      <span>
        <strong className="font-medium">{t.states.offlineTitle}</strong>{" "}
        {t.states.offlineBody}
      </span>
    </div>
  );
}
