import { useState } from 'react';
import { acquirePhoto, ImportError, openAppSettings, PermissionDeniedError, type CaptureContext, type ImportedPhoto } from '@/services/media';
import { useFeedback } from './Feedback';

/** צילום/בחירת תמונה עם טיפול בהרשאות, בכישלון טעינה (כולל "נסו שוב") ובשחזור אחרי צילום. */
export function usePhotoPicker() {
  const { ask } = useFeedback();
  const [busy, setBusy] = useState(false);

  const pick = async (source: 'camera' | 'library', maxDim?: number, ctx?: CaptureContext): Promise<ImportedPhoto | null> => {
    setBusy(true);
    try {
      return await acquirePhoto(source, maxDim, ctx);
    } catch (e) {
      if (e instanceof PermissionDeniedError) {
        const choice = await ask(source === 'camera' ? 'אין גישה למצלמה' : 'אין גישה לתמונות', e.message, [
          { label: 'בחירה מהגלריה', value: 'library', style: 'secondary' },
          ...(e.canAskAgain ? [] : [{ label: 'פתיחת הגדרות', value: 'settings' as const, style: 'primary' as const }]),
        ]);
        if (choice === 'settings') openAppSettings();
        if (choice === 'library') return pick('library', maxDim, ctx);
        return null;
      }
      const msg = e instanceof ImportError ? e.message : `לא הצלחנו לטעון את התמונה (${(e as Error).message}).`;
      const choice = await ask('הטעינה נכשלה', msg, [
        { label: 'ביטול', value: 'cancel', style: 'secondary' },
        { label: 'נסו שוב', value: 'retry' },
      ]);
      if (choice === 'retry') return pick(source, maxDim, ctx);
      return null;
    } finally {
      setBusy(false);
    }
  };

  return { pick, busy };
}
