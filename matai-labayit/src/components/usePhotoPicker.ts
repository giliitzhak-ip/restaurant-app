import { useState } from 'react';
import { acquirePhoto, openAppSettings, PermissionDeniedError, type ImportedPhoto } from '@/services/media';
import { useFeedback } from './Feedback';

/** צילום/בחירת תמונה עם טיפול בהרשאות ובשגיאות בהודעות ברורות. */
export function usePhotoPicker() {
  const { ask, toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  const pick = async (source: 'camera' | 'library', maxDim?: number): Promise<ImportedPhoto | null> => {
    setBusy(true);
    try {
      return await acquirePhoto(source, maxDim);
    } catch (e) {
      if (e instanceof PermissionDeniedError) {
        const choice = await ask('אין גישה למצלמה', e.message, [
          { label: 'בחירה מהגלריה', value: 'library', style: 'secondary' },
          ...(e.canAskAgain ? [] : [{ label: 'פתיחת הגדרות', value: 'settings' as const, style: 'primary' as const }]),
        ]);
        if (choice === 'settings') openAppSettings();
        if (choice === 'library') return pick('library', maxDim);
        return null;
      }
      toast(`לא הצלחנו לטעון את התמונה. נסו שוב או בחרו תמונה אחרת. (${(e as Error).message})`, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  return { pick, busy };
}
