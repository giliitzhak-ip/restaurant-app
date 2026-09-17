import type { Metadata } from "next";
import { t } from "@/i18n";
import { getRepository } from "@/server/repositories";
import { AdminPageHeader } from "@/features/admin/admin-table";
import { TaxonomyEditor } from "@/features/admin/taxonomy-editor";

export const metadata: Metadata = {
  title: t.admin.categories,
  robots: { index: false, follow: false },
};

export default async function AdminCategoriesPage() {
  const categories = await getRepository().listCategories();
  return (
    <div>
      <AdminPageHeader title={t.admin.categories} />
      <TaxonomyEditor kind="category" categories={categories} />
    </div>
  );
}
