// מאגר תמונות לדפדפן (תצוגה מקדימה ובדיקות): IndexedDB, מקומי בדפדפן בלבד.
import type { ImageRef } from '@/model/types';
import { uid } from '@/utils/id';

const DB = 'matai-images';
const STORE = 'images';
let dbPromise: Promise<IDBDatabase> | null = null;
const urlCache = new Map<string, string>();

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

function b64ToBlob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function saveImageBase64(base64: string, ext: 'jpg' | 'png'): Promise<ImageRef> {
  const name = `${uid()}.${ext}`;
  await tx('readwrite', (s) => s.put(b64ToBlob(base64, ext === 'png' ? 'image/png' : 'image/jpeg'), name));
  return `img:${name}`;
}

export async function getImageUri(ref: ImageRef): Promise<string> {
  const key = ref.replace(/^img:/, '');
  const cached = urlCache.get(key);
  if (cached) return cached;
  const blob = await tx<Blob | undefined>('readonly', (s) => s.get(key) as IDBRequest<Blob | undefined>);
  if (!blob) throw new Error('התמונה לא נמצאה במאגר');
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

export async function readImageBase64(ref: ImageRef): Promise<string> {
  const key = ref.replace(/^img:/, '');
  const blob = await tx<Blob | undefined>('readonly', (s) => s.get(key) as IDBRequest<Blob | undefined>);
  if (!blob) throw new Error('התמונה לא נמצאה במאגר');
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function deleteImage(ref: ImageRef | undefined): Promise<void> {
  if (!ref) return;
  const key = ref.replace(/^img:/, '');
  const u = urlCache.get(key);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(key);
  await tx('readwrite', (s) => s.delete(key));
}

export async function listImages(): Promise<{ ref: ImageRef; bytes: number }[]> {
  const keys = (await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) as string[];
  const out: { ref: ImageRef; bytes: number }[] = [];
  for (const k of keys) {
    const b = await tx<Blob | undefined>('readonly', (s) => s.get(k) as IDBRequest<Blob | undefined>);
    out.push({ ref: `img:${k}`, bytes: b?.size ?? 0 });
  }
  return out;
}

export async function clearImages(): Promise<void> {
  urlCache.forEach((u) => URL.revokeObjectURL(u));
  urlCache.clear();
  await tx('readwrite', (s) => s.clear());
}

export async function writeTempFile(base64: string, name: string): Promise<string> {
  const mime = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return URL.createObjectURL(b64ToBlob(base64, mime));
}
