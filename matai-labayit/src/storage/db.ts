// שכבת הנתונים: מאגר מקומי (AsyncStorage) עם זיכרון מטמון ומנוי לשינויים.
// המסכים לא ניגשים לאחסון ישירות – רק דרך הפונקציות כאן, כך שבהמשך אפשר
// להחליף/להוסיף סנכרון לענן בלי לגעת בממשק המשתמש.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import type { Design, Product, Room, Settings } from '@/model/types';
import { deleteImage } from './imageStore';

const KEY = 'matai/v1/';
const SCHEMA_VERSION = 1;

export type DBState = {
  rooms: Record<string, Room>;
  products: Record<string, Product>;
  designs: Record<string, Design>;
  settings: Settings;
};

export const defaultSettings: Settings = {
  onboardingDone: false,
  cloud: { enabled: false, serverUrl: '' },
  showTips: true,
};

let state: DBState = { rooms: {}, products: {}, designs: {}, settings: defaultSettings };
let loaded = false;
const listeners = new Set<() => void>();
const dirty = new Set<keyof DBState>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

async function flush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  const keys = [...dirty];
  dirty.clear();
  await Promise.all(keys.map((k) => AsyncStorage.setItem(KEY + k, JSON.stringify(state[k]))));
}

function scheduleFlush(k: keyof DBState) {
  dirty.add(k);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flush().catch((e) => console.warn('שמירה נכשלה', e));
  }, 250);
}

// שמירה מיידית כשהאפליקציה עוברת לרקע – כדי שעבודה לא תאבד בסגירה פתאומית.
AppState.addEventListener?.('change', (s) => {
  if (s !== 'active') flush().catch(() => undefined);
});

function set<K extends keyof DBState>(k: K, value: DBState[K]) {
  state = { ...state, [k]: value };
  scheduleFlush(k);
  emit();
}

export async function loadDB(): Promise<void> {
  if (loaded) return;
  const entries = await AsyncStorage.multiGet(['rooms', 'products', 'designs', 'settings', 'schema'].map((k) => KEY + k));
  const get = (k: string) => {
    const v = entries.find(([key]) => key === KEY + k)?.[1];
    try {
      return v ? JSON.parse(v) : undefined;
    } catch {
      return undefined;
    }
  };
  state = {
    rooms: get('rooms') ?? {},
    products: get('products') ?? {},
    designs: get('designs') ?? {},
    settings: { ...defaultSettings, ...(get('settings') ?? {}), cloud: { ...defaultSettings.cloud, ...(get('settings')?.cloud ?? {}) } },
  };
  await AsyncStorage.setItem(KEY + 'schema', String(SCHEMA_VERSION));
  loaded = true;
  emit();
}

export const isLoaded = () => loaded;
export const getState = () => state;

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDB<T>(selector: (s: DBState) => T): T {
  // מטמון לפי (state, selector) כדי ש-getSnapshot יחזיר ערך יציב בין קריאות עוקבות
  const cache = useRef<{ s: DBState | null; f: unknown; v: T }>({ s: null, f: null, v: undefined as T });
  const get = () => {
    if (cache.current.s !== state || cache.current.f !== selector) {
      cache.current = { s: state, f: selector, v: selector(state) };
    }
    return cache.current.v;
  };
  return useSyncExternalStore(subscribe, get, get);
}

export const flushNow = flush;

// ---------- חדרים ----------
export function saveRoom(room: Room) {
  set('rooms', { ...state.rooms, [room.id]: { ...room, updatedAt: Date.now() } });
}

