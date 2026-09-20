"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Info, Plus, Trash2 } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useToast } from "@/components/ui/toast";
import { useTransientFlag } from "@/components/ui/use-transient-flag";
import {
  deleteDesignObjectAssetAction,
  deleteDesignObjectCategoryAction,
  saveDesignObjectAssetAction,
  saveDesignObjectCategoryAction,
  uploadDesignObjectAssetAction,
} from "@/server/actions/admin";
import type { DesignObjectAsset, SceneSnapTarget } from "@/types/scene";
import type { DesignObjectCategoryRecord } from "@/server/repositories/types";

/**
 * The object library, from the other side.
 *
 * Two things here are commercial decisions rather than data entry, and the
 * screen is built around them.
 *
 * **Real dimensions.** Everything the designer does with an item — how big it
 * lands, whether a 65" reads as a 65", whether the magnets line it up with
 * the wall — comes from the centimetres typed here. They are not metadata,
 * they are the item.
 *
 * **Sold or illustrative.** An item is purchasable only when it is linked to
 * a live catalogue product, and then its price comes from that product. There
 * is nowhere on this form to type a price, because a price typed here would
 * be a price with nothing behind it and would be wrong the first time the
 * catalogue changed. The server drops the claim if the link does not resolve,
 * and says so rather than saving something that looks fine.
 */

const SNAP_LABELS: Record<SceneSnapTarget, string> = {
  WALL: "נצמד לקיר",
  FLOOR: "עומד על הרצפה",
  NICHE: "בתוך נישה",
  FREE: "חופשי",
};

interface AssetDraft {
  id?: string;
  categoryId: string;
  name: string;
  assetUrl: string;
  realWidthCm: number;
  realHeightCm: number;
  snap: SceneSnapTarget;
  soldOnSite: boolean;
  productId: string | null;
  sortOrder: number;
  enabled: boolean;
}

const emptyDraft = (categoryId: string): AssetDraft => ({
  categoryId,
  name: "",
  assetUrl: "",
  realWidthCm: 100,
  realHeightCm: 100,
  snap: "WALL",
  soldOnSite: false,
  productId: null,
  sortOrder: 0,
  enabled: true,
});

