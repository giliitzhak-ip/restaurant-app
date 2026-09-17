import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { brand } from "@/config/brand";
import { footerNav } from "@/config/site";
import { t } from "@/i18n";
import { BrandMark } from "@/components/layout/brand-mark";
import { NewsletterForm } from "@/components/layout/newsletter-form";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="container-page py-14 md:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_2fr]">
          <div>
            <BrandMark size="lg" withTagline className="text-ink" />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
              {t.home.heroSubtitle}
            </p>

            <div className="mt-7">
              <p className="text-sm font-medium text-ink">
                {t.footer.newsletterTitle}
              </p>
              <p className="mb-3 mt-1 text-xs text-muted">{t.footer.newsletterBody}</p>
              <NewsletterForm />
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {footerNav.map((group) => (
              <nav key={group.title} aria-label={group.title}>
                <h3 className="eyebrow mb-4">{group.title}</h3>
                <ul className="space-y-2.5">
                  {group.items.map((item) => (
                    <li key={`${group.title}-${item.href}-${item.label}`}>
                      <Link
                        href={item.href}
                        className="link-quiet text-sm text-ink-soft transition-colors hover:text-ink"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-14 grid gap-6 border-t border-line pt-8 sm:grid-cols-3">
          <div>
            <h3 className="eyebrow mb-3">{t.footer.showroom}</h3>
            <p className="flex items-start gap-2 text-sm text-ink-soft">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
              {brand.contact.address}
            </p>
            <p className="mt-2 flex items-start gap-2 text-sm text-ink-soft">
              <Clock className="mt-0.5 size-4 shrink-0 text-muted" />
              {brand.contact.hours}
            </p>
          </div>
          <div>
            <h3 className="eyebrow mb-3">{t.nav.callUs}</h3>
            <a
              href={brand.contact.phoneHref}
              className="flex items-center gap-2 text-sm text-ink-soft"
            >
              <Phone className="size-4 text-muted" />
              <span className="num">{brand.contact.phone}</span>
            </a>
            <a
              href={`mailto:${brand.contact.email}`}
              className="mt-2 flex items-center gap-2 text-sm text-ink-soft"
            >
              <Mail className="size-4 text-muted" />
              {brand.contact.email}
            </a>
          </div>
          <div className="sm:text-end">
            <p className="text-xs text-muted">
              © {new Date().getFullYear()} {brand.legal.companyName} · {t.footer.rights}
            </p>
            <p className="num mt-1 text-xs text-muted-soft">
              ח.פ. {brand.legal.companyId}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
