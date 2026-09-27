// עבודה עם תמונות ברמת הפיקסלים באמצעות Skia (עובד ב-iOS, אנדרואיד ובדפדפן).
import { AlphaType, ColorType, ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import type { ImageRef } from '@/model/types';
import { getImageUri, saveImageBase64 } from '@/storage/imageStore';

export type Pixels = { data: Uint8Array; width: number; height: number };

const cache = new Map<string, Promise<SkImage>>();

export async function loadSkImageFromUri(uri: string): Promise<SkImage> {
  const data = await Skia.Data.fromURI(uri);
  const img = Skia.Image.MakeImageFromEncoded(data);
  if (!img) throw new Error('לא הצלחנו לקרוא את התמונה');
  return img;
}

export function loadSkImage(ref: ImageRef): Promise<SkImage> {
  let p = cache.get(ref);
  if (!p) {
    p = getImageUri(ref).then(loadSkImageFromUri);
    p.catch(() => cache.delete(ref));
    cache.set(ref, p);
  }
  return p;
}

export function forgetSkImage(ref: ImageRef) {
  cache.delete(ref);
}

/** הוק שטוען כמה תמונות לפי הפניה ומחזיר מפה. */
export function useSkImages(refs: (ImageRef | undefined)[]): Record<string, SkImage> {
  const [map, setMap] = useState<Record<string, SkImage>>({});
  const key = refs.filter(Boolean).sort().join('|');
  useEffect(() => {
    let alive = true;
    const list = key ? key.split('|') : [];
    Promise.all(
      list.map((r) =>
        loadSkImage(r)
          .then((img) => [r, img] as const)
          .catch(() => null),
      ),
    ).then((pairs) => {
      if (!alive) return;
      const next: Record<string, SkImage> = {};
      pairs.forEach((p) => p && (next[p[0]] = p[1]));
      setMap(next);
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return map;
}

export function useSkImage(ref: ImageRef | undefined): SkImage | null {
  const map = useSkImages([ref]);
  return ref ? map[ref] ?? null : null;
}

/** קריאת פיקסלים (RGBA) בהקטנה לגודל עבודה, לצורך אלגוריתמים מקומיים. */
export function readPixels(img: SkImage, maxDim: number): Pixels {
  const scale = Math.min(1, maxDim / Math.max(img.width(), img.height()));
  const width = Math.max(1, Math.round(img.width() * scale));
  const height = Math.max(1, Math.round(img.height() * scale));
  const surface = Skia.Surface.Make(width, height);
  if (!surface) throw new Error('יצירת משטח עבודה נכשלה');
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  canvas.drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(0, 0, width, height), paint);
  surface.flush();
  const snap = surface.makeImageSnapshot();
  const px = snap.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  if (!px) throw new Error('קריאת פיקסלים נכשלה');
  return { data: new Uint8Array(px.buffer, px.byteOffset, px.byteLength), width, height };
}

export function imageFromPixels(p: Pixels): SkImage {
  const data = Skia.Data.fromBytes(p.data);
  const img = Skia.Image.MakeImage(
    { width: p.width, height: p.height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
    data,
    p.width * 4,
  );
  if (!img) throw new Error('יצירת תמונה נכשלה');
  return img;
}

/** שינוי גודל ו/או חיתוך תמונה. */
export function resizeImage(img: SkImage, w: number, h: number, src?: { x: number; y: number; w: number; h: number }): SkImage {
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  const surface = Skia.Surface.Make(W, H);
  if (!surface) throw new Error('יצירת משטח עבודה נכשלה');
  const s = src ?? { x: 0, y: 0, w: img.width(), h: img.height() };
  const paint = Skia.Paint();
  surface.getCanvas().drawImageRect(img, Skia.XYWHRect(s.x, s.y, s.w, s.h), Skia.XYWHRect(0, 0, W, H), paint);
  surface.flush();
  return surface.makeImageSnapshot();
}

export function encode(img: SkImage, fmt: 'png' | 'jpg', quality = 90): string {
  const b64 = img.encodeToBase64(fmt === 'png' ? ImageFormat.PNG : ImageFormat.JPEG, quality);
  if (!b64) throw new Error('קידוד התמונה נכשל');
  return b64;
}

export async function saveSkImage(img: SkImage, fmt: 'png' | 'jpg', quality = 90): Promise<ImageRef> {
  return saveImageBase64(encode(img, fmt, quality), fmt);
}

/** טעינת תמונה ממקור חיצוני (מצלמה/גלריה), תיקון גודל ושמירה במאגר המקומי. */
export async function importPhoto(uri: string, maxDim = 2048): Promise<{ ref: ImageRef; width: number; height: number }> {
  const img = await loadSkImageFromUri(uri);
  const scale = Math.min(1, maxDim / Math.max(img.width(), img.height()));
  const out = scale < 1 ? resizeImage(img, img.width() * scale, img.height() * scale) : img;
  const ref = await saveSkImage(out, 'jpg', 88);
  return { ref, width: out.width(), height: out.height() };
}
