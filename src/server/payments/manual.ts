import { createId } from "@/lib/utils";
import type { PaymentProvider } from "./types";

/**
 * Default provider: the order is recorded and a salesperson collects payment
 * (bank transfer, credit over the phone, or in the showroom). This is how most
 * flooring showrooms actually operate before a gateway is wired up, and it
 * keeps the checkout flow complete and testable end to end.
 */
export const manualProvider: PaymentProvider = {
  id: "manual",
  label: "תשלום טלפוני / העברה בנקאית",
  description:
    "ההזמנה נרשמת ונציג חוזר אליכם לתיאום התשלום ואישור האספקה. פרטי אשראי אינם נשמרים באתר.",
  async createIntent() {
    return { status: "AUTHORISED", reference: createId("man") };
  },
};
