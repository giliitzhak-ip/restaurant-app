import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { blurDataUrl } from "@/lib/media";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getRepository } from "@/server/repositories";

export const metadata: Metadata = {
  title: t.nav.collections,
  description: t.home.collectionsTitle,
  alternates: { canonical: "/collections" },
};

export default async function CollectionsPage() {
  const collections = await getRepository().listCollections();

  return (
    <div className="container-page py-8 md:py-12">
      <Breadcrumbs items={[{ label: t.nav.collections, href: "/collections" }]} />
      <header className="mt-6 max-w-2xl">
        <h1 className="text-display-sm">{t.home.collectionsTitle}</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
          כל קולקציה היא שפה עיצובית שלמה — גוונים, מרקמים ומידות שעובדים יחד בכל
          חדרי הבית.
        </p>
      </header>

      <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((collection) => (
          <li key={collection.slug}>
            <Link href={routes.collection(collection.slug)} className="group block">
              <span className="relative block aspect-3/4 overflow-hidden rounded-sm bg-surface-2">
                <Image
                  src={collection.heroImage}
                  alt={collection.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  placeholder="blur"
                  blurDataURL={blurDataUrl}
                  className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.04]"
                />
              </span>
              <h2 className="mt-4 font-display text-xl text-ink">{collection.name}</h2>
              <p className="mt-1 text-sm text-muted">{collection.description}</p>
              <p className="mt-3 text-xs leading-relaxed text-muted-soft">
                {collection.story}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
