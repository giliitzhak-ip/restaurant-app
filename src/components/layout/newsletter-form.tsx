"use client";

import * as React from "react";
import { ArrowLeft, Check } from "lucide-react";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribeNewsletterAction } from "@/server/actions/newsletter";

export function NewsletterForm({ source = "footer" }: { source?: string }) {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );

  if (state === "done") {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-success">
        <Check className="size-4" />
        {t.footer.newsletterThanks}
      </p>
    );
  }

  return (
    <form
      className="flex w-full max-w-sm gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setState("sending");
        const result = await subscribeNewsletterAction(email);
        if (result.ok) {
          track("newsletter_signup", { source });
          setState("done");
        } else {
          setState("error");
        }
      }}
    >
      <Input
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={t.footer.newsletterPlaceholder}
        aria-label={t.footer.newsletterPlaceholder}
        aria-invalid={state === "error"}
        className="bg-transparent"
      />
      <Button type="submit" variant="outline" disabled={state === "sending"}>
        {t.footer.newsletterCta}
        <ArrowLeft />
      </Button>
    </form>
  );
}
