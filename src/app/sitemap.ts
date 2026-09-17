import type { MetadataRoute } from "next";
import { routes, siteUrl } from "@/config/site";
import { getRepository } from "@/server/repositories";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const repository = getRepository();
  const [categories, collections, products] = await Promise.all([
    repository.listCategories(),
    repository.listCollections(),
    repository.listProducts({ limit: 1000 }),
  ]);

  const url = (path: string) => `${siteUrl}${path}`;
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: url(routes.home), changeFrequency: "weekly", priority: 1, lastModified: now },
    { url: url(routes.catalog), changeFrequency: "daily", priority: 0.9, lastModified: now },
    { url: url(routes.designer), changeFrequency: "monthly", priority: 0.9, lastModified: now },
    { url: url("/collections"), changeFrequency: "weekly", priority: 0.7, lastModified: now },
    { url: url(routes.inspiration), changeFrequency: "monthly", priority: 0.6, lastModified: now },
    { url: url(routes.quote), changeFrequency: "yearly", priority: 0.6, lastModified: now },
    { url: url(routes.faq), changeFrequency: "monthly", priority: 0.5, lastModified: now },
    { url: url(routes.about), changeFrequency: "yearly", priority: 0.4, lastModified: now },
    { url: url(routes.contact), changeFrequency: "yearly", priority: 0.4, lastModified: now },
    { url: url(routes.shipping), changeFrequency: "yearly", priority: 0.3, lastModified: now },
    { url: url(routes.privacy), changeFrequency: "yearly", priority: 0.2, lastModified: now },
    { url: url(routes.terms), changeFrequency: "yearly", priority: 0.2, lastModified: now },
  ];

  return [
    ...staticPages,
    ...categories.map((category) => ({
      url: url(routes.category(category.slug)),
      changeFrequency: "weekly" as const,
      priority: 0.8,
      lastModified: now,
    })),
    ...collections.map((collection) => ({
      url: url(routes.collection(collection.slug)),
      changeFrequency: "weekly" as const,
      priority: 0.6,
      lastModified: now,
    })),
    ...products.items.map((product) => ({
      url: url(routes.product(product.slug)),
      changeFrequency: "weekly" as const,
      priority: 0.7,
      lastModified: new Date(product.createdAt),
    })),
  ];
}
