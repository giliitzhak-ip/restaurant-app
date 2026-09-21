"use client";

import { CONSENT_COOKIE, hasDecided, parseConsent } from "@/lib/consent";
import type { AnalyticsEventName, AnalyticsEvents } from "./events";

type DriverName = "console" | "gtm" | "plausible" | "noop";

interface Driver {
  name: DriverName;
  track<E extends AnalyticsEventName>(event: E, payload: AnalyticsEvents[E]): void;
  pageView(path: string): void;
}

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    plausible?: (event: string, options?: { props: Record<string, unknown> }) => void;
  }
}

const consoleDriver: Driver = {
  name: "console",
  track(event, payload) {
    console.debug(`[analytics] ${event}`, payload);
  },
  pageView(path) {
    console.debug("[analytics] page_view", path);
  },
};

const gtmDriver: Driver = {
  name: "gtm",
  track(event, payload) {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({ event, ...payload });
  },
  pageView(path) {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({ event: "page_view", page_path: path });
  },
};

const plausibleDriver: Driver = {
  name: "plausible",
  track(event, payload) {
    window.plausible?.(event, { props: payload as Record<string, unknown> });
  },
  pageView() {
    // Plausible tracks page views from its own script.
  },
};

const noopDriver: Driver = {
  name: "noop",
  track() {},
  pageView() {},
};

function pickDriver(): Driver {
  const configured = process.env.NEXT_PUBLIC_ANALYTICS_DRIVER;
  switch (configured) {
    case "gtm":
      return gtmDriver;
    case "plausible":
      return plausibleDriver;
    case "off":
      return noopDriver;
    case "console":
      return consoleDriver;
    default:
      return process.env.NODE_ENV === "development" ? consoleDriver : noopDriver;
  }
}

let driver: Driver | null = null;

/**
 * The consent gate.
 *
 * Deliberately here rather than at each call site. There are a dozen `track()`
 * calls across the app and there will be more; a gate that every caller has to
 * remember is a gate that eventually leaks. Reading the cookie on each call is
 * cheap (a short string parse) and means a visitor who withdraws consent stops
 * being tracked on the very next event, without a reload.
 *
 * Not decided yet reads as *no*, so nothing is recorded in the gap between
 * first paint and the visitor answering the banner.
 */
function analyticsAllowed(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
    const choice = parseConsent(match?.slice(CONSENT_COOKIE.length + 1));
    return hasDecided(choice) && choice.analytics;
  } catch {
    return false;
  }
}

function getDriver() {
  if (typeof window === "undefined") return noopDriver;
  if (!analyticsAllowed()) return noopDriver;
  driver ??= pickDriver();
  return driver;
}

/**
 * Fire-and-forget event tracking. Never throws: a broken tag must not break
 * a checkout.
 */
export function track<E extends AnalyticsEventName>(
  event: E,
  payload: AnalyticsEvents[E],
) {
  try {
    getDriver().track(event, payload);
  } catch {
    /* analytics must never break the app */
  }
}

export function trackPageView(path: string) {
  try {
    getDriver().pageView(path);
  } catch {
    /* ignore */
  }
}

export type { AnalyticsEvents, AnalyticsEventName } from "./events";
