"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { slugify } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/toast";
import {
  materialLabels,
  patternLabels,
  styleLabels,
  surfaceLabels,
  toneLabels,
  usageLabels,
  waterLabels,
} from "@/features/catalog/labels";
import { ImageUpload } from "@/features/admin/image-upload";
import { saveProductAction } from "@/server/actions/admin";
import type { ProductInput } from "@/server/repositories/types";
import type { Category, Collection, Product, StyleTag } from "@/types/catalog";

/** The form works with concrete types; the action re-validates on the server. */
type FormState = ProductInput;

const emptyForm: FormState = {
  slug: "",
  sku: "",
  name: "",
  subtitle: "",
  brand: "Terra Nova",
  categorySlug: "",
  collectionSlug: null,
  description: "",
  installationNotes: "",
  maintenanceNotes: "",
  pricePerUnit: 0,
  compareAtPrice: null,
  pricingUnit: "PACKAGE",
  packageCoverageSqm: null,
  stockUnits: 0,
  leadTimeDays: 5,
  sampleAvailable: true,
  quoteOnly: false,
  featured: false,
  isNew: true,
  bestSeller: false,
  active: true,
  specs: {
    material: "WOOD",
    materialLabel: "",
    widthMm: 190,
    lengthMm: 1900,
    thicknessMm: 14,
    colorName: "",
    colorHex: "#c2a077",
    tone: "NATURAL",
    style: ["MINIMAL"],
    textureLabel: "",
    durability: "",
    warrantyYears: 15,
    installationType: "",
    waterResistance: "SPLASH_PROOF",
    usage: "INDOOR",
    surface: "FLOOR",
    underfloorHeating: true,
    acousticRating: "",
  },
  images: [],
  texture: null,
};

function fromProduct(product: Product): FormState {
  return {
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    subtitle: product.subtitle,
    brand: product.brand,
    categorySlug: product.categorySlug,
    collectionSlug: product.collectionSlug,
    description: product.description,
    installationNotes: product.installationNotes,
    maintenanceNotes: product.maintenanceNotes,
    pricePerUnit: product.pricePerUnit,
    compareAtPrice: product.compareAtPrice,
    pricingUnit: product.pricingUnit,
    packageCoverageSqm: product.packageCoverageSqm,
    stockUnits: product.stockUnits,
    leadTimeDays: product.leadTimeDays,
    sampleAvailable: product.sampleAvailable,
    quoteOnly: product.quoteOnly,
    featured: product.featured,
    isNew: product.isNew,
    bestSeller: product.bestSeller,
    active: product.active,
    specs: {
      ...product.specs,
      acousticRating: product.specs.acousticRating ?? "",
      wearLayerMm: product.specs.wearLayerMm,
    },
    images: product.images.map((image) => ({
      url: image.url,
      alt: image.alt,
      kind: image.kind,
    })),
    texture: product.texture
      ? {
          imageUrl: product.texture.imageUrl,
          thumbnailUrl: product.texture.thumbnailUrl,
          widthCm: product.texture.widthCm,
          heightCm: product.texture.heightCm,
          patternType: product.texture.patternType,
          repeatX: product.texture.repeatX,
          repeatY: product.texture.repeatY,
          orientation: product.texture.orientation,
          scaleFactor: product.texture.scaleFactor,
        }
      : null,
  };
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink-soft">
        {label}
      </span>
      <NativeSelect
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}

const asOptions = <T extends string>(record: Record<T, string>) =>
  (Object.entries(record) as [T, string][]).map(([value, label]) => ({ value, label }));

