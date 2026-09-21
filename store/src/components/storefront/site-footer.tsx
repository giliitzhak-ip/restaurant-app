import Link from 'next/link'
import { Leaf } from 'lucide-react'

const COLUMNS = [
  {
    title: 'קנייה',
    links: [
      { href: '/category/pest-prevention', label: 'הדברה ומניעה' },
      { href: '/category/garden', label: 'גינה וחצר' },
      { href: '/category/organization', label: 'סדר וארגון' },
      { href: '/category/sale', label: 'מבצעים' },
    ],
  },
  {
    title: 'עזרה',
    links: [
      { href: '/page/faq', label: 'שאלות נפוצות' },
      { href: '/page/shipping-policy', label: 'מדיניות משלוחים' },
      { href: '/page/returns-policy', label: 'החזרות וביטולים' },
      { href: '/solver', label: 'מצאו פתרון לבעיה' },
    ],
  },
  {
    title: 'מידע',
    links: [
      { href: '/guides', label: 'מדריכים' },
      { href: '/page/privacy-policy', label: 'פרטיות' },
      { href: '/page/terms', label: 'תנאי שימוש' },
      { href: '/page/accessibility', label: 'הצהרת נגישות' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-ink-100 bg-ink-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-700 text-white">
                <Leaf className="size-5" aria-hidden />
              </span>
              <span className="text-base font-bold">בית וגינה</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-500">
              פתרונות חכמים לבית, לגינה, לסדר ולארגון ולמניעת מזיקים לשימוש ביתי.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-semibold text-ink-900">{column.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-ink-500 transition-colors hover:text-brand-700">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 border-t border-ink-200 pt-6 text-xs text-ink-400">
          <p>© {new Date().getFullYear()} בית וגינה. כל הזכויות שמורות.</p>
          <p className="mt-1">
            מידע על מוצרי מניעת מזיקים מוצג רק לאחר אימות מול תווית רשמית. אין באתר תחליף לייעוץ מקצועי.
          </p>
        </div>
      </div>
    </footer>
  )
}
