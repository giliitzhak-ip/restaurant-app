import { prisma } from '@/lib/db'
import { DEFAULT_SETTINGS, type SettingKey } from '@/config/settings'

type SettingValue = (typeof DEFAULT_SETTINGS)[SettingKey]['value']

let cache: Map<string, unknown> | null = null
let cachedAt = 0
const TTL_MS = 30_000

async function load(): Promise<Map<string, unknown>> {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache
  const rows = await prisma.setting.findMany()
  cache = new Map(rows.map((r) => [r.key, r.value]))
  cachedAt = Date.now()
  return cache
}

export async function getSetting<K extends SettingKey>(key: K): Promise<(typeof DEFAULT_SETTINGS)[K]['value']> {
  const map = await load()
  const value = map.get(key)
  return (value === undefined ? DEFAULT_SETTINGS[key].value : value) as (typeof DEFAULT_SETTINGS)[K]['value']
}

export async function getSettings(): Promise<Record<string, unknown>> {
  const map = await load()
  const out: Record<string, unknown> = {}
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    out[key] = map.has(key) ? map.get(key) : def.value
  }
  return out
}

export async function setSetting(key: SettingKey, value: SettingValue): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as never, group: DEFAULT_SETTINGS[key].group },
    update: { value: value as never },
  })
  cache = null
}

export function invalidateSettingsCache(): void {
  cache = null
}
