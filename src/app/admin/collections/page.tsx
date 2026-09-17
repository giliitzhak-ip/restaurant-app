import type { Metadata } from "next";
import { t } from "@/i18n";
import { getRepository } from "@/server/repositories";
import { AdminPageHeader } from "@/features/admin/admin-table";
import { TaxonomyEditor } from "@/features/admin/taxonomy-editor";

export const metadata: Metadata = {
  title: t.admin.collections,
  robots: { index: false, follow: false },
};

export default async function AdminCollectionsPage() {
  const collections = await getRepository().listCollections();
  return (
    <div>
      <AdminPageHeader title={t.admin.collections} />
      <TaxonomyEditor kind="collection" collections={collections} />
    </div>
  );
}
