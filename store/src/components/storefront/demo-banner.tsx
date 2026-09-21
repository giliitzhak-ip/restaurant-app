import { Info } from 'lucide-react'

/**
 * The storefront says out loud that part of the catalogue is demo data, so no
 * visitor mistakes a placeholder for a real offer.
 */
export function DemoDataBanner() {
  return (
    <div className="bg-sand-200 px-4 py-2 text-center text-xs font-medium text-ink-900">
      <p className="mx-auto flex max-w-4xl items-center justify-center gap-2">
        <Info className="size-3.5 shrink-0" aria-hidden />
        חלק מהמוצרים המוצגים הם נתוני דמו לצורכי הקמה. מוצרי מניעת מזיקים יפורסמו רק לאחר אימות רגולטורי.
      </p>
    </div>
  )
}
