"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { CategoryToggles } from "@/components/consent/category-toggles";
import { useConsent } from "@/components/consent/consent-provider";

/**
 * The persistent settings panel on /cookies.
 *
 * The banner is the first-visit prompt; this is the page a visitor can be
 * pointed at, bookmark and come back to. It states plainly when no choice has
 * been made yet, rather than showing switches that look like settings already
 * in force.
 */
export function ConsentSettingsPanel() {
  const { consent, decided, save, acceptAll, rejectAll } = useConsent();
  const headingId = React.useId();

  return (
    <section
      id="settings"
      aria-labelledby={headingId}
      className="scroll-mt-24 rounded-md border border-line bg-surface-2 p-5 md:p-6"
    >
      <h2 id={headingId} className="text-xl">
        הגדרות פרטיות
      </h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
        {decided
          ? `הבחירה הנוכחית שלכם נשמרה בתאריך ${new Date(consent.decidedAt).toLocaleDateString("he-IL")}. אפשר לשנות אותה כאן בכל רגע.`
          : "עדיין לא בחרתם. עד שתבחרו, כל הקטגוריות הלא־חיוניות כבויות ואינן פועלות."}
      </p>

      <CategoryToggles
        key={consent.decidedAt}
        initial={{
          functional: consent.functional,
          analytics: consent.analytics,
          marketing: consent.marketing,
        }}
        onSave={save}
        saveLabel="שמירת הבחירה"
        className="mt-5"
      />

      {/* Same variant, same size — accept and reject carry equal weight. */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
        <Button type="button" size="sm" onClick={acceptAll}>
          אישור הכול
        </Button>
        <Button type="button" size="sm" onClick={rejectAll}>
          דחיית הלא־חיוניים
        </Button>
      </div>
    </section>
  );
}
