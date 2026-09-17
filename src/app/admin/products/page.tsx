import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getRepository } from "@/server/repositories";
import { AdminCell, AdminPageHeader, AdminTable } from "@/features/admin/admin-table";
import { ProductRowActions } from "@/features/admin/product-actions";

export const metadata: Metadata = {
  title: t.admin.products,
  robots: { index: false, follow: false },
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { items, total } = await getRepository().listProducts({
    search: q,
    includeInactive: true,
    limit: 200,
    sort: "new",
  });

  return (
    <div>
      <AdminPageHeader
        title={t.admin.products}
        description={`${total} מוצרים`}
        action={
          <Button asChild size="sm">
            <Link href={routes.admin.newProduct}>
              <Plus />
              {t.admin.newProduct}
            </Link>
          </Button>
        }
      />

      <form className="mb-5 flex max-w-md gap-2" action={routes.admin.products}>
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder={t.common.searchPlaceholder}
          aria-label={t.common.search}
        />
        <Button type="submit" variant="outline">
          {t.common.search}
        </Button>
      </form>

      <AdminTable
        head={["", "מוצר", "קטגוריה", "מחיר", "מלאי", "טקסטורה", "מצב", ""]}
      >
        {items.map((product) => (
          <tr key={product.id}>
            <AdminCell>
              <span className="relative block size-10 overflow-hidden rounded-xs bg-surface-2">
                {product.images[0] ? (
                  <Image
                    src={product.images[0].url}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                ) : null}
              </span>
            </AdminCell>
            <AdminCell>
              <Link href={routes.admin.product(product.id)} className="link-quiet">
                {product.name}
              </Link>
              <p className="num text-xs text-muted">{product.sku}</p>
            </AdminCell>
            <AdminCell className="text-muted">{product.categoryName}</AdminCell>
            <AdminCell className="num">
              {product.pricePerSqm
                ? `${formatPrice(product.pricePerSqm)} / מ״ר`
                : formatPrice(product.pricePerUnit)}
            </AdminCell>
            <AdminCell className="num">{product.stockUnits}</AdminCell>
            <AdminCell>
              {product.texture ? (
                <Badge variant="success">יש</Badge>
              ) : (
                <Badge variant="outline">אין</Badge>
              )}
            </AdminCell>
            <AdminCell>
              <div className="flex flex-wrap gap-1">
                {product.active ? (
                  <Badge variant="neutral">{t.admin.active}</Badge>
                ) : (
                  <Badge variant="warning">מוסתר</Badge>
                )}
                {product.featured ? <Badge variant="brass">מוצג</Badge> : null}
              </div>
            </AdminCell>
            <AdminCell>
              <ProductRowActions id={product.id} slug={product.slug} />
            </AdminCell>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
