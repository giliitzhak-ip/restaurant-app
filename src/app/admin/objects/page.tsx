import type { Metadata } from "next";
import { t } from "@/i18n";
import { getRepository } from "@/server/repositories";
import { AdminPageHeader } from "@/features/admin/admin-table";
import { ObjectLibraryEditor } from "@/features/admin/object-library-editor";

export const metadata: Metadata = {
  title: "ספריית פריטים",
  robots: { index: false, follow: false },
};

export default async function AdminObjectsPage() {
  const repository = getRepository();
  const [categories, assets, products] = await Promise.all([
    // Disabled rows included: this is the screen where you turn one back on.
    repository.listDesignObjectCategories({ includeDisabled: true }),
    repository.listDesignObjectAssets({ includeDisabled: true }),
    repository.listProducts({ limit: 300, sort: "popular" }),
  ]);

  return (
    <div>
      <AdminPageHeader
        title="ספריית פריטים למעצב החדר"
        description="הפריטים שהלקוח יכול להוסיף לחדר. הגודל האמיתי קובע איך הם נראים; מוצר מקושר קובע אם אפשר לקנות אותם."
      />
      <ObjectLibraryEditor
        categories={categories}
        assets={assets}
        products={products.items.map((product) => ({
          id: product.id,
          name: product.name,
        }))}
      />
      <p className="mt-6 max-w-prose text-xs leading-relaxed text-muted">
        {t.designer.illustrationOnly}: פריט ללא מוצר מקושר מוצג ללקוח כאיור בלבד,
        אינו נכלל במחיר ואינו ניתן להוספה לסל. המחיר של פריט נמכר נקרא מהמוצר
        בקטלוג בכל טעינה, כך שהוא לעולם אינו מתיישן.
      </p>
    </div>
  );
}
