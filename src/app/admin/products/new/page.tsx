import type { Metadata } from "next";
import { t } from "@/i18n";
import { getRepository } from "@/server/repositories";
import { AdminPageHeader } from "@/features/admin/admin-table";
import { ProductForm } from "@/features/admin/product-form";

export const metadata: Metadata = {
  title: t.admin.newProduct,
  robots: { index: false, follow: false },
};

export default async function NewProductPage() {
  const repository = getRepository();
  const [categories, collections] = await Promise.all([
    repository.listCategories(),
    repository.listCollections(),
  ]);

  return (
    <div>
      <AdminPageHeader title={t.admin.newProduct} />
      <ProductForm product={null} categories={categories} collections={collections} />
    </div>
  );
}
