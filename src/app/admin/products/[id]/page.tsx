import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { t } from "@/i18n";
import { getRepository } from "@/server/repositories";
import { AdminPageHeader } from "@/features/admin/admin-table";
import { ProductForm } from "@/features/admin/product-form";

export const metadata: Metadata = {
  title: t.admin.editProduct,
  robots: { index: false, follow: false },
};

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repository = getRepository();
  const [product, categories, collections] = await Promise.all([
    repository.getProductById(id),
    repository.listCategories(),
    repository.listCollections(),
  ]);
  if (!product) notFound();

  return (
    <div>
      <AdminPageHeader title={t.admin.editProduct} description={product.name} />
      <ProductForm
        product={product}
        categories={categories}
        collections={collections}
      />
    </div>
  );
}
