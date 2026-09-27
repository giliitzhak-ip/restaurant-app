// מאגר תמונות מקומי ל-iOS/Android: קבצים בתיקיית המסמכים של האפליקציה.
// התמונות לא יוצאות מהמכשיר אלא אם המשתמש מבקש במפורש (שיתוף/שירות ענן).
import { Directory, File, Paths } from 'expo-file-system';
import type { ImageRef } from '@/model/types';
import { uid } from '@/utils/id';

const dir = () => {
  const d = new Directory(Paths.document, 'images');
  if (!d.exists) d.create({ intermediates: true });
  return d;
};

const fileFor = (ref: ImageRef) => new File(dir(), ref.replace(/^img:/, ''));

export async function saveImageBase64(base64: string, ext: 'jpg' | 'png'): Promise<ImageRef> {
  const name = `${uid()}.${ext}`;
  const f = new File(dir(), name);
  f.create({ overwrite: true });
  f.write(base64, { encoding: 'base64' });
  return `img:${name}`;
}

export async function getImageUri(ref: ImageRef): Promise<string> {
  return fileFor(ref).uri;
}

export async function readImageBase64(ref: ImageRef): Promise<string> {
  return fileFor(ref).base64();
}

export async function deleteImage(ref: ImageRef | undefined): Promise<void> {
  if (!ref) return;
  try {
    const f = fileFor(ref);
    if (f.exists) f.delete();
  } catch {
    // קובץ חסר – אין מה למחוק
  }
}

export async function listImages(): Promise<{ ref: ImageRef; bytes: number }[]> {
  return dir()
    .list()
    .filter((e): e is File => e instanceof File)
    .map((f) => ({ ref: `img:${f.name}`, bytes: f.size ?? 0 }));
}

export async function clearImages(): Promise<void> {
  const d = dir();
  if (d.exists) d.delete();
}

/** כתיבת קובץ זמני (לשיתוף/ייצוא). */
export async function writeTempFile(base64: string, name: string): Promise<string> {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  f.write(base64, { encoding: 'base64' });
  return f.uri;
}