export async function deleteRoom(id: string) {
  const room = state.rooms[id];
  if (!room) return;
  const rooms = { ...state.rooms };
  delete rooms[id];
  const designs = { ...state.designs };
  const toDelete = Object.values(designs).filter((d) => d.roomId === id);
  toDelete.forEach((d) => delete designs[d.id]);
  set('rooms', rooms);
  set('designs', designs);
  // מוצרים נשארים (ייתכן שהם ברשימת הקניות), רק מנתקים מהחדר
  const products = { ...state.products };
  Object.values(products).forEach((p) => {
    if (p.roomId === id) products[p.id] = { ...p, roomId: undefined };
  });
  set('products', products);
  await deleteImage(room.photo);
  await Promise.all(toDelete.map((d) => deleteImage(d.thumbnail)));
  for (const d of toDelete) await deleteSurfaceMasks(d);
}

async function deleteSurfaceMasks(d: Design) {
  for (const l of d.layers) if (l.kind === 'surface' && l.regionMask) await deleteImage(l.regionMask);
}

// ---------- מוצרים ----------
export function saveProduct(p: Product) {
  set('products', { ...state.products, [p.id]: { ...p, updatedAt: Date.now() } });
}

export function updateProduct(id: string, patch: Partial<Product>) {
  const p = state.products[id];
  if (!p) return;
  saveProduct({ ...p, ...patch });
}

export async function deleteProduct(id: string) {
  const p = state.products[id];
  if (!p) return;
  const products = { ...state.products };
  delete products[id];
  set('products', products);
  // הסרת השכבות שמשתמשות במוצר מכל הגרסאות
  const designs = { ...state.designs };
  let changed = false;
  Object.values(designs).forEach((d) => {
    const layers = d.layers.filter((l) => l.productId !== id);
    if (layers.length !== d.layers.length) {
      designs[d.id] = { ...d, layers, updatedAt: Date.now() };
      changed = true;
    }
  });
  if (changed) set('designs', designs);
  await Promise.all([p.photo, p.mask, p.cutout, p.swatch].map((r) => deleteImage(r)));
}

// ---------- גרסאות עיצוב ----------
export function saveDesign(d: Design) {
  set('designs', { ...state.designs, [d.id]: { ...d, updatedAt: Date.now() } });
}

export async function deleteDesign(id: string) {
  const d = state.designs[id];
  if (!d) return;
  const designs = { ...state.designs };
  delete designs[id];
  set('designs', designs);
  await deleteImage(d.thumbnail);
  // מסכות משטח עשויות להיות משותפות לגרסה משוכפלת – מוחקים רק אם אינן בשימוש
  const used = new Set<string>();
  Object.values(designs).forEach((x) => x.layers.forEach((l) => l.kind === 'surface' && l.regionMask && used.add(l.regionMask)));
  for (const l of d.layers) if (l.kind === 'surface' && l.regionMask && !used.has(l.regionMask)) await deleteImage(l.regionMask);
}

export const designsForRoom = (s: DBState, roomId: string) =>
  Object.values(s.designs)
    .filter((d) => d.roomId === roomId)
    .sort((a, b) => a.createdAt - b.createdAt);

// ---------- הגדרות ----------
export function updateSettings(patch: Partial<Settings>) {
  set('settings', { ...state.settings, ...patch });
}

/** כל ההפניות לתמונות שנמצאות בשימוש – לניהול תמונות וניקוי קבצים יתומים. */
export function referencedImages(): Set<string> {
  const refs = new Set<string>();
  Object.values(state.rooms).forEach((r) => refs.add(r.photo));
  Object.values(state.products).forEach((p) => [p.photo, p.mask, p.cutout, p.swatch].forEach((r) => r && refs.add(r)));
  Object.values(state.designs).forEach((d) => {
    if (d.thumbnail) refs.add(d.thumbnail);
    d.layers.forEach((l) => l.kind === 'surface' && l.regionMask && refs.add(l.regionMask));
  });
  return refs;
}

export async function wipeAll() {
  state = { rooms: {}, products: {}, designs: {}, settings: { ...defaultSettings, onboardingDone: true } };
  dirty.clear();
  await AsyncStorage.multiRemove(['rooms', 'products', 'designs'].map((k) => KEY + k));
  await AsyncStorage.setItem(KEY + 'settings', JSON.stringify(state.settings));
  emit();
}
