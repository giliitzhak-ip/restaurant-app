/** Commerce event layer. Adapters (GA4, Meta) attach at the sink. */
export type AnalyticsEvent =
  | 'view_item' | 'search' | 'select_item' | 'add_to_cart' | 'remove_from_cart'
  | 'view_cart' | 'begin_checkout' | 'add_shipping_info' | 'add_payment_info' | 'purchase'

export interface AnalyticsPayload {
  event: AnalyticsEvent
  params?: Record<string, unknown>
}

export interface AnalyticsSink {
  readonly name: string
  track(payload: AnalyticsPayload): void
}

const sinks: AnalyticsSink[] = []

export function registerSink(sink: AnalyticsSink): void {
  sinks.push(sink)
}

let consentGranted = false

export function setAnalyticsConsent(granted: boolean): void {
  consentGranted = granted
}

/** Nothing is dispatched before the visitor grants consent. */
export function track(payload: AnalyticsPayload): void {
  if (!consentGranted) return
  for (const sink of sinks) {
    try {
      sink.track(payload)
    } catch {
      /* a broken analytics sink must never break the shop */
    }
  }
}

export function __resetAnalyticsForTests(): void {
  sinks.length = 0
  consentGranted = false
}