export function ObjectLibraryEditor({
  categories,
  assets,
  products,
}: {
  categories: DesignObjectCategoryRecord[];
  assets: DesignObjectAsset[];
  products: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  const [saved, markSaved] = useTransientFlag();
  const [selectedCategory, setSelectedCategory] = React.useState(
    categories[0]?.id ?? "",
  );
  const [draft, setDraft] = React.useState<AssetDraft | null>(null);

  const categoryByKey = React.useMemo(
    () => new Map(categories.map((category) => [category.key, category])),
    [categories],
  );

  const visibleAssets = React.useMemo(() => {
    const category = categories.find((entry) => entry.id === selectedCategory);
    if (!category) return assets;
    return assets.filter((asset) => asset.category === category.key);
  }, [assets, categories, selectedCategory]);

  const run = async (work: () => Promise<{ ok: boolean; error?: string }>) => {
    setPending(true);
    const result = await work();
    setPending(false);
    if (result.ok) {
      markSaved();
      toast({ title: t.admin.saved });
    } else if (result.error === "PRODUCT_NOT_SELLABLE") {
      // Saved, but not as a sellable item — say which, rather than implying
      // the whole save failed.
      toast({
        tone: "warning",
        title: "נשמר כפריט להמחשה",
        description:
          "המוצר המקושר לא נמצא בקטלוג או אינו פעיל, ולכן הפריט לא סומן כנמכר.",
      });
    } else {
      toast({ tone: "error", title: t.states.errorTitle });
    }
    router.refresh();
  };

  const upload = async (file: File) => {
    setPending(true);
    const form = new FormData();
    form.set("image", file);
    const result = await uploadDesignObjectAssetAction(form);
    setPending(false);
    if (result.ok) {
      setDraft((current) => (current ? { ...current, assetUrl: result.url } : current));
      return;
    }
    toast({
      tone: "error",
      title:
        result.error === "SVG_NOT_ACCEPTED"
          ? "קובצי SVG אינם נקלטים דרך הטופס"
          : t.states.errorTitle,
      description:
        result.error === "SVG_NOT_ACCEPTED"
          ? "SVG הוא מסמך ולא תמונה — סקריפט בתוכו היה רץ אצל כל לקוח. להוספת איור וקטורי השתמשו בגנרטור שבקוד."
          : undefined,
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      {/* ---------------------------- categories ---------------------------- */}
      <Card className="h-fit p-4">
        <h2 className="mb-3 text-sm font-medium text-ink">קטגוריות</h2>
        <ul className="space-y-1">
          {categories.map((category) => (
            <li key={category.id}>
              <div
                className={cn(
                  "flex items-center gap-1 rounded-sm px-1",
                  selectedCategory === category.id && "bg-surface-2",
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedCategory(category.id)}
                  className="press min-h-11 flex-1 rounded-sm px-2 text-start text-sm text-ink-soft"
                >
                  {category.name}
                  <span className="num ms-2 text-xs text-muted">
                    {category.assetCount}
                  </span>
                  {!category.enabled ? (
                    <Badge variant="neutral" className="ms-2">
                      מוסתרת
                    </Badge>
                  ) : null}
                </button>
                <IconButton
                  size="iconSm"
                  label={`מחיקת ${category.name}`}
                  className="text-danger"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(t.admin.confirmDelete)) return;
                    void run(() => deleteDesignObjectCategoryAction(category.id));
                  }}
                >
                  <Trash2 />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>

        <form
          className="mt-4 space-y-2 border-t border-line pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const form = event.currentTarget;
            void run(async () => {
              const result = await saveDesignObjectCategoryAction({
                key: String(data.get("key") ?? "").toUpperCase(),
                name: String(data.get("name") ?? ""),
                sortOrder: Number(data.get("sortOrder") ?? 0),
                enabled: true,
              });
              if (result.ok) form.reset();
              return result;
            });
          }}
        >
          <Field label="שם הקטגוריה" htmlFor="cat-name">
            <Input id="cat-name" name="name" required />
          </Field>
          <Field
            label="מפתח"
            htmlFor="cat-key"
            hint="אותיות גדולות באנגלית. המפתח נשמר בכל עיצוב — שינוי שלו מנתק עיצובים קיימים."
          >
            <Input id="cat-key" name="key" pattern="[A-Za-z][A-Za-z0-9_]*" required />
          </Field>
          <Field label="סדר תצוגה" htmlFor="cat-order">
            <Input id="cat-order" name="sortOrder" type="number" defaultValue={0} className="num" />
          </Field>
          <Button type="submit" size="sm" block loading={pending} success={saved}>
            <Plus />
            הוספת קטגוריה
          </Button>
        </form>
      </Card>

      {/* ------------------------------ assets ------------------------------ */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-ink">
            פריטים ({visibleAssets.length})
          </h2>
          <Button
            size="sm"
            disabled={!selectedCategory}
            onClick={() => setDraft(emptyDraft(selectedCategory))}
          >
            <Plus />
            פריט חדש
          </Button>
        </div>

        {draft ? (
          <Card className="p-4">
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const result = await saveDesignObjectAssetAction(draft);
                  if (result.ok) setDraft(null);
                  return result;
                });
              }}
            >
              <Field label="שם הפריט" htmlFor="asset-name" required className="sm:col-span-2">
                <Input
                  id="asset-name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  required
                />
              </Field>

              <Field
                label="רוחב אמיתי (ס״מ)"
                htmlFor="asset-width"
                required
                hint="הגודל האמיתי קובע איך הפריט נראה בחדר"
              >
                <Input
                  id="asset-width"
                  type="number"
                  min={1}
                  className="num"
                  value={draft.realWidthCm}
                  onChange={(event) =>
                    setDraft({ ...draft, realWidthCm: Number(event.target.value) })
                  }
                  required
                />
              </Field>
              <Field label="גובה אמיתי (ס״מ)" htmlFor="asset-height" required>
                <Input
                  id="asset-height"
                  type="number"
                  min={1}
                  className="num"
                  value={draft.realHeightCm}
                  onChange={(event) =>
                    setDraft({ ...draft, realHeightCm: Number(event.target.value) })
                  }
                  required
                />
              </Field>
              <p className="num -mt-2 text-xs text-muted sm:col-span-2">
                יחס גובה־רוחב:{" "}
                {(draft.realWidthCm / Math.max(1, draft.realHeightCm)).toFixed(2)} : 1
              </p>

              <Field label="נקודת הצמדה" htmlFor="asset-snap">
                <NativeSelect
                  id="asset-snap"
                  value={draft.snap}
                  onChange={(event) =>
                    setDraft({ ...draft, snap: event.target.value as SceneSnapTarget })
                  }
                >
                  {(Object.keys(SNAP_LABELS) as SceneSnapTarget[]).map((snap) => (
                    <option key={snap} value={snap}>
                      {SNAP_LABELS[snap]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="סדר תצוגה" htmlFor="asset-order">
                <Input
                  id="asset-order"
                  type="number"
                  className="num"
                  value={draft.sortOrder}
                  onChange={(event) =>
                    setDraft({ ...draft, sortOrder: Number(event.target.value) })
                  }
                />
              </Field>

              <Field
                label="תמונת הפריט"
                htmlFor="asset-url"
                required
                hint="PNG עם רקע שקוף. אין להעלות תמונה עם רקע לבן מובנה."
                className="sm:col-span-2"
              >
                <Input
                  id="asset-url"
                  value={draft.assetUrl}
                  onChange={(event) => setDraft({ ...draft, assetUrl: event.target.value })}
                  placeholder="/media/objects/…"
                  required
                />
              </Field>
              <div className="sm:col-span-2">
                <label className="press inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-dashed border-line-strong px-3 text-sm text-ink hover:border-ink">
                  העלאת תמונה
                  <input
                    type="file"
                    accept="image/png,image/webp,image/jpeg"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(file);
                      event.target.value = "";
                    }}
                  />
                </label>
                {draft.assetUrl ? (
                  <span className="relative ms-3 inline-block size-16 overflow-hidden rounded-sm bg-surface-2 align-middle">
                    <Image
                      src={draft.assetUrl}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-contain"
                      unoptimized
                    />
                  </span>
                ) : null}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Field label="מוצר מקושר מהקטלוג" htmlFor="asset-product">
                  <NativeSelect
                    id="asset-product"
                    value={draft.productId ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        productId: event.target.value || null,
                        soldOnSite: event.target.value ? draft.soldOnSite : false,
                      })
                    }
                  >
                    <option value="">ללא — פריט להמחשה בלבד</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-soft">
                  <Checkbox
                    checked={draft.soldOnSite}
                    disabled={!draft.productId}
                    onCheckedChange={(checked) =>
                      setDraft({ ...draft, soldOnSite: checked === true })
                    }
                  />
                  נמכר באתר וניתן להוספה לסל
                </label>
                <p className="flex items-start gap-1 text-xs leading-relaxed text-muted">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  המחיר נקרא מהמוצר בקטלוג ואינו נשמר כאן. פריט ללא מוצר מקושר מוצג
                  ללקוח כ״{t.designer.illustrationOnly}״.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="submit" loading={pending} success={saved}>
                  {t.common.save}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  {t.common.cancel}
                </Button>
              </div>
            </form>
          </Card>
        ) : null}

        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleAssets.map((asset, index) => (
            <li key={asset.id}>
              <Card enter index={index} className="flex gap-3 p-3">
                <span className="relative size-20 shrink-0 overflow-hidden rounded-sm bg-surface-2">
                  <Image
                    src={asset.assetUrl}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-contain p-1"
                    unoptimized
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{asset.name}</p>
                  <p className="num text-xs text-muted">
                    {asset.realWidthCm}×{asset.realHeightCm} ס״מ ·{" "}
                    {SNAP_LABELS[asset.snap]}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {asset.soldOnSite && asset.price !== null ? (
                      <Badge variant="brass">{formatPrice(asset.price)}</Badge>
                    ) : (
                      <Badge variant="neutral">{t.designer.illustrationOnly}</Badge>
                    )}
                    {!asset.enabled ? <Badge variant="outline">מוסתר</Badge> : null}
                  </div>
                  <div className="mt-2 flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDraft({
                          id: asset.id,
                          categoryId:
                            categoryByKey.get(asset.category)?.id ?? selectedCategory,
                          name: asset.name,
                          assetUrl: asset.assetUrl,
                          realWidthCm: asset.realWidthCm,
                          realHeightCm: asset.realHeightCm,
                          snap: asset.snap,
                          soldOnSite: asset.soldOnSite,
                          productId: asset.productId,
                          sortOrder: asset.sortOrder,
                          enabled: asset.enabled,
                        })
                      }
                    >
                      {t.common.edit}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        void run(() =>
                          saveDesignObjectAssetAction({
                            id: asset.id,
                            categoryId:
                              categoryByKey.get(asset.category)?.id ?? selectedCategory,
                            name: asset.name,
                            assetUrl: asset.assetUrl,
                            realWidthCm: asset.realWidthCm,
                            realHeightCm: asset.realHeightCm,
                            snap: asset.snap,
                            soldOnSite: asset.soldOnSite,
                            productId: asset.productId,
                            sortOrder: asset.sortOrder,
                            enabled: !asset.enabled,
                          }),
                        )
                      }
                    >
                      {asset.enabled ? "הסתרה" : "הצגה"}
                    </Button>
                    <IconButton
                      size="iconSm"
                      label={`מחיקת ${asset.name}`}
                      className="text-danger"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(t.admin.confirmDelete)) return;
                        void run(() => deleteDesignObjectAssetAction(asset.id));
                      }}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
