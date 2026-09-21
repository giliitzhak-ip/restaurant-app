"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FormMessage } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { routes } from "@/config/site";
import { legalFacts, LEGAL_PLACEHOLDER } from "@/config/legal";
import {
  submitCancellationAction,
  type CancellationResult,
} from "@/server/actions/cancellation";

const fact = (key: keyof typeof legalFacts) => legalFacts[key].value ?? LEGAL_PLACEHOLDER;

interface FieldErrors {
  orderNumber?: string;
  customerName?: string;
  email?: string;
  phone?: string;
  confirm?: string;
}

/**
 * Online cancellation notice.
 *
 * Accessibility decisions worth naming, because each is a common failure:
 *
 *  - every field has a real `<label>` tied by id, not a placeholder standing
 *    in for one;
 *  - errors are listed in a summary at the top that links to each bad field,
 *    *and* attached to the field itself via `aria-describedby`;
 *  - the summary takes focus after a failed submit, so a screen-reader user
 *    hears what went wrong instead of silence;
 *  - nothing is cleared on error — a form that empties itself after a
 *    validation failure is how people give up;
 *  - the reason box is explicitly optional and says so in its label.
 */
export function CancellationForm() {
  const [values, setValues] = React.useState({
    orderNumber: "",
    customerName: "",
    email: "",
    phone: "",
    items: "",
    reason: "",
  });
  const [confirm, setConfirm] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [state, setState] = React.useState<"idle" | "sending" | "error">("idle");
  const [reference, setReference] = React.useState<string | null>(null);
  const summaryRef = React.useRef<HTMLDivElement>(null);

  const ids = {
    orderNumber: React.useId(),
    customerName: React.useId(),
    email: React.useId(),
    phone: React.useId(),
    items: React.useId(),
    reason: React.useId(),
    confirm: React.useId(),
    summary: React.useId(),
  };

  function set(key: keyof typeof values) {
    return (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((current) => ({ ...current, [key]: event.target.value }));
  }

  if (reference) {
    return (
      <section
        aria-live="polite"
        className="rounded-md border border-success/40 bg-success/10 p-5 md:p-6"
      >
        <h2 className="flex items-center gap-2 text-xl">
          <CheckCircle2 className="size-5 text-success" aria-hidden />
          הבקשה התקבלה
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
          מספר הפנייה שלכם הוא{" "}
          <strong className="num font-semibold">{reference}</strong>. שמרו אותו — הוא מזהה
          את הבקשה מול שירות הלקוחות.
        </p>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
          הבקשה נרשמה אצלנו יחד עם מועד קבלתה. נציג יחזור אליכם, ואם נדרש מידע נוסף או אם
          חלה על פריט מסוים חריגה כלשהי — נסביר זאת בתשובה. ההזמנה עצמה לא בוטלה אוטומטית
          ולא נמחקה.
        </p>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
          אפשר לפנות אלינו גם ישירות: {fact("supportEmail")} · {fact("phone")}. כתובת
          למשלוח הודעת ביטול בדואר: {fact("returnsAddress")}.
        </p>
      </section>
    );
  }

  const errorList = Object.entries(errors).filter(([, message]) => Boolean(message));

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();

        const next: FieldErrors = {};
        if (values.orderNumber.trim().length < 3) next.orderNumber = "יש להזין מספר הזמנה.";
        if (values.customerName.trim().length < 2) next.customerName = "יש להזין שם מלא.";
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim()))
          next.email = "יש להזין כתובת דוא״ל תקינה.";
        if (values.phone.trim().length < 6) next.phone = "יש להזין מספר טלפון.";
        if (!confirm) next.confirm = "יש לאשר את ההצהרה כדי לשלוח את הבקשה.";

        if (Object.keys(next).length) {
          setErrors(next);
          setState("error");
          // Focus the summary so the failure is announced, not silent.
          requestAnimationFrame(() => summaryRef.current?.focus());
          return;
        }

        setErrors({});
        setState("sending");
        const result: CancellationResult = await submitCancellationAction({
          orderNumber: values.orderNumber,
          customerName: values.customerName,
          email: values.email,
          phone: values.phone,
          items: values.items.trim()
            ? [{ productName: values.items.trim().slice(0, 200), quantity: 1 }]
            : [],
          reason: values.reason.trim() || null,
          attachmentKey: null,
          confirm: true,
        });

        if (result.ok) {
          setReference(result.reference);
          return;
        }
        setState("error");
        setErrors({
          orderNumber:
            result.error === "RATE_LIMITED"
              ? "נשלחו יותר מדי בקשות מהכתובת הזו. אפשר לנסות שוב בעוד שעה, או לפנות אלינו בטלפון."
              : "לא הצלחנו לשמור את הבקשה. אפשר לנסות שוב, או לפנות אלינו בטלפון או בדוא״ל.",
        });
        requestAnimationFrame(() => summaryRef.current?.focus());
      }}
    >
      {errorList.length ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          id={ids.summary}
          className="rounded-sm border border-danger/40 bg-danger/10 p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        >
          <h2 className="text-sm font-semibold text-danger">
            {errorList.length === 1 ? "יש לתקן פרט אחד" : `יש לתקן ${errorList.length} פרטים`}
          </h2>
          <ul className="mt-2 space-y-1 ps-5 text-sm text-ink-soft">
            {errorList.map(([key, message]) => (
              <li key={key} className="list-disc">
                <a href={`#${ids[key as keyof typeof ids]}`} className="underline">
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="מספר הזמנה"
          htmlFor={ids.orderNumber}
          required
          error={errors.orderNumber}
        >
          <Input
            id={ids.orderNumber}
            value={values.orderNumber}
            onChange={set("orderNumber")}
            autoComplete="off"
          />
        </Field>

        <Field
          label="שם מלא"
          htmlFor={ids.customerName}
          required
          error={errors.customerName}
        >
          <Input
            id={ids.customerName}
            value={values.customerName}
            onChange={set("customerName")}
            autoComplete="name"
          />
        </Field>

        <Field label="דואר אלקטרוני" htmlFor={ids.email} required error={errors.email}>
          <Input
            id={ids.email}
            type="email"
            inputMode="email"
            value={values.email}
            onChange={set("email")}
            autoComplete="email"
          />
        </Field>

        <Field label="טלפון" htmlFor={ids.phone} required error={errors.phone}>
          <Input
            id={ids.phone}
            type="tel"
            inputMode="tel"
            value={values.phone}
            onChange={set("phone")}
            autoComplete="tel"
          />
        </Field>
      </div>

      <Field
        label="אילו פריטים (לא חובה)"
        htmlFor={ids.items}
        hint="אם משאירים ריק, נתייחס לבקשה כביטול ההזמנה כולה."
      >
        <Input
          id={ids.items}
          value={values.items}
          onChange={set("items")}
          placeholder="אם רוצים לבטל חלק מההזמנה בלבד — אילו פריטים"
        />
      </Field>

      <Field
        label="סיבת הביטול (לא חובה)"
        htmlFor={ids.reason}
        hint="אין חובה לנמק. השדה כאן רק אם תרצו לספר לנו מה לא התאים."
      >
        <Textarea id={ids.reason} value={values.reason} onChange={set("reason")} rows={3} />
      </Field>

      <label
        htmlFor={ids.confirm}
        className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1 text-sm leading-relaxed text-ink-soft"
      >
        <Checkbox
          id={ids.confirm}
          checked={confirm}
          onCheckedChange={(checked) => {
            setConfirm(checked === true);
            if (checked === true) setErrors((current) => ({ ...current, confirm: undefined }));
          }}
          aria-invalid={Boolean(errors.confirm)}
          aria-describedby={errors.confirm ? `${ids.confirm}-error` : undefined}
          className="mt-0.5"
        />
        <span>
          אני מאשר/ת שאני בעל/ת ההזמנה או מורשה/ית לפעול בשמה, ושהפרטים שמסרתי נכונים.
        </span>
      </label>
      {errors.confirm ? (
        <FormMessage tone="error" id={`${ids.confirm}-error`}>
          {errors.confirm}
        </FormMessage>
      ) : null}

      {/* Collection notice, before the send — not behind a link. */}
      <p className="rounded-sm border border-line bg-surface-2 p-3.5 text-xs leading-relaxed text-muted">
        הפרטים שתמסרו כאן משמשים אותנו לטיפול בבקשת הביטול בלבד, ונשמרים יחד עם ההזמנה
        לתקופה הנדרשת לפי דיני מס וחשבונאות. מסירת שם, טלפון ודוא״ל נדרשת כדי שנוכל לזהות את
        ההזמנה ולחזור אליכם; בלעדיהם לא נוכל לטפל בבקשה. פרטים נוספים ב
        <Link href={routes.privacy} className="link-quiet underline">
          מדיניות הפרטיות
        </Link>
        .
      </p>

      <Button type="submit" size="lg" loading={state === "sending"}>
        שליחת בקשת ביטול
      </Button>
    </form>
  );
}
