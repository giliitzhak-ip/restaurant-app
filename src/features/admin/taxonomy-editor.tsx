"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { t } from "@/i18n";
import { cn, slugify } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ImageUpload } from "@/features/admin/image-upload";
import { saveCategoryAction, saveCollectionAction } from "@/server/actions/admin";
import type { Category, Collection } from "@/types/catalog";

/**
 * Categories and collections share one editor: a list on one side, the
 * selected record's form on the other. Keeps the admin surface small.
 */
export function TaxonomyEditor({
  kind,
  categories,
  collections,
}: {
  kind: "category" | "collection";
  categories?: Category[];
  collections?: Collection[];
}) {
  const items = kind === "category" ? (categories ?? []) : (collections ?? []);
  const [selectedId, setSelectedId] = React.useState<string | "new">(
    items[0]?.id ?? "new",
  );

  const selected =
    selectedId === "new" ? null : (items.find((item) => item.id === selectedId) ?? null);

  return (
    <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
      <div>
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  "w-full rounded-sm px-3 py-2 text-start text-sm transition-colors",
                  selectedId === item.id
                    ? "bg-ink text-canvas"
                    : "text-ink-soft hover:bg-surface-2",
                )}
              >
                {item.name}
                <span className="block text-xs opacity-60" dir="ltr">
                  /{item.slug}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={() => setSelectedId("new")}
        >
          <Plus />
          חדש
        </Button>
      </div>

      {kind === "category" ? (
        <CategoryForm key={selected?.id ?? "new"} category={selected as Category | null} />
      ) : (
        <CollectionForm
          key={selected?.id ?? "new"}
          collection={selected as Collection | null}
        />
      )}
    </div>
  );
}

function CategoryForm({ category }: { category: Category | null }) {
  const [form, setForm] = React.useState({
    slug: category?.slug ?? "",
    name: category?.name ?? "",
    shortDescription: category?.shortDescription ?? "",
    longDescription: category?.longDescription ?? "",
    heroImage: category?.heroImage ?? "",
    tileImage: category?.tileImage ?? "",
    surface: category?.surface ?? ("BOTH" as Category["surface"]),
    position: category?.position ?? 10,
    seoTitle: category?.seoTitle ?? "",
    seoDescription: category?.seoDescription ?? "",
  });
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <form
      className="space-y-4 rounded-lg border border-line bg-surface p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const result = await saveCategoryAction({ id: category?.id, ...form });
        setPending(false);
        toast(
          result.ok
            ? { title: t.admin.saved }
            : { tone: "error", title: t.states.errorTitle },
        );
        if (result.ok) router.refresh();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="שם" htmlFor="c-name" required>
          <Input
            id="c-name"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                name: event.target.value,
                slug: current.slug || slugify(event.target.value),
              }))
            }
            required
          />
        </Field>
        <Field label="Slug" htmlFor="c-slug" required>
          <Input
            id="c-slug"
            dir="ltr"
            value={form.slug}
            onChange={(event) =>
              setForm((current) => ({ ...current, slug: event.target.value }))
            }
            required
          />
        </Field>
        <Field label="תיאור קצר" htmlFor="c-short" required className="sm:col-span-2">
          <Input
            id="c-short"
            value={form.shortDescription}
            onChange={(event) =>
              setForm((current) => ({ ...current, shortDescription: event.target.value }))
            }
            required
          />
        </Field>
        <Field label="תיאור מלא" htmlFor="c-long" required className="sm:col-span-2">
          <Textarea
            id="c-long"
            rows={4}
            value={form.longDescription}
            onChange={(event) =>
              setForm((current) => ({ ...current, longDescription: event.target.value }))
            }
            required
          />
        </Field>
        <ImageUpload
          label="תמונת קטגוריה"
          hint={form.slug || "category"}
          value={form.tileImage}
          aspect="wide"
          onChange={(url) =>
            setForm((current) => ({ ...current, tileImage: url, heroImage: url }))
          }
        />
        <Field label="סדר תצוגה" htmlFor="c-position">
          <Input
            id="c-position"
            type="number"
            min="0"
            className="num"
            value={form.position}
            onChange={(event) =>
              setForm((current) => ({ ...current, position: Number(event.target.value) }))
            }
          />
        </Field>
        <Field label="SEO — כותרת" htmlFor="c-seo-title" required>
          <Input
            id="c-seo-title"
            value={form.seoTitle}
            onChange={(event) =>
              setForm((current) => ({ ...current, seoTitle: event.target.value }))
            }
            required
          />
        </Field>
        <Field label="SEO — תיאור" htmlFor="c-seo-desc" required>
          <Input
            id="c-seo-desc"
            value={form.seoDescription}
            onChange={(event) =>
              setForm((current) => ({ ...current, seoDescription: event.target.value }))
            }
            required
          />
        </Field>
      </div>
      <Button type="submit" loading={pending} loadingLabel={t.common.saving}>
        {t.common.save}
      </Button>
    </form>
  );
}

function CollectionForm({ collection }: { collection: Collection | null }) {
  const [form, setForm] = React.useState({
    slug: collection?.slug ?? "",
    name: collection?.name ?? "",
    description: collection?.description ?? "",
    story: collection?.story ?? "",
    heroImage: collection?.heroImage ?? "",
    featured: collection?.featured ?? false,
    position: collection?.position ?? 10,
  });
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <form
      className="space-y-4 rounded-lg border border-line bg-surface p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const result = await saveCollectionAction({ id: collection?.id, ...form });
        setPending(false);
        toast(
          result.ok
            ? { title: t.admin.saved }
            : { tone: "error", title: t.states.errorTitle },
        );
        if (result.ok) router.refresh();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="שם" htmlFor="col-name" required>
          <Input
            id="col-name"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                name: event.target.value,
                slug: current.slug || slugify(event.target.value),
              }))
            }
            required
          />
        </Field>
        <Field label="Slug" htmlFor="col-slug" required>
          <Input
            id="col-slug"
            dir="ltr"
            value={form.slug}
            onChange={(event) =>
              setForm((current) => ({ ...current, slug: event.target.value }))
            }
            required
          />
        </Field>
        <Field label="תיאור" htmlFor="col-desc" required className="sm:col-span-2">
          <Input
            id="col-desc"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            required
          />
        </Field>
        <Field label="סיפור הקולקציה" htmlFor="col-story" required className="sm:col-span-2">
          <Textarea
            id="col-story"
            rows={4}
            value={form.story}
            onChange={(event) =>
              setForm((current) => ({ ...current, story: event.target.value }))
            }
            required
          />
        </Field>
        <ImageUpload
          label="תמונת קולקציה"
          hint={form.slug || "collection"}
          value={form.heroImage}
          aspect="wide"
          onChange={(url) => setForm((current) => ({ ...current, heroImage: url }))}
        />
        <div className="space-y-4">
          <Field label="סדר תצוגה" htmlFor="col-position">
            <Input
              id="col-position"
              type="number"
              min="0"
              className="num"
              value={form.position}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  position: Number(event.target.value),
                }))
              }
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <Checkbox
              checked={form.featured}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, featured: checked === true }))
              }
            />
            {t.admin.featured}
          </label>
        </div>
      </div>
      <Button type="submit" loading={pending} loadingLabel={t.common.saving}>
        {t.common.save}
      </Button>
    </form>
  );
}
