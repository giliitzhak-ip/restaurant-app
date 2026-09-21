"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routes } from "@/config/site";
import { OPTIONAL_CATEGORIES } from "@/lib/consent";
import { CategoryToggles } from "./category-toggles";
import { useConsent } from "./consent-provider";

/**
 * Cookie consent.
 *
 * The rules this component exists to satisfy, and how each one shows up:
 *
 *  - **Equal prominence.** "אישור הכול" and "דחיית הלא־חיוניים" are the same
 *    variant, the same size and the same weight, sitting side by side. No
 *    greyed-out reject, no reject hidden one level down, no accept button
 *    styled as the only real action.
 *  - **No pre-ticked optional categories.** Every switch starts off and stays
 *    off until the visitor moves it.
 *  - **Reversible.** The footer's "הגדרות פרטיות" re-opens this panel, so a
 *    choice is never final.
 *  - **Non-blocking.** A `region`, not a modal: the banner does not trap focus
 *    and does not stop someone reading the privacy policy it links to. It sits
 *    early in the DOM so keyboard and screen-reader users reach it quickly.
 */
export function CookieBanner() {
  const { decided, settingsOpen, consent, acceptAll, rejectAll, save, closeSettings } =
    useConsent();

  const [customising, setCustomising] = React.useState(false);
  const headingId = React.useId();
  const ref = React.useRef<HTMLElement>(null);

  const visible = !decided || settingsOpen;

  /*
   * Publish the space the banner occupies, and get out of the way.
   *
   * A bar fixed to the bottom of the viewport sits *over* the page, so while
   * it is up the last few hundred pixels are unreachable. Two kinds of thing
   * live down there and each needs a different answer:
   *
   *  - ordinary page flow (the footer, including the privacy-settings link
   *    this banner tells people to use) — fixed by padding the body;
   *  - other bars that are themselves fixed to the bottom (the room
   *    designer's toolbar, the mobile buy bar) — padding does nothing for
   *    those, because they are out of flow too. They read
   *    `--consent-banner-height` and sit above it.
   *
   * This was not hypothetical: with the banner up, the designer's save button
   * was unclickable for every first-time visitor.
   *
   * Measured rather than guessed: the height depends on whether the category
   * panel is open and on how the Hebrew copy wraps at this width.
   */
  React.useEffect(() => {
    const node = ref.current;
    const clear = () => {
      document.body.style.paddingBottom = "";
      document.documentElement.style.removeProperty("--consent-banner-height");
    };
    if (!visible || !node) {
      clear();
      return;
    }
    const apply = () => {
      const height = `${node.offsetHeight}px`;
      document.body.style.paddingBottom = height;
      document.documentElement.style.setProperty("--consent-banner-height", height);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => {
      observer.disconnect();
      clear();
    };
  }, [visible]);

  if (!visible) return null;

  const showPanel = customising || settingsOpen;

  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className="fixed inset-x-0 bottom-0 z-[120] border-t border-line bg-surface shadow-lift"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="container-page max-h-[82dvh] overflow-y-auto py-4 md:py-5">
        <div className="mx-auto max-w-3xl">
          <h2 id={headingId} className="text-base font-semibold">
            קובצי Cookie באתר
          </h2>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-soft">
            אנחנו משתמשים בקובצי Cookie חיוניים כדי שהאתר יעבוד — סל קניות, התחברות ושמירת
            עיצובים. קטגוריות נוספות פועלות רק אם תאשרו אותן, ואפשר לשנות את הבחירה בכל רגע.{" "}
            <Link href={routes.cookies} className="link-quiet underline">
              מדיניות Cookie
            </Link>
          </p>

          {showPanel ? (
            /*
              * Keyed on the decision in force. Re-opening the panel from the
              * footer remounts it, so the switches show the visitor's current
              * choice rather than a stale draft — and no effect is needed to
              * push that state back down.
              */
            <CategoryToggles
              key={consent.decidedAt}
              initial={{
                functional: consent.functional,
                analytics: consent.analytics,
                marketing: consent.marketing,
              }}
              onSave={save}
              className="mt-4 border-t border-line-soft pt-4"
            />
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/*
              * Accept and reject are the same variant and size on purpose —
              * this is the "same prominence" rule, expressed in code rather
              * than in a policy document.
              */}
            <Button type="button" size="sm" onClick={acceptAll}>
              אישור הכול
            </Button>
            <Button type="button" size="sm" onClick={rejectAll}>
              דחיית הלא־חיוניים
            </Button>
            {showPanel ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCustomising(true)}
              >
                התאמה אישית
              </Button>
            )}
            {settingsOpen ? (
              <Button type="button" variant="ghost" size="sm" onClick={closeSettings}>
                סגירה
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The footer's permanent entry point.
 *
 * Consent has to be as easy to withdraw as it was to give; a link that is only
 * present on the first visit does not satisfy that.
 */
export function PrivacySettingsLink({ className }: { className?: string }) {
  const { openSettings } = useConsent();
  return (
    <button
      type="button"
      onClick={openSettings}
      /*
       * `tap-target` rather than padding: this sits inline in a footer
       * paragraph, and giving it a 44px box would push the lines around it
       * apart. The utility grows the hit area with a pseudo-element instead,
       * leaving the text where it is.
       */
      className={cn("tap-target inline-block", className)}
    >
      הגדרות פרטיות
    </button>
  );
}

export { OPTIONAL_CATEGORIES };
