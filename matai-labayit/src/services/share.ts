// שיתוף ושמירה של תמונות מיוצאות (iOS/Android; לדפדפן ראו share.web.ts). שום דבר לא נשלח בלי פעולה מפורשת של המשתמש.
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { writeTempFile } from '@/storage/imageStore';
import { PermissionDeniedError } from './media';

export async function shareImage(base64: string, fileName: string): Promise<void> {
  const uri = await writeTempFile(base64, fileName);
  if (!(await Sharing.isAvailableAsync())) throw new Error('שיתוף אינו זמין במכשיר זה');
  await Sharing.shareAsync(uri, { mimeType: fileName.endsWith('.png') ? 'image/png' : 'image/jpeg', dialogTitle: 'שיתוף ההדמיה' });
}

export async function saveToGallery(base64: string, fileName: string): Promise<void> {
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) throw new PermissionDeniedError('כדי לשמור בגלריה צריך לאשר הרשאת שמירה לתמונות.', perm.canAskAgain);
  const uri = await writeTempFile(base64, fileName);
  await MediaLibrary.Asset.create(uri);
}
