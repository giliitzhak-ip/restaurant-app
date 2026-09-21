"use client";

import * as React from "react";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  DENIED_ALL,
  allowAll,
  hasDecided,
  parseConsent,
  rejectOptional,
  serialiseConsent,
  type ConsentChoice,
  type OptionalCategory,
} from "@/lib/consent";
import { setConsentAction } from "@/server/actions/consent";

/*
 * The cookie is the source of truth, and it is an external store: the server
 * writes it, this module writes it, and `track()` in the analytics module
 * reads it directly without going through React at all.
 *
 * So it is modelled as one — `useSyncExternalStore` over `document.cookie` —
 * rather than as React state mirrored into a cookie. That removes the class of
 * bug where the gate and the UI disagree about what was consented to, and it
 * means a withdrawal takes effect on the very next `track()` call rather than
 * after a re-render.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Raw cookie value. A string, so `useSyncExternalStore` can compare it. */
function readRaw(): string {
  if (typeof document === "undefined") return "";
  try {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
    return match?.slice(CONSENT_COOKIE.length + 1) ?? "";
  } catch {
    // A blocked cookie jar throws. Reads as "no decision", which is the safe
    // direction: nothing optional runs.
    return "";
  }
}

function writeCookie(choice: ConsentChoice) {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    // Encoded here, because a raw `document.cookie` write does no encoding of
    // its own — unlike `cookies().set()` on the server, which does.
    const value = encodeURIComponent(serialiseConsent(choice));
    document.cookie =
      `${CONSENT_COOKIE}=${value}; path=/; max-age=${CONSENT_MAX_AGE_SECONDS}` +
      `; SameSite=Lax${secure}`;
  } catch {
    /* Private mode with storage blocked. The server action still records it. */
  }
  for (const listener of listeners) listener();
}

interface ConsentContextValue {
  consent: ConsentChoice;
  /** False until the visitor has actually chosen. */
  decided: boolean;
  acceptAll: () => void;
  rejectAll: () => void;
  save: (categories: Record<OptionalCategory, boolean>) => void;
  /** Re-opens the settings panel from the footer link. */
  openSettings: () => void;
  settingsOpen: boolean;
  closeSettings: () => void;
}

const ConsentContext = React.createContext<ConsentContextValue | null>(null);

export function useConsent(): ConsentContextValue {
  const value = React.useContext(ConsentContext);
  if (!value) throw new Error("useConsent must be used inside ConsentProvider");
  return value;
}

/**
 * Holds the visitor's tracking choice.
 *
 * Seeded from the server so the first paint already knows the answer — a
 * banner that flashes on for every returning visitor is its own dark pattern.
 */
export function ConsentProvider({
  initial,
  children,
}: {
  initial: ConsentChoice;
  children: React.ReactNode;
}) {
  const serverSnapshot = React.useMemo(
    // Matches what `readRaw` returns on the client, which is the encoded form.
    () => (hasDecided(initial) ? encodeURIComponent(serialiseConsent(initial)) : ""),
    [initial],
  );
  const raw = React.useSyncExternalStore(subscribe, readRaw, () => serverSnapshot);
  const consent = React.useMemo(
    () => (raw ? parseConsent(raw) : hasDecided(initial) ? initial : DENIED_ALL),
    [raw, initial],
  );

  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const commit = React.useCallback(
    (next: ConsentChoice, source: "COOKIE_BANNER" | "PRIVACY_SETTINGS") => {
      // Cookie first: the visitor's choice takes effect immediately, whether
      // or not the audit write reaches the server.
      writeCookie(next);
      setSettingsOpen(false);
      void setConsentAction({
        functional: next.functional,
        analytics: next.analytics,
        marketing: next.marketing,
        source,
      });
    },
    [],
  );

  const value = React.useMemo<ConsentContextValue>(() => {
    const source = settingsOpen ? "PRIVACY_SETTINGS" : "COOKIE_BANNER";
    return {
      consent,
      decided: hasDecided(consent),
      acceptAll: () => commit(allowAll(), source),
      rejectAll: () => commit(rejectOptional(), source),
      save: (categories) =>
        commit(
          {
            version: consent.version,
            decidedAt: new Date().toISOString(),
            ...categories,
          },
          "PRIVACY_SETTINGS",
        ),
      openSettings: () => setSettingsOpen(true),
      settingsOpen,
      closeSettings: () => setSettingsOpen(false),
    };
  }, [consent, commit, settingsOpen]);

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

/**
 * Gate for anything in a consented category.
 *
 * Returns false until the visitor has decided, so nothing runs in the gap.
 */
export function useCategoryAllowed(category: OptionalCategory): boolean {
  const { consent, decided } = useConsent();
  return decided && consent[category];
}
