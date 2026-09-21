import Link from 'next/link'
import {
  LayoutDashboard, Package, Images, Boxes, ShoppingCart, Users, Truck,
  ShieldCheck, Ticket, FileText, Settings, Star, ScrollText, Leaf, FlaskConical,
} from 'lucide-react'
import type { AdminSession } from '@/lib/auth/session'
import { can, ROLE_LABELS, type Permission } from '@/lib/auth/rbac'
import { LogoutButton } from './logout-button'

interface NavItem {
  href: string
  label: string
  Icon: typeof LayoutDashboard
  permission: Permission
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'סקירה',
    items: [{ href: '/admin', label: 'דשבורד', Icon: LayoutDashboard, permission: 'dashboard.view' }],
  },
  {
    group: 'קטלוג',
    items: [
      { href: '/admin/products', label: 'מוצרים', Icon: Package, permission: 'products.view' },
      { href: '/admin/media', label: 'ספריית מדיה', Icon: Images, permission: 'media.view' },
      { href: '/admin/inventory', label: 'מלאי', Icon: Boxes, permission: 'inventory.view' },
      { href: '/admin/regulatory', label: 'רגולציה', Icon: ShieldCheck, permission: 'regulatory.view' },
    ],
  },
  {
    group: 'מסחר',
    items: [
      { href: '/admin/orders', label: 'הזמנות', Icon: ShoppingCart, permission: 'orders.view' },
      { href: '/admin/customers', label: 'לקוחות', Icon: Users, permission: 'customers.view' },
      { href: '/admin/coupons', label: 'קופונים', Icon: Ticket, permission: 'promotions.manage' },
      { href: '/admin/reviews', label: 'ביקורות', Icon: Star, permission: 'reviews.moderate' },
    ],
  },
  {
    group: 'תפעול',
    items: [
      { href: '/admin/suppliers', label: 'ספקים', Icon: Truck, permission: 'suppliers.view' },
      { href: '/admin/content', label: 'תוכן', Icon: FileText, permission: 'content.manage' },
      { href: '/admin/simulator', label: 'סימולטור', Icon: FlaskConical, permission: 'simulator.run' },
      { href: '/admin/audit', label: 'יומן פעולות', Icon: ScrollText, permission: 'audit.view' },
      { href: '/admin/settings', label: 'הגדרות', Icon: Settings, permission: 'settings.manage' },
    ],
  },
]

export function AdminShell({ session, children }: { session: AdminSession; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50">
      <a href="#admin-main" className="skip-link">דילוג לתוכן</a>

      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-e border-ink-200 bg-white lg:block">
          <div className="flex items-center gap-2 px-5 py-5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-700 text-white">
              <Leaf className="size-4" aria-hidden />
            </span>
            <span className="text-sm font-bold">מערכת ניהול</span>
          </div>

          <nav aria-label="ניווט ניהול" className="px-3 pb-8">
            {NAV.map((group) => {
              const items = group.items.filter((item) => can(session.role, item.permission))
              if (items.length === 0) return null
              return (
                <div key={group.group} className="mb-5">
                  <h2 className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">{group.group}</h2>
                  <ul className="space-y-0.5">
                    {items.map(({ href, label, Icon }) => (
                      <li key={href}>
                        <Link href={href} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-800">
                          <Icon className="size-4 shrink-0" aria-hidden />
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6">
            <Link href="/admin" className="text-sm font-bold lg:hidden">ניהול</Link>
            <Link href="/" className="text-sm font-medium text-brand-700 hover:underline">← לחנות</Link>
            <div className="ms-auto flex items-center gap-3">
              <span className="hidden text-xs text-ink-500 sm:block">
                {session.name} · {ROLE_LABELS[session.role]}
              </span>
              <LogoutButton />
            </div>
          </header>

          <nav aria-label="ניווט ניהול נייד" className="overflow-x-auto border-b border-ink-200 bg-white px-4 lg:hidden">
            <ul className="flex gap-1 py-2">
              {NAV.flatMap((g) => g.items)
                .filter((item) => can(session.role, item.permission))
                .map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className="block whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100">
                      {label}
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>

          <main id="admin-main" className="p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
