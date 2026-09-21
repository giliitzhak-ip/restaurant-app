import Link from 'next/link'
import { ArrowLeft, ShieldCheck, Truck, Sparkles, Headphones } from 'lucide-react'
import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { PUBLIC_PRODUCT_WHERE, productCardSelect, toCardView } from '@/lib/catalog/queries'
import { ProductCard } from '@/components/storefront/product-card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export const revalidate = 300

const PROBLEMS = [
  { slug: 'ants', label: 'נמלים' },
  { slug: 'cockroaches', label: 'תיקנים' },
  { slug: 'flies', label: 'זבובים' },
  { slug: 'mosquitoes', label: 'יתושים' },
  { slug: 'rodents', label: 'מכרסמים' },
  { slug: 'pigeons', label: 'יונים' },
  { slug: 'moths', label: 'עש' },
  { slug: 'garden-pests', label: 'מזיקים בגינה' },
]

const TRUST = [
  { Icon: ShieldCheck, title: 'מידע מאומת בלבד', text: 'מוצרי מניעת מזיקים מפורסמים רק לאחר בדיקת תווית ורישום.' },
  { Icon: Truck, title: 'משלוח מהיר', text: 'שליח עד הבית או איסוף מנקודת חלוקה.' },
  { Icon: Sparkles, title: 'פתרון ולא רק מוצר', text: 'אשף הפתרונות מוביל מהבעיה למוצר המתאים.' },
  { Icon: Headphones, title: 'ליווי אנושי', text: 'צוות שירות שעונה על שאלות לפני ואחרי הקנייה.' },
]

async function section(where: Prisma.ProductWhereInput, take = 8) {
  const rows = await prisma.product.findMany({
    where: { ...PUBLIC_PRODUCT_WHERE, ...where },
    select: productCardSelect,
    orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    take,
  })
  return rows.map(toCardView)
}

function Row({
  title,
  subtitle,
  href,
  products,
}: {
  title: string
  subtitle?: string
  href: string
  products: Awaited<ReturnType<typeof section>>
}) {
  if (products.length === 0) return null
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
        </div>
        <Link href={href} className="group flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700">
          לכל המוצרים
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
        </Link>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}

export default async function HomePage() {
  const [categories, bestSellers, newArrivals, organization, garden, prevention, onSale] = await Promise.all([
    prisma.category.findMany({
      where: { parentId: null, isActive: true },
      orderBy: { position: 'asc' },
      select: { slug: true, name: true, description: true },
      take: 8,
    }),
    section({ isBestSeller: true }),
    section({ isNew: true }),
    section({ categories: { some: { category: { OR: [{ slug: 'organization' }, { parent: { slug: 'organization' } }] } } } }),
    section({ categories: { some: { category: { OR: [{ slug: 'garden' }, { parent: { slug: 'garden' } }] } } } }),
    section({ categories: { some: { category: { OR: [{ slug: 'pest-prevention' }, { parent: { slug: 'pest-prevention' } }] } } } }),
    section({ salePrice: { not: null } }),
  ])

  const totalPublished = bestSellers.length + newArrivals.length + organization.length + garden.length

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-bl from-brand-50 via-white to-sand-50">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center">
          <div className="animate-rise">
            <p className="text-sm font-semibold text-brand-700">Premium Home &amp; Garden Solutions</p>
            <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-ink-900 sm:text-5xl">
              פתרונות חכמים
              <br />
              לבית ולגינה
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-ink-600">
              אחסון וארגון, גינה וחצר, וניהול חכם של מזיקים — במקום אחד, בלי להתמצא במושגים מקצועיים.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/category/organization">
                <Button size="lg">קנו לפי קטגוריה</Button>
              </Link>
              <Link href="/solver">
                <Button size="lg" variant="outline">מצאו פתרון לבעיה</Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {categories.slice(0, 4).map((category) => (
              <Link
                key={category.slug}
                href={`/category/${category.slug}`}
                className="group flex h-32 flex-col justify-end rounded-card border border-ink-200/70 bg-white/70 p-4 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift sm:h-40"
              >
                <span className="text-sm font-bold text-ink-900 sm:text-base">{category.name}</span>
                <span className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-700">
                  לצפייה
                  <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Problem finder */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="rounded-card border border-ink-200 bg-white p-6 shadow-soft sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">מה הבעיה אצלכם?</h2>
          <p className="mt-1.5 text-sm text-ink-500">בחרו את המזיק ונוביל אתכם לפתרון המתאים, כולל אפשרות לבדיקה מקצועית.</p>
          <ul className="mt-6 flex flex-wrap gap-2.5">
            {PROBLEMS.map((problem) => (
              <li key={problem.slug}>
                <Link
                  href={`/solver/${problem.slug}`}
                  className="inline-flex items-center rounded-pill border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-800 transition-all hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800"
                >
                  {problem.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Top categories */}
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <h2 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">קטגוריות מובילות</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/category/${category.slug}`}
              className="rounded-card border border-ink-200 bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift"
            >
              <h3 className="text-sm font-bold text-ink-900">{category.name}</h3>
              {category.description && (
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-500">{category.description}</p>
              )}
            </Link>
          ))}
        </div>
      </section>

      {totalPublished === 0 && (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <EmptyState
            title="הקטלוג בהקמה"
            description="המוצרים מוזנים כעת במערכת הניהול. מוצרים מתפרסמים רק לאחר השלמת מחיר, תמונות ואימות רגולטורי."
          />
        </div>
      )}

      <Row title="רבי מכר" subtitle="המוצרים שהכי נקנים אצלנו" href="/category/home" products={bestSellers} />
      <Row title="חדש בחנות" subtitle="הגעות אחרונות" href="/category/home" products={newArrivals} />
      <Row title="סדר וארגון" subtitle="אחסון שמחזיק לאורך זמן" href="/category/organization" products={organization} />
      <Row title="גינה וחצר" subtitle="השקיה, גינון ו-BBQ" href="/category/garden" products={garden} />
      <Row title="מניעת מזיקים" subtitle="פתרונות לשימוש ביתי" href="/category/pest-prevention" products={prevention} />
      <Row title="מבצעים" subtitle="מחירים מיוחדים לזמן מוגבל" href="/category/sale" products={onSale} />

      {/* Trust */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(({ Icon, title, text }) => (
            <div key={title} className="rounded-card border border-ink-200 bg-white p-5">
              <Icon className="size-6 text-brand-700" aria-hidden />
              <h3 className="mt-3 text-sm font-bold text-ink-900">{title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Newsletter */}
      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
        <div className="rounded-card bg-brand-800 px-6 py-10 text-center sm:px-10">
          <h2 className="text-xl font-bold text-white sm:text-2xl">מדריכים ומבצעים במייל</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-brand-100">
            נשלח רק תוכן מועיל. אפשר להסיר את ההרשמה בכל רגע.
          </p>
          <form action="/api/newsletter" method="post" className="mx-auto mt-6 flex max-w-md flex-col gap-2 sm:flex-row">
            <label htmlFor="newsletter-email" className="sr-only">כתובת אימייל</label>
            <input
              id="newsletter-email"
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="h-12 flex-1 rounded-xl border-0 px-4 text-sm text-ink-900 outline-none"
            />
            <Button type="submit" variant="sand" size="lg">הרשמה</Button>
          </form>
        </div>
      </section>
    </>
  )
}