export function ProductForm({
  product,
  categories,
  collections,
}: {
  product: Product | null;
  categories: Category[];
  collections: Collection[];
}) {
  const [form, setForm] = React.useState<FormState>(() =>
    product
      ? fromProduct(product)
      : { ...emptyForm, categorySlug: categories[0]?.slug ?? "" },
  );
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const setSpec = <K extends keyof FormState["specs"]>(
    key: K,
    value: FormState["specs"][K],
  ) => setForm((current) => ({ ...current, specs: { ...current.specs, [key]: value } }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setErrors({});
    const result = await saveProductAction(product?.id ?? null, form);
    setPending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast({ tone: "error", title: t.states.errorTitle, description: "בדקו את השדות המסומנים" });
      return;
    }
    toast({ title: t.admin.saved });
    router.push(routes.admin.products);
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-8 pb-16">
      <section className="card p-5">
        <h2 className="text-lg">פרטי מוצר</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="שם" htmlFor="name" required error={errors.name?.[0]}>
            <Input
              id="name"
              value={form.name}
              onChange={(event) => {
                const name = event.target.value;
                setForm((current) => ({
                  ...current,
                  name,
                  slug: current.slug || slugify(name),
                }));
              }}
              required
            />
          </Field>
          <Field label="כותרת משנה" htmlFor="subtitle" required error={errors.subtitle?.[0]}>
            <Input
              id="subtitle"
              value={form.subtitle}
              onChange={(event) => set("subtitle", event.target.value)}
              required
            />
          </Field>
          <Field label="Slug" htmlFor="slug" required error={errors.slug?.[0]}>
            <Input
              id="slug"
              value={form.slug}
              onChange={(event) => set("slug", event.target.value)}
              dir="ltr"
              required
            />
          </Field>
          <Field label="מק״ט" htmlFor="sku" required error={errors.sku?.[0]}>
            <Input
              id="sku"
              value={form.sku}
              onChange={(event) => set("sku", event.target.value)}
              dir="ltr"
              required
            />
          </Field>
          <Field label="מותג" htmlFor="brand" required>
            <Input
              id="brand"
              value={form.brand}
              onChange={(event) => set("brand", event.target.value)}
              required
            />
          </Field>
          <SelectField
            label={t.admin.categories}
            value={form.categorySlug}
            options={categories.map((category) => ({
              value: category.slug,
              label: category.name,
            }))}
            onChange={(value) => set("categorySlug", value)}
          />
          <SelectField
            label={t.admin.collections}
            value={form.collectionSlug ?? ""}
            options={[
              { value: "", label: "—" },
              ...collections.map((collection) => ({
                value: collection.slug,
                label: collection.name,
              })),
            ]}
            onChange={(value) => set("collectionSlug", value || null)}
          />
          <Field label="תיאור" htmlFor="description" required error={errors.description?.[0]} className="sm:col-span-2">
            <Textarea
              id="description"
              rows={4}
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              required
            />
          </Field>
          <Field label={t.product.installation} htmlFor="install">
            <Textarea
              id="install"
              rows={3}
              value={form.installationNotes}
              onChange={(event) => set("installationNotes", event.target.value)}
            />
          </Field>
          <Field label={t.product.maintenance} htmlFor="maintain">
            <Textarea
              id="maintain"
              rows={3}
              value={form.maintenanceNotes}
              onChange={(event) => set("maintenanceNotes", event.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg">מחיר ומלאי</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="מחיר ליחידה / לחבילה" htmlFor="price" required error={errors.pricePerUnit?.[0]}>
            <Input
              id="price"
              type="number"
              min="0"
              step="any"
              className="num"
              value={form.pricePerUnit}
              onChange={(event) => set("pricePerUnit", Number(event.target.value))}
              required
            />
          </Field>
          <Field label="מחיר לפני הנחה" htmlFor="compare">
            <Input
              id="compare"
              type="number"
              min="0"
              step="any"
              className="num"
              value={form.compareAtPrice ?? ""}
              onChange={(event) =>
                set("compareAtPrice", event.target.value ? Number(event.target.value) : null)
              }
            />
          </Field>
          <SelectField
            label="יחידת מכירה"
            value={form.pricingUnit}
            options={[
              { value: "PACKAGE", label: "חבילה" },
              { value: "ITEM", label: "יחידה" },
            ]}
            onChange={(value) => set("pricingUnit", value)}
          />
          <Field label={t.admin.products + " — כיסוי לחבילה (מ״ר)"} htmlFor="coverage">
            <Input
              id="coverage"
              type="number"
              min="0"
              step="any"
              className="num"
              value={form.packageCoverageSqm ?? ""}
              onChange={(event) =>
                set(
                  "packageCoverageSqm",
                  event.target.value ? Number(event.target.value) : null,
                )
              }
            />
          </Field>
          <Field label="מלאי (יחידות)" htmlFor="stock" required>
            <Input
              id="stock"
              type="number"
              min="0"
              className="num"
              value={form.stockUnits}
              onChange={(event) => set("stockUnits", Number(event.target.value))}
              required
            />
          </Field>
          <Field label="זמן אספקה (ימים)" htmlFor="lead" required>
            <Input
              id="lead"
              type="number"
              min="0"
              className="num"
              value={form.leadTimeDays}
              onChange={(event) => set("leadTimeDays", Number(event.target.value))}
              required
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap gap-5">
          {(
            [
              ["active", t.admin.active],
              ["featured", t.admin.featured],
              ["isNew", t.common.new],
              ["bestSeller", t.common.bestSeller],
              ["sampleAvailable", t.product.orderSample],
              ["quoteOnly", "הצעת מחיר בלבד"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-ink-soft">
              <Checkbox
                checked={Boolean(form[key])}
                onCheckedChange={(checked) => set(key, checked === true)}
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg">{t.product.specs}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <SelectField
            label="חומר"
            value={form.specs.material}
            options={asOptions(materialLabels)}
            onChange={(value) => setSpec("material", value)}
          />
          <Field label="תיאור חומר" htmlFor="materialLabel" required>
            <Input
              id="materialLabel"
              value={form.specs.materialLabel}
              onChange={(event) => setSpec("materialLabel", event.target.value)}
              required
            />
          </Field>
          <SelectField
            label={t.product.tone}
            value={form.specs.tone}
            options={asOptions(toneLabels)}
            onChange={(value) => setSpec("tone", value)}
          />
          <Field label="רוחב (מ״מ)" htmlFor="widthMm" required>
            <Input
              id="widthMm"
              type="number"
              min="1"
              className="num"
              value={form.specs.widthMm}
              onChange={(event) => setSpec("widthMm", Number(event.target.value))}
              required
            />
          </Field>
          <Field label="אורך (מ״מ)" htmlFor="lengthMm" required>
            <Input
              id="lengthMm"
              type="number"
              min="1"
              className="num"
              value={form.specs.lengthMm}
              onChange={(event) => setSpec("lengthMm", Number(event.target.value))}
              required
            />
          </Field>
          <Field label="עובי (מ״מ)" htmlFor="thicknessMm" required>
            <Input
              id="thicknessMm"
              type="number"
              min="0.1"
              step="any"
              className="num"
              value={form.specs.thicknessMm}
              onChange={(event) => setSpec("thicknessMm", Number(event.target.value))}
              required
            />
          </Field>
          <Field label="שכבת שחיקה (מ״מ)" htmlFor="wearLayerMm">
            <Input
              id="wearLayerMm"
              type="number"
              min="0"
              step="any"
              className="num"
              value={form.specs.wearLayerMm ?? ""}
              onChange={(event) =>
                setSpec(
                  "wearLayerMm",
                  event.target.value ? Number(event.target.value) : undefined,
                )
              }
            />
          </Field>
          <Field label="שם הצבע" htmlFor="colorName" required>
            <Input
              id="colorName"
              value={form.specs.colorName}
              onChange={(event) => setSpec("colorName", event.target.value)}
              required
            />
          </Field>
          <Field label="קוד צבע" htmlFor="colorHex" required error={errors.specs?.[0]}>
            <div className="flex gap-2">
              <Input
                id="colorHex"
                value={form.specs.colorHex}
                onChange={(event) => setSpec("colorHex", event.target.value)}
                dir="ltr"
                required
              />
              <input
                type="color"
                aria-label="בחירת צבע"
                value={form.specs.colorHex}
                onChange={(event) => setSpec("colorHex", event.target.value)}
                className="h-11 w-12 shrink-0 rounded-sm border border-line-strong bg-surface"
              />
            </div>
          </Field>
          <Field label={t.product.texture} htmlFor="textureLabel" required>
            <Input
              id="textureLabel"
              value={form.specs.textureLabel}
              onChange={(event) => setSpec("textureLabel", event.target.value)}
              required
            />
          </Field>
          <Field label={t.product.durability} htmlFor="durability" required>
            <Input
              id="durability"
              value={form.specs.durability}
              onChange={(event) => setSpec("durability", event.target.value)}
              required
            />
          </Field>
          <Field label="סוג התקנה" htmlFor="installationType" required>
            <Input
              id="installationType"
              value={form.specs.installationType}
              onChange={(event) => setSpec("installationType", event.target.value)}
              required
            />
          </Field>
          <Field label="אחריות (שנים)" htmlFor="warranty" required>
            <Input
              id="warranty"
              type="number"
              min="0"
              className="num"
              value={form.specs.warrantyYears}
              onChange={(event) => setSpec("warrantyYears", Number(event.target.value))}
              required
            />
          </Field>
          <SelectField
            label={t.catalog.groupWater}
            value={form.specs.waterResistance}
            options={asOptions(waterLabels)}
            onChange={(value) => setSpec("waterResistance", value)}
          />
          <SelectField
            label={t.catalog.groupUsage}
            value={form.specs.usage}
            options={asOptions(usageLabels)}
            onChange={(value) => setSpec("usage", value)}
          />
          <SelectField
            label={t.catalog.groupSurface}
            value={form.specs.surface}
            options={asOptions(surfaceLabels)}
            onChange={(value) => setSpec("surface", value)}
          />
          <Field label="אקוסטיקה" htmlFor="acoustic">
            <Input
              id="acoustic"
              value={form.specs.acousticRating ?? ""}
              onChange={(event) => setSpec("acousticRating", event.target.value)}
            />
          </Field>
          <label className="flex items-end gap-2 pb-2.5 text-sm text-ink-soft">
            <Checkbox
              checked={Boolean(form.specs.underfloorHeating)}
              onCheckedChange={(checked) =>
                setSpec("underfloorHeating", checked === true)
              }
            />
            חימום תת־רצפתי
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className="text-[0.8125rem] font-medium text-ink-soft">סגנון</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {(Object.keys(styleLabels) as StyleTag[]).map((style) => (
              <label key={style} className="flex items-center gap-2 text-sm text-ink-soft">
                <Checkbox
                  checked={form.specs.style.includes(style)}
                  onCheckedChange={(checked) =>
                    setSpec(
                      "style",
                      checked === true
                        ? [...form.specs.style, style]
                        : form.specs.style.filter((entry) => entry !== style),
                    )
                  }
                />
                {styleLabels[style]}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {/* ------------------------------ images ------------------------------ */}
      <section className="card p-5">
        <h2 className="text-lg">תמונות</h2>
        <ul className="mt-4 space-y-4">
          {form.images.map((image, index) => (
            <li key={index} className="rounded-sm border border-line p-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
                <ImageUpload
                  label={`תמונה ${index + 1}`}
                  hint={form.slug || "product"}
                  value={image.url}
                  aspect="wide"
                  onChange={(url) =>
                    set(
                      "images",
                      form.images.map((entry, i) =>
                        i === index ? { ...entry, url } : entry,
                      ),
                    )
                  }
                />
                <SelectField
                  label="סוג"
                  value={image.kind}
                  options={[
                    { value: "STUDIO", label: "סטודיו" },
                    { value: "ROOM", label: "בחלל" },
                    { value: "DETAIL", label: "תקריב" },
                  ]}
                  onChange={(kind) =>
                    set(
                      "images",
                      form.images.map((entry, i) =>
                        i === index ? { ...entry, kind } : entry,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  aria-label={t.common.remove}
                  className="text-danger"
                  onClick={() =>
                    set(
                      "images",
                      form.images.filter((_, i) => i !== index),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              <Field label="טקסט אלטרנטיבי" htmlFor={`alt-${index}`} className="mt-3">
                <Input
                  id={`alt-${index}`}
                  value={image.alt}
                  onChange={(event) =>
                    set(
                      "images",
                      form.images.map((entry, i) =>
                        i === index ? { ...entry, alt: event.target.value } : entry,
                      ),
                    )
                  }
                />
              </Field>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() =>
            set("images", [
              ...form.images,
              { url: "", alt: form.name, kind: "STUDIO" as const },
            ])
          }
        >
          <Plus />
          הוספת תמונה
        </Button>
      </section>

      {/* ----------------------------- texture ----------------------------- */}
      <section className="rounded-lg border border-brass/40 bg-brass-wash/40 p-5">
        <h2 className="text-lg">{t.admin.textureSection}</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
          {t.admin.textureHint} המידות כאן הן המידות האמיתיות שהתמונה מכסה — הן מה
          שקובע את הקנה מידה של הדוגמה בהדמיה.
        </p>

        {form.texture ? (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ImageUpload
                label="תמונת טקסטורה (רזולוציה מלאה)"
                hint={`${form.slug || "product"}-texture`}
                value={form.texture.imageUrl}
                onChange={(url) =>
                  set("texture", { ...form.texture!, imageUrl: url })
                }
              />
              <ImageUpload
                label="תמונה ממוזערת (swatch)"
                hint={`${form.slug || "product"}-thumb`}
                value={form.texture.thumbnailUrl}
                onChange={(url) =>
                  set("texture", { ...form.texture!, thumbnailUrl: url })
                }
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label={t.admin.textureWidth} htmlFor="texW" required>
                <Input
                  id="texW"
                  type="number"
                  min="1"
                  step="any"
                  className="num"
                  value={form.texture.widthCm}
                  onChange={(event) =>
                    set("texture", {
                      ...form.texture!,
                      widthCm: Number(event.target.value),
                    })
                  }
                  required
                />
              </Field>
              <Field label={t.admin.textureHeight} htmlFor="texH" required>
                <Input
                  id="texH"
                  type="number"
                  min="1"
                  step="any"
                  className="num"
                  value={form.texture.heightCm}
                  onChange={(event) =>
                    set("texture", {
                      ...form.texture!,
                      heightCm: Number(event.target.value),
                    })
                  }
                  required
                />
              </Field>
              <SelectField
                label={t.admin.patternType}
                value={form.texture.patternType}
                options={asOptions(patternLabels)}
                onChange={(patternType) =>
                  set("texture", { ...form.texture!, patternType })
                }
              />
              <Field label={t.admin.repeatX} htmlFor="repeatX" required>
                <Input
                  id="repeatX"
                  type="number"
                  min="1"
                  className="num"
                  value={form.texture.repeatX}
                  onChange={(event) =>
                    set("texture", {
                      ...form.texture!,
                      repeatX: Number(event.target.value),
                    })
                  }
                  required
                />
              </Field>
              <Field label={t.admin.repeatY} htmlFor="repeatY" required>
                <Input
                  id="repeatY"
                  type="number"
                  min="1"
                  className="num"
                  value={form.texture.repeatY}
                  onChange={(event) =>
                    set("texture", {
                      ...form.texture!,
                      repeatY: Number(event.target.value),
                    })
                  }
                  required
                />
              </Field>
              <SelectField
                label={t.admin.orientation}
                value={form.texture.orientation}
                options={[
                  { value: "HORIZONTAL", label: t.designer.orientationHorizontal },
                  { value: "VERTICAL", label: t.designer.orientationVertical },
                  { value: "DIAGONAL", label: t.designer.orientationDiagonal },
                ]}
                onChange={(orientation) =>
                  set("texture", { ...form.texture!, orientation })
                }
              />
              <Field label={t.admin.scaleFactor} htmlFor="scaleFactor" required>
                <Input
                  id="scaleFactor"
                  type="number"
                  min="0.1"
                  step="any"
                  className="num"
                  value={form.texture.scaleFactor}
                  onChange={(event) =>
                    set("texture", {
                      ...form.texture!,
                      scaleFactor: Number(event.target.value),
                    })
                  }
                  required
                />
              </Field>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-4 text-danger"
              onClick={() => set("texture", null)}
            >
              <Trash2 />
              הסרת טקסטורה
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() =>
              set("texture", {
                imageUrl: "",
                thumbnailUrl: "",
                widthCm: form.specs.widthMm / 10,
                heightCm: form.specs.lengthMm / 10,
                patternType: "PLANK",
                repeatX: 1,
                repeatY: 1,
                orientation: "HORIZONTAL",
                scaleFactor: 1,
              })
            }
          >
            <Plus />
            הוספת טקסטורה להדמיה
          </Button>
        )}
      </section>

      <Separator />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" loading={pending} loadingLabel={t.common.saving}>
          {t.common.save}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => router.push(routes.admin.products)}
        >
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}
