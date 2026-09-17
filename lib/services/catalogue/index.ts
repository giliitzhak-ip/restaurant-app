import type { CategoryRow, ServiceRow } from '@/types/database';
import { isSupabaseConfigured } from '@/lib/env';
import { getServerSupabase } from '@/lib/supabase/server';
import { FALLBACK_CATEGORIES, FALLBACK_SERVICES } from './fallback';

export interface CategoryWithServices extends CategoryRow {
  services: ServiceRow[];
}

/**
 * The catalogue is database-driven: an admin can add, rename, reorder or
 * deactivate a category without a deploy. Only when Supabase is not configured
 * at all does this fall back to the seeded demo catalogue.
 */
export async function getCategories(includeInactive = false): Promise<CategoryRow[]> {
  if (!isSupabaseConfigured()) return FALLBACK_CATEGORIES;

  const supabase = await getServerSupabase();
  if (!supabase) return FALLBACK_CATEGORIES;

  let query = supabase.from('categories').select('*').order('sort_order', { ascending: true });
  if (!includeInactive) query = query.eq('active', true);

  const { data, error } = await query;
  if (error || !data?.length) return FALLBACK_CATEGORIES;
  return data;
}

export async function getServices(categoryId?: string): Promise<ServiceRow[]> {
  if (!isSupabaseConfigured()) {
    return categoryId
      ? FALLBACK_SERVICES.filter((service) => service.category_id === categoryId)
      : FALLBACK_SERVICES;
  }

  const supabase = await getServerSupabase();
  if (!supabase) return FALLBACK_SERVICES;

  let query = supabase
    .from('services')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (categoryId) query = query.eq('category_id', categoryId);

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

export async function getCatalogue(): Promise<CategoryWithServices[]> {
  const [categories, services] = await Promise.all([getCategories(), getServices()]);
  return categories.map((category) => ({
    ...category,
    services: services.filter((service) => service.category_id === category.id),
  }));
}

export async function getCategoryBySlug(slug: string): Promise<CategoryRow | null> {
  const categories = await getCategories(true);
  return categories.find((category) => category.slug === slug) ?? null;
}

export { FALLBACK_CATEGORIES, FALLBACK_SERVICES };
