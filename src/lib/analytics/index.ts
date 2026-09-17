"use client";

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

function getDriver() {
  if (typeof window === "undefined") return noopDriver;
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
