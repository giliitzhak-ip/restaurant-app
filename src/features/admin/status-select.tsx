"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { t } from "@/i18n";
import { NativeSelect } from "@/components/ui/native-select";
import { useToast } from "@/components/ui/toast";
import { setOrderStatusAction, setQuoteStatusAction } from "@/server/actions/admin";
import type { OrderStatus, QuoteStatus } from "@/types/commerce";

/**
 * Inline status dropdowns.
 *
 * The server action is imported here rather than passed down as a prop: a
 * server component cannot hand a closure to a client component, and these
 * tables are server-rendered.
 */
function StatusSelect<T extends string>({
  value,
  options,
  save,
  label,
}: {
  value: T;
  /** `settable: false` renders the current state without offering it as a move. */
  options: { value: T; label: string; settable?: boolean }[];
  save: (next: T) => Promise<{ ok: boolean }>;
  label: string;
}) {
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  return (
    <NativeSelect
      size2="sm"
      aria-label={label}
      value={value}
      disabled={pending}
      onChange={async (event) => {
        setPending(true);
        const result = await save(event.target.value as T);
        setPending(false);
        toast(
          result.ok
            ? { title: t.admin.saved }
            : { tone: "error", title: t.states.errorTitle },
        );
        router.refresh();
      }}
      className="w-auto"
    >
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.settable === false && option.value !== value}
        >
          {option.label}
        </option>
      ))}
    </NativeSelect>
  );
}

/**
 * The payment states are shown so the row reads correctly, but they are not
 * offered as moves: only the gateway callback may put an order into or out of
 * PAYMENT_PENDING, and a person clicking a dropdown is not a payment.
 */
const orderStatusOptions: { value: OrderStatus; label: string; settable?: boolean }[] = [
  { value: "PAYMENT_PENDING", label: "ממתינה לאישור תשלום", settable: false },
  { value: "PAYMENT_FAILED", label: "התשלום נכשל", settable: false },
  { value: "PENDING", label: "ממתינה לתשלום", settable: false },
  { value: "PAID", label: "שולמה" },
  { value: "PROCESSING", label: "בהכנה" },
  { value: "SHIPPED", label: "נשלחה" },
  { value: "COMPLETED", label: "הושלמה" },
  { value: "CANCELLED", label: "בוטלה" },
];

const quoteStatusOptions: { value: QuoteStatus; label: string }[] = [
  { value: "NEW", label: "נקלטה" },
  { value: "IN_PROGRESS", label: "בטיפול" },
  { value: "SENT", label: "הצעה נשלחה" },
  { value: "WON", label: "אושרה" },
  { value: "LOST", label: "נסגרה" },
];

export function OrderStatusSelect({
  id,
  status,
  number,
}: {
  id: string;
  status: OrderStatus;
  number: string;
}) {
  return (
    <StatusSelect
      label={`סטטוס הזמנה ${number}`}
      value={status}
      options={orderStatusOptions}
      save={(next) => setOrderStatusAction(id, next)}
    />
  );
}

export function QuoteStatusSelect({
  id,
  status,
  number,
}: {
  id: string;
  status: QuoteStatus;
  number: string;
}) {
  return (
    <StatusSelect
      label={`סטטוס בקשה ${number}`}
      value={status}
      options={quoteStatusOptions}
      save={(next) => setQuoteStatusAction(id, next)}
    />
  );
}

export { orderStatusOptions, quoteStatusOptions };
