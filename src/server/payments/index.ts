import { hostedGatewayProvider } from "./hosted-gateway";
import { manualProvider } from "./manual";
import type { PaymentProvider } from "./types";

const providers: Record<string, PaymentProvider> = {
  manual: manualProvider,
  hosted: hostedGatewayProvider,
  // Israeli gateways all use the hosted-page flow; alias them so switching is
  // a single environment variable.
  tranzila: hostedGatewayProvider,
  cardcom: hostedGatewayProvider,
  meshulam: hostedGatewayProvider,
};

export function getPaymentProvider(): PaymentProvider {
  const configured = process.env.PAYMENT_PROVIDER?.toLowerCase() ?? "manual";
  return providers[configured] ?? manualProvider;
}

export type { PaymentProvider, PaymentIntentResult } from "./types";
