import { useEffect, useState } from 'react';
import { History, Plus } from 'lucide-react';
import { useToast } from '@/state/ToastContext';
import { Alert } from '@/components/Common';
import { listRecentApplications, type RecentApplication } from '@/lib/legacy/repo';
import { formatDateHe } from '@/lib/time';
import type { DraftApi } from '@/state/useDraft';

/**
 * „טעינה מיומנים אחרונים” — הועבר מהגרסה הקודמת.
 *
 * נטענים רק שם התכשיר, החומר הפעיל, האצווה, שיטת היישום ויחידת המינון.
 * המזיק והמינון נשארים ריקים בכוונה: הם משתנים מטיפול לטיפול, והעתקתם
 * הייתה הופכת את היומן ללא נכון. גם האצווה שנטענה חייבת אימות מול
 * האריזה שבידי המדביר.
 */
export function RecentApplicationsPicker({ draft }: { draft: DraftApi }): React.JSX.Element | null {
  const { appendTo, readOnly } = draft;
  const { showToast } = useToast();
  const [recent, setRecent] = useState<RecentApplication[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void listRecentApplications()
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  if (readOnly || recent.length === 0) return null;

  const pick = (item: RecentApplication) => {
    appendTo('applications', {
      productTradeName: item.productTradeName,
      activeIngredientName: item.activeIngredientName ?? '',
      activeIngredientConcentrationPercent: item.activeIngredientConcentrationPercent ?? undefined,
      applicationMethod: item.applicationMethod ?? '',
      dosageUnit: item.dosageUnit ?? '',
      readyToUse: item.readyToUse,
      readyToUseConcentrationDerived: false,
      // בכוונה ריקים: מזיק, מינון ואצווה נקבעים בטיפול הזה.
      targetPestName: '',
      batchNumber: '',
    });
    setOpen(false);
    showToast(`${item.productTradeName} נוסף — יש להשלים מזיק, אצווה ומינון`, 'success');
  };

  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        <History size={16} aria-hidden="true" /> טעינה מיומנים אחרונים
      </button>

      {open ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="תכשירים מיומנים אחרונים"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>תכשירים מיומנים אחרונים</h3>
            <Alert kind="warning" title="מה נטען ומה לא">
              נטענים שם התכשיר, החומר הפעיל, האצווה ושיטת היישום. המזיק והמינון נשארים ריקים, ואת האצווה
              יש לוודא מול האריזה שבידיכם עכשיו.
            </Alert>

            <div className="template-list">
              {recent.map((item) => (
                <button
                  type="button"
                  className="recent-row"
                  key={`${item.productTradeName}|${item.batchNumber ?? ''}`}
                  onClick={() => pick(item)}
                >
                  <span className="recent-main">
                    <strong>{item.productTradeName}</strong>
                    <span className="small muted">
                      אצווה: {item.batchNumber ?? '—'}
                      {item.activeIngredientName ? ` · ${item.activeIngredientName}` : ''}
                      {item.activeIngredientConcentrationPercent !== null
                        ? ` ${item.activeIngredientConcentrationPercent}%`
                        : ''}
                    </span>
                    <span className="small dim">
                      {item.applicationMethod ?? 'ללא שיטה'}
                      {item.serialNumber ? ` · מיומן מס׳ ${item.serialNumber}` : ''}
                      {item.completedAt ? ` · ${formatDateHe(item.completedAt)}` : ''}
                    </span>
                  </span>
                  <span className="recent-plus" aria-hidden="true">
                    <Plus size={18} />
                  </span>
                </button>
              ))}
            </div>

            <button type="button" className="btn" onClick={() => setOpen(false)}>
              סגירה
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
