'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { CategoryIcon, ICON_NAMES } from '@/components/ui/category-icon';
import { ErrorState, SkeletonList } from '@/components/ui/states';
import { useApi } from '@/hooks/use-api';
import { patchJson, postJson } from '@/features/auth/lib/form';
import { useT } from '@/components/providers/i18n-provider';

interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  sort_order: number;
  base_price: number | null;
}

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  name_en: string | null;
  icon: string;
  description: string | null;
  sort_order: number;
  active: boolean;
  services: ServiceRow[] | null;
}

/**
 * Category and service management.
 *
 * The catalogue is entirely database-driven: nothing in the product hard-codes
 * a category, so adding one here makes it appear in the wizard, the landing
 * page and provider onboarding immediately.
 */
export function CategoriesAdmin() {
  const t = useT();
  const { data, loading, error, reload } = useApi<{ categories: CategoryRow[] }>(
    '/api/admin/categories',
  );

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [serviceParent, setServiceParent] = useState<CategoryRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [form, setForm] = useState({ slug: '', name: '', nameEn: '', icon: 'wrench', sortOrder: '0' });
  const [serviceForm, setServiceForm] = useState({ slug: '', name: '', basePrice: '' });

  const categories = data?.categories ?? [];

  function openCreate() {
    setEditing(null);
    setForm({ slug: '', name: '', nameEn: '', icon: 'wrench', sortOrder: String(categories.length * 10 + 10) });
    setCategoryOpen(true);
  }

  function openEdit(category: CategoryRow) {
    setEditing(category);
    setForm({
      slug: category.slug,
      name: category.name,
      nameEn: category.name_en ?? '',
      icon: category.icon,
      sortOrder: String(category.sort_order),
    });
    setCategoryOpen(true);
  }

  async function saveCategory() {
    setSaving(true);
    setActionError(null);
    const payload = {
      slug: form.slug.trim(),
      name: form.name.trim(),
      nameEn: form.nameEn.trim() || null,
      icon: form.icon,
      sortOrder: Number(form.sortOrder) || 0,
      active: editing?.active ?? true,
    };

    try {
      if (editing) await patchJson(`/api/admin/categories/${editing.id}`, payload);
      else await postJson('/api/admin/categories', payload);
      setCategoryOpen(false);
      await reload();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : t.errors.generic);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(category: CategoryRow) {
    await patchJson(`/api/admin/categories/${category.id}`, { active: !category.active });
    await reload();
  }

  async function remove(category: CategoryRow) {
    setActionError(null);
    const response = await fetch(`/api/admin/categories/${category.id}`, { method: 'DELETE' });
    const payload = (await response.json()) as { ok: boolean; error?: { message: string } };
    if (!payload.ok) {
      setActionError(payload.error?.message ?? t.errors.generic);
      return;
    }
    await reload();
  }

  async function move(category: CategoryRow, direction: -1 | 1) {
    const index = categories.findIndex((entry) => entry.id === category.id);
    const swapWith = categories[index + direction];
    if (!swapWith) return;

    await patchJson('/api/admin/categories', {
      order: [
        { id: category.id, sortOrder: swapWith.sort_order },
        { id: swapWith.id, sortOrder: category.sort_order },
      ],
    });
    await reload();
  }

  async function saveService() {
    if (!serviceParent) return;
    setSaving(true);
    setActionError(null);
    try {
      await postJson('/api/admin/services', {
        categoryId: serviceParent.id,
        slug: serviceForm.slug.trim(),
        name: serviceForm.name.trim(),
        basePrice: serviceForm.basePrice ? Number(serviceForm.basePrice) : null,
        sortOrder: ((serviceParent.services?.length ?? 0) + 1) * 10,
        active: true,
      });
      setServiceForm({ slug: '', name: '', basePrice: '' });
      setServiceParent(null);
      await reload();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : t.errors.generic);
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) return <SkeletonList rows={5} />;
  if (error) return <ErrorState description={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="num">{categories.length}</span> קטגוריות
        </p>
        <Button size="sm" variant="accent" onClick={openCreate}>
          <Plus aria-hidden />
          קטגוריה חדשה
        </Button>
      </div>

      {actionError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {actionError}
        </p>
      ) : null}

      <ul className="space-y-3">
        {categories.map((category, index) => (
          <li key={category.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                <CategoryIcon name={category.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{category.name}</p>
                  <code className="num rounded bg-secondary px-1.5 text-[11px]">{category.slug}</code>
                  {!category.active ? <Badge variant="destructive">לא פעיל</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="num">{category.services?.length ?? 0}</span> שירותים
                </p>
              </div>

              <div className="flex flex-wrap gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="הזזה למעלה"
                  disabled={index === 0}
                  onClick={() => move(category, -1)}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="הזזה למטה"
                  disabled={index === categories.length - 1}
                  onClick={() => move(category, 1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openEdit(category)}>
                  {t.common.edit}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleActive(category)}>
                  {category.active ? 'השבתה' : 'הפעלה'}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`מחיקת ${category.name}`}
                  onClick={() => remove(category)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
              {(category.services ?? []).map((service) => (
                <Badge key={service.id} variant={service.active ? 'secondary' : 'outline'}>
                  {service.name}
                </Badge>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setServiceParent(category);
                  setServiceForm({ slug: '', name: '', basePrice: '' });
                }}
              >
                <Plus aria-hidden />
                שירות
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Sheet
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title={editing ? t.common.edit : 'קטגוריה חדשה'}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setCategoryOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button className="flex-1" loading={saving} onClick={saveCategory}>
              {t.common.save}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="שם" htmlFor="catName" required>
            <Input
              id="catName"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="מזהה (slug)" htmlFor="catSlug" required hint="אנגלית קטנה ומקפים בלבד">
            <Input
              id="catSlug"
              dir="ltr"
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
              disabled={Boolean(editing)}
            />
          </Field>
          <Field label="שם באנגלית" htmlFor="catNameEn">
            <Input
              id="catNameEn"
              dir="ltr"
              value={form.nameEn}
              onChange={(event) => setForm({ ...form, nameEn: event.target.value })}
            />
          </Field>
          <Field label="אייקון" htmlFor="catIcon">
            <Select
              id="catIcon"
              value={form.icon}
              onChange={(event) => setForm({ ...form, icon: event.target.value })}
            >
              {ICON_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="סדר תצוגה" htmlFor="catOrder">
            <Input
              id="catOrder"
              type="number"
              dir="ltr"
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
            />
          </Field>
        </div>
      </Sheet>

      <Sheet
        open={Boolean(serviceParent)}
        onClose={() => setServiceParent(null)}
        title="שירות חדש"
        description={serviceParent?.name}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setServiceParent(null)}>
              {t.common.cancel}
            </Button>
            <Button className="flex-1" loading={saving} onClick={saveService}>
              {t.common.save}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="שם השירות" htmlFor="svcName" required>
            <Input
              id="svcName"
              value={serviceForm.name}
              onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })}
            />
          </Field>
          <Field label="מזהה (slug)" htmlFor="svcSlug" required>
            <Input
              id="svcSlug"
              dir="ltr"
              value={serviceForm.slug}
              onChange={(event) => setServiceForm({ ...serviceForm, slug: event.target.value })}
            />
          </Field>
          <Field label="מחיר בסיס" htmlFor="svcPrice" hint={t.common.optional}>
            <Input
              id="svcPrice"
              type="number"
              dir="ltr"
              value={serviceForm.basePrice}
              onChange={(event) => setServiceForm({ ...serviceForm, basePrice: event.target.value })}
            />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
