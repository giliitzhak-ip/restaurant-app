import { SiteHeader } from '@/components/storefront/site-header'
import { SiteFooter } from '@/components/storefront/site-footer'
import { MobileBottomNav } from '@/components/storefront/mobile-bottom-nav'
import { DemoDataBanner } from '@/components/storefront/demo-banner'
import { getCart } from '@/lib/cart/service'
import { getSetting } from '@/lib/settings'

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const [cart, showDemoBanner] = await Promise.all([
    getCart(),
    getSetting('store.demoDataBanner'),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">דילוג לתוכן הראשי</a>
      {showDemoBanner && <DemoDataBanner />}
      <SiteHeader cartCount={cart.itemCount} />
      <main id="main" className="flex-1 pb-20 md:pb-0">
        {children}
      </main>
      <SiteFooter />
      <MobileBottomNav cartCount={cart.itemCount} />
    </div>
  )
}
