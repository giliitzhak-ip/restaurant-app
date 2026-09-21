import Link from 'next/link'
import { Search, ShoppingBag, Heart, User, Leaf } from 'lucide-react'
import { MobileMenu } from './mobile-menu'

const NAV = [
  { href: '/category/pest-prevention', label: 'הדברה ומניעה' },
  { href: '/category/garden', label: 'גינה וחצר' },
  { href: '/category/organization', label: 'סדר וארגון' },
  { href: '/category/home', label: 'פתרונות לבית' },
  { href: '/category/sale', label: 'מבצעים' },
]

export function SiteHeader({ cartCount }: { cartCount: number }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <MobileMenu items={NAV} />

        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="בית וגינה — לעמוד הבית">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand-700 text-white">
            <Leaf className="size-5" aria-hidden />
          </span>
          <span className="hidden text-base font-bold tracking-tight text-ink-900 sm:block">בית וגינה</span>
        </Link>

        <nav aria-label="ניווט ראשי" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-800"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <form action="/search" role="search" className="relative ms-auto hidden max-w-sm flex-1 md:block">
          <label htmlFor="site-search" className="sr-only">חיפוש מוצרים</label>
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-ink-400 start-3" aria-hidden />
          <input
            id="site-search"
            name="q"
            type="search"
            placeholder="חיפוש מוצר, מותג או בעיה…"
            className="h-10 w-full rounded-pill border border-ink-200 bg-ink-50 ps-9 pe-4 text-sm outline-none transition-colors focus:border-brand-400 focus:bg-white"
          />
        </form>

        <div className="flex items-center gap-0.5 ms-auto md:ms-0">
          <Link href="/search" className="flex size-10 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100 md:hidden" aria-label="חיפוש">
            <Search className="size-5" aria-hidden />
          </Link>
          <Link href="/account" className="hidden size-10 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100 sm:flex" aria-label="החשבון שלי">
            <User className="size-5" aria-hidden />
          </Link>
          <Link href="/wishlist" className="hidden size-10 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100 sm:flex" aria-label="מועדפים">
            <Heart className="size-5" aria-hidden />
          </Link>
          <Link href="/cart" className="relative flex size-10 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100" aria-label={`עגלת קניות, ${cartCount} פריטים`}>
            <ShoppingBag className="size-5" aria-hidden />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 flex min-w-5 items-center justify-center rounded-pill bg-brand-700 px-1 text-[11px] font-bold text-white end-0">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  )
}
