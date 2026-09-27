// גרסת דפדפן: שיתוף דרך Web Share API אם זמין, אחרת הורדת קובץ.
import { writeTempFile } from '@/storage/imageStore';

export async function shareImage(base64: string, fileName: string): Promise<void> {
  const uri = await writeTempFile(base64, fileName);
  const nav = globalThis.navigator as Navigator & { canShare?: (d: unknown) => boolean };
  try {
    const blob = await (await fetch(uri)).blob();
    const file = new File([blob], fileName, { type: blob.type });
    if (nav?.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: 'מתאים לבית' });
      return;
    }
  } catch {
    // ממשיכים להורדה
  }
  const a = document.createElement('a');
  a.href = uri;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const saveToGallery = shareImage;
