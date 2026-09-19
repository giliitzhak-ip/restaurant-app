import { createId } from "@/lib/utils";
import type { PaymentProvider } from "./types";

/**
 * Default provider: the order is recorded and a salesperson collects payment
 * (bank transfer, credit over the phone, or in the showroom). This is how most
 * flooring showrooms actually operate before a gateway is wired up, and it
 * keeps the checkout flow complete and testable end to end.
 *
 * Note what it does *not* do: it never reports a payment as captured. The
 * order lands in PENDING and only a human moving it through the admin panel
 * marks it PAID, which is the truth of an offline settlement.
 */
export const manualProvider: PaymentProvider = {
  id: "manual",
  label: "תשלום טלפוני / העברה בנקאית",
  description:
    "ההזמנה נרשמת ונציג חוזר אליכם לתיאום התשלום ואישור האספקה. פרטי אשראי אינם נשמרים באתר.",
  supportsWebhook: false,
  async createIntent() {
    return { status: "OFFLINE", reference: createId("man") };
  },
  async verifyWebhook() {
    return { ok: false, reason: "the manual provider has no callback" };
  },
};
