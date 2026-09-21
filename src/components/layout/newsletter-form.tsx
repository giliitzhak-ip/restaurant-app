"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { t } from "@/i18n";
import { routes } from "@/config/site";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/label";
import { MARKETING_CONSENT_TEXT } from "@/lib/consent";
import { subscribeNewsletterAction } from "@/server/actions/newsletter";

/**
 * Marketing signup.
 *
 * The checkbox is unticked, separate from the address field, and required —
 * an email address typed into a box is not consent to be marketed to, and a
 * box that arrives pre-ticked is not consent either.
 *
 * The collection notice sits above the submit button rather than behind a
 * link, because it has to be readable *before* the address is sent.
 */
export function NewsletterForm({ source = "footer" }: { source?: string }) {
  const [email, setEmail] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  const [state, setState] = React.useState<"idle" | "sending" | "done" | "error">("idle");
  const consentId = React.useId();
  const noticeId = React.useId();

  if (state === "done") {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-success">
        <Check className="size-4" aria-hidden />
        {t.footer.newsletterThanks}
      </p>
    );
  }

  return (
    <form
      className="w-full max-w-sm space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!consent) {
          setState("error");
          return;
        }
        setState("sending");
        const result = await subscribeNewsletterAction({
          email,
          consent: true,
          source: "FOOTER",
        });
        if (result.ok) {
          track("newsletter_signup", { source });
          setState("done");
        } else {
          setState("error");
        }
      }}
    >
      <div className="flex gap-2">
        <Input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t.footer.newsletterPlaceholder}
          aria-label={t.footer.newsletterPlaceholder}
          aria-describedby={noticeId}
          aria-invalid={state === "error"}
          className="bg-transparent"
        />
        <Button type="submit" variant="outline" loading={state === "sending"}>
          {t.footer.newsletterCta}
          <ArrowLeft aria-hidden />
        </Button>
      </div>

      {/*
        * One <label> wrapping both, rather than a checkbox beside a sibling
        * label: it makes the whole line the hit target, which is what gets an
        * 18px box past the 44×44 floor without growing the box itself.
        */}
      <label
        htmlFor={consentId}
        className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1 text-xs leading-relaxed text-muted"
      >
        <Checkbox
          id={consentId}
          checked={consent}
          onCheckedChange={(checked) => {
            setConsent(checked === true);
            if (checked === true && state === "error") setState("idle");
          }}
          aria-describedby={noticeId}
          className="mt-0.5"
        />
        <span>{MARKETING_CONSENT_TEXT}</span>
      </label>

      {/* Collection notice: who, what for, whether it is required, and where
          the policy is — shown before the address leaves the browser. */}
      <p id={noticeId} className="text-xs leading-relaxed text-muted">
        הכתובת נשמרת אצלנו לצורך משלוח הדיוור בלבד. מסירתה אינה חובה ואינה תנאי לרכישה.{" "}
        <Link href={routes.privacy} className="link-quiet underline">
          מדיניות פרטיות
        </Link>
      </p>

      {state === "error" ? (
        <FormMessage tone="error">
          {consent
            ? "לא הצלחנו לשמור את הכתובת. אפשר לנסות שוב בעוד רגע."
            : "כדי להירשם לדיוור יש לסמן את תיבת האישור."}
        </FormMessage>
      ) : null}
    </form>
  );
}
