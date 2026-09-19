import type { DraftApi } from '@/state/useDraft';
import type { ReferenceData } from '@/state/AppContext';

export interface StepProps {
  draft: DraftApi;
  reference: ReferenceData;
  /** שגיאות לפי נתיב, מהוולידציה האחרונה. */
  errors: Map<string, string>;
}

export function errorFor(errors: Map<string, string>, path: string): string | undefined {
  return errors.get(path);
}
