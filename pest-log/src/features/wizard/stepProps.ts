import type { DraftApi } from '@/state/useDraft';
import type { ReferenceData } from '@/state/AppContext';

export interface StepProps {
  draft: DraftApi;
  reference: ReferenceData;
  /** מזהה היומן — נדרש לשיוך קבצים. */
  logId: string;
  /** הארגון — נדרש לנתיב באחסון הפרטי. */
  organizationId: string | null;
  /** שגיאות לפי נתיב, מהוולידציה האחרונה. */
  errors: Map<string, string>;
}

export function errorFor(errors: Map<string, string>, path: string): string | undefined {
  return errors.get(path);
}
