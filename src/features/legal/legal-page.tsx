import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { legalNav } from "@/config/site";
import { DRAFT_NOTICE, legalDocuments, type LegalDocumentKey } from "@/config/legal";

export interface LegalSection {
  heading: string;
  /** Optional: some sections are a heading and a list, nothing else. */
  paragraphs?: string[];
  bullets?: string[];
}

/**
 * Shared shell for the legal pages: one column, generous measure.
 *
 * Three things every one of these pages carries, and none of them are
 * decoration:
 *
 *  - the draft notice, because these texts have not been through a lawyer and
 *    a reader is entitled to know that before relying on them;
 *  - the document version alongside the date, because consent records store
 *    the version and "which text did I agree to" has to be answerable;
 *  - the full legal index, because someone arriving from a search result on
 *    the cancellation policy needs the terms it refers to.
 */
export function LegalPage({
  title,
  intro,
  document,
  href,
  sections,
  notice,
  children,
}: {
  title: string;
  intro: string;
  /** Which document this is; supplies the version and effective date. */
  document: LegalDocumentKey;
  href: string;
  sections: LegalSection[];
  /** Extra caveat above the draft notice — accessibility uses it. */
  notice?: string;
  /** Interactive content (a form, a consent panel) rendered after the prose. */
  children?: React.ReactNode;
}) {
  const meta = legalDocuments[document];

  return (
    <div className="container-page max-w-3xl py-8 md:py-12">
      <Breadcrumbs items={[{ label: title, href }]} />
      <h1 className="mt-6 text-display-sm">{title}</h1>
      <p className="num mt-2 text-xs text-muted">
        עודכן: {meta.date} · גרסת מסמך: {meta.version}
      </p>

      <div
        role="note"
        className="mt-5 flex gap-2.5 rounded-sm border border-warning/40 bg-warning/10 p-3.5 text-[0.8125rem] leading-relaxed text-ink-soft"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="space-y-1.5">
          <p>{DRAFT_NOTICE}</p>
          {notice ? <p>{notice}</p> : null}
        </div>
      </div>

      <p className="mt-5 text-[0.9375rem] leading-relaxed text-ink-soft">{intro}</p>

      <div className="mt-10 space-y-9">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl">{section.heading}</h2>
            {(section.paragraphs ?? []).map((paragraph) => (
              <p
                key={paragraph.slice(0, 24)}
                className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted"
              >
                {paragraph}
              </p>
            ))}
            {section.bullets ? (
              <ul className="mt-3 space-y-1.5 ps-5 text-[0.9375rem] leading-relaxed text-muted">
                {section.bullets.map((bullet) => (
                  <li key={bullet.slice(0, 24)} className="list-disc">
                    {bullet}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      {children ? <div className="mt-10">{children}</div> : null}

      <nav aria-label="מסמכים משפטיים" className="mt-14 border-t border-line pt-6">
        <h2 className="text-xs font-semibold tracking-wide text-muted">המסמכים שלנו</h2>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {legalNav
            .filter((item) => item.href !== href)
            .map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="link-quiet text-[0.8125rem]">
                  {item.label}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  );
}

/**
 * Renders a business fact, or a visible marker when it has not been supplied.
 *
 * The marker matters: the alternative is a sentence that reads "ניתן לפנות
 * אלינו בטלפון ." — which looks like a rendering bug and tells the reader
 * nothing. This says plainly that the detail is outstanding.
 */
export function LegalFactValue({ value }: { value: string | null }) {
  if (value) return <>{value}</>;
  return (
    <span className="rounded-xs bg-warning/15 px-1.5 py-0.5 text-[0.8125rem] text-warning">
      — טרם הושלם —
    </span>
  );
}
