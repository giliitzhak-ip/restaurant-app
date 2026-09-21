import Link from 'next/link'
import { Home, LayoutGrid, Sparkles, ShoppingBag } from 'lucide-react'

const ITEMS = [
  { href: '/', label: 'בית', Icon: Home },
  { href: '/category/pest-prevention', label: 'קטגוריות', Icon: LayoutGrid },
  { href: '/solver', label: 'פתרון', Icon: Sparkles },
  { href: '/cart', label: 'עגלה', Icon: ShoppingBag },
]

export function MobileBottomNav({ cartCount }: { cartCount: number }) {
  return (
    <nav
      aria-label="ניווט מהיר"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4">
        {ITEMS.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link href={href} className="relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-ink-600">
              <Icon className="size-5" aria-hidden />
              {label}
              {href === '/cart' && cartCount > 0 && (
                <span className="absolute top-1 translate-x-4 rounded-pill bg-brand-700 px-1.5 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
