// צילום/בחירת תמונה. הרשאות מבוקשות רק ברגע שצריך אותן (לחיצה על "צלמו").
// בחירה מהגלריה משתמשת בבוחר המערכת – לא דורשת הרשאת גישה לכל התמונות.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Linking, Platform } from 'react-native';
import type { ImageRef } from '@/model/types';
import { saveImageBase64 } from '@/storage/imageStore';

export class PermissionDeniedError extends Error {
  canAskAgain: boolean;
  constructor(message: string, canAskAgain: boolean) {
    super(message);
    this.canAskAgain = canAskAgain;
  }
}

export type ImportedPhoto = { ref: ImageRef; width: number; height: number };

export const openAppSettings = () => Linking.openSettings().catch(() => undefined);

export async function acquirePhoto(source: 'camera' | 'library', maxDim = 2048): Promise<ImportedPhoto | null> {
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
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
  } else {
    result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: false });
  }
  if (result.canceled || !result.assets?.length) return null;
  return importUri(result.assets[0].uri, maxDim, result.assets[0].width, result.assets[0].height);
}

/** נרמול: סיבוב לפי EXIF, הקטנה לגודל סביר ושמירה כ-JPEG במאגר המקומי. */
export async function importUri(uri: string, maxDim = 2048, w0?: number, h0?: number): Promise<ImportedPhoto> {
  const ctx = ImageManipulator.manipulate(uri);
  if (w0 && h0 && Math.max(w0, h0) > maxDim) {
    if (w0 >= h0) ctx.resize({ width: maxDim });
    else ctx.resize({ height: maxDim });
  }
  const rendered = await ctx.renderAsync();
  let out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.88, base64: true });
  if (!w0 && Math.max(out.width, out.height) > maxDim) {
    // לא ידענו את הגודל מראש – מקטינים בשלב שני
    const ctx2 = ImageManipulator.manipulate(out.uri);
    if (out.width >= out.height) ctx2.resize({ width: maxDim });
    else ctx2.resize({ height: maxDim });
    out = await (await ctx2.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.88, base64: true });
  }
  if (!out.base64) throw new Error('עיבוד התמונה נכשל');
  const b64 = out.base64.replace(/^data:image\/\w+;base64,/, '');
  const ref = await saveImageBase64(b64, 'jpg');
  return { ref, width: out.width, height: out.height };
}
