import { getServiceSupabase } from '@/lib/supabase/server';
import {
  SETTINGS_DEFAULTS,
  SETTINGS_SCHEMAS,
  type SettingKey,
} from './schema';
import type { z } from 'zod';

type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

/**
 * Reads a platform setting, parsed and defaulted.
 *
 * Settings are admin-only data (the match weights in particular must never be
 * exposed to customers), so this always goes through the service-role client
 * and is server-only. Falls back to the shipped defaults when the database is
 * unreachable, which keeps pricing and matching deterministic in demo mode.
 */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as SettingValue<K>;
  }

  const fallback = SETTINGS_DEFAULTS[key];
  const supabase = getServiceSupabase();
  if (!supabase) return fallback;

  const { data, error } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
  if (error || !data) return fallback;

  const parsed = SETTINGS_SCHEMAS[key].safeParse(data.value);
  const value = (parsed.success ? parsed.data : fallback) as SettingValue<K>;
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: unknown,
  adminId: string,
): Promise<SettingValue<K>> {
  const parsed = SETTINGS_SCHEMAS[key].parse(value) as SettingValue<K>;
  const supabase = getServiceSupabase();
  if (!supabase) throw new Error('Settings are read-only without a service-role key.');

  const { error } = await supabase
    .from('settings')
    .upsert({ key, value: parsed as never, updated_by: adminId }, { onConflict: 'key' });
  if (error) throw new Error(error.message);

  cache.set(key, { value: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
  return parsed;
}

export function invalidateSettingsCache(key?: SettingKey) {
  if (key) cache.delete(key);
  else cache.clear();
}

export * from './schema';
