import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getRepository } from "@/server/repositories";

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const repository = getRepository();
  const [categories, collections] = await Promise.all([
    repository.listCategories(),
    repository.listCollections(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader categories={categories} collections={collections} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
