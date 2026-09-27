// שכבת הצילום ובחירת הקבצים (נפרדת מעיבוד התמונה ומהעורך).
// - הרשאות מבוקשות רק ברגע שצריך אותן (לחיצה על "צלם").
// - בחירה מהגלריה משתמשת בבוחר המערכת – בלי גישה לכל התמונות.
// - כל תמונה מנורמלת: סיבוב לפי EXIF, המרה מ-HEIC ל-JPEG, הקטנה לגודל סביר (תמונות 48MP ומעלה).
// - אנדרואיד עלול לסגור את האפליקציה בזמן שהמצלמה פתוחה: שומרים "הקשר צילום" ומשחזרים את התמונה בחזרה.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Linking, Platform } from 'react-native';
import type { ImageRef } from '@/model/types';
import { deleteImage, getImageUri, saveImageBase64 } from '@/storage/imageStore';

export class PermissionDeniedError extends Error {
  canAskAgain: boolean;
  constructor(message: string, canAskAgain: boolean) {
    super(message);
    this.canAskAgain = canAskAgain;
  }
}

export class ImportError extends Error {}

export type ImportedPhoto = { ref: ImageRef; width: number; height: number };

/** לאן לחזור עם תמונה שצולמה אם האפליקציה נסגרה בזמן הצילום. */
export type CaptureContext = { purpose: 'room' | 'product'; params: Record<string, string> };

const PENDING_KEY = 'matai/v1/pendingCapture';

export const openAppSettings = () => Linking.openSettings().catch(() => undefined);

export async function acquirePhoto(source: 'camera' | 'library', maxDim = 2048, ctx?: CaptureContext): Promise<ImportedPhoto | null> {
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        throw new PermissionDeniedError(
          'כדי לצלם צריך לאשר גישה למצלמה. אפשר לאשר בהגדרות הטלפון, או לבחור תמונה מהגלריה במקום.',
          perm.canAskAgain,
        );
      }
    }
    if (ctx) await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ ...ctx, at: Date.now() })).catch(() => undefined);
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.92, exif: false });
  } else {
    result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.92, allowsMultipleSelection: false });
  }
  await AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0];
  return importUri(a.uri, maxDim, a.width, a.height);
}

/**
 * אנדרואיד: אם המערכת סגרה את האפליקציה בזמן שהמצלמה הייתה פתוחה, התמונה לא אובדת –
 * משחזרים אותה בהפעלה הבאה ומחזירים את המשתמש למסך שממנו צילם.
 */
export async function recoverPendingCapture(): Promise<{ ctx: CaptureContext; photo: ImportedPhoto } | null> {
  if (Platform.OS !== 'android') return null;
  const raw = await AsyncStorage.getItem(PENDING_KEY).catch(() => null);
  if (!raw) return null;
  await AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
  const ctx = JSON.parse(raw) as CaptureContext & { at: number };
  if (Date.now() - ctx.at > 60 * 60 * 1000) return null;
  const pending = await ImagePicker.getPendingResultAsync();
  if (!pending || 'code' in pending || pending.canceled || !pending.assets?.length) return null;
  const a = pending.assets[0];
  return { ctx, photo: await importUri(a.uri, 2048, a.width, a.height) };
}

/** נרמול: סיבוב לפי EXIF, הקטנה לגודל סביר ושמירה כ-JPEG במאגר המקומי. */
export async function importUri(uri: string, maxDim = 2048, w0?: number, h0?: number): Promise<ImportedPhoto> {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    if (w0 && h0 && Math.max(w0, h0) > maxDim) {
      if (w0 >= h0) ctx.resize({ width: maxDim });
      else ctx.resize({ height: maxDim });
    }
    const rendered = await ctx.renderAsync();
    let out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });
    if (Math.max(out.width, out.height) > maxDim) {
      // לא ידענו את הגודל מראש – מקטינים בשלב שני
      const ctx2 = ImageManipulator.manipulate(out.uri);
      if (out.width >= out.height) ctx2.resize({ width: maxDim });
      else ctx2.resize({ height: maxDim });
      out = await (await ctx2.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });
    }
    if (!out.base64) throw new Error('empty');
    const b64 = out.base64.replace(/^data:image\/\w+;base64,/, '');
    const ref = await saveImageBase64(b64, 'jpg');
    return { ref, width: out.width, height: out.height };
  } catch (e) {
    throw new ImportError(
      /memory|OOM|alloc/i.test(String((e as Error)?.message))
        ? 'התמונה גדולה מדי לעיבוד במכשיר. נסו לצלם שוב ברזולוציה רגילה.'
        : 'לא הצלחנו לפתוח את התמונה (ייתכן שהקובץ פגום או בפורמט לא נתמך). נסו תמונה אחרת.',
    );
  }
}

async function transform(photo: ImportedPhoto, fn: (c: ReturnType<typeof ImageManipulator.manipulate>) => void): Promise<ImportedPhoto> {
  const uri = await getImageUri(photo.ref);
  const ctx = ImageManipulator.manipulate(uri);
  fn(ctx);
  const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.92, base64: true });
  if (!out.base64) throw new ImportError('עיבוד התמונה נכשל');
  const ref = await saveImageBase64(out.base64.replace(/^data:image\/\w+;base64,/, ''), 'jpg');
  await deleteImage(photo.ref);
  return { ref, width: out.width, height: out.height };
}

/** סיבוב ב-90° (למשל כשהטלפון זיהה כיוון שגוי). */
export const rotatePhoto = (photo: ImportedPhoto, deg: 90 | -90 | 180) => transform(photo, (c) => c.rotate(deg));

/** חיתוך למלבן (בפיקסלים של התמונה). */
export const cropPhoto = (photo: ImportedPhoto, r: { x: number; y: number; w: number; h: number }) =>
  transform(photo, (c) =>
    c.crop({
      originX: Math.max(0, Math.round(r.x)),
      originY: Math.max(0, Math.round(r.y)),
      width: Math.min(photo.width - Math.round(r.x), Math.round(r.w)),
      height: Math.min(photo.height - Math.round(r.y), Math.round(r.h)),
    }),
  );
