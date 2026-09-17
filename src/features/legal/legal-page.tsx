import { Breadcrumbs } from "@/components/breadcrumbs";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

/** Shared shell for the legal pages: one column, generous measure. */
export function LegalPage({
  title,
  intro,
  updated,
  href,
  sections,
}: {
  title: string;
  intro: string;
  updated: string;
  href: string;
  sections: LegalSection[];
}) {
  return (
    <div className="container-page max-w-3xl py-8 md:py-12">
      <Breadcrumbs items={[{ label: title, href }]} />
      <h1 className="mt-6 text-display-sm">{title}</h1>
      <p className="num mt-2 text-xs text-muted">עודכן: {updated}</p>
      <p className="mt-5 text-[0.9375rem] leading-relaxed text-ink-soft">{intro}</p>

      <div className="mt-10 space-y-9">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
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
    </div>
  );
}
