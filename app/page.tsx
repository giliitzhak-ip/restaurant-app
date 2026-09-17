import Link from 'next/link';
import {
  ArrowLeft,
  BadgeCheck,
  ClipboardList,
  Clock,
  CreditCard,
  MessagesSquare,
  Quote,
  ShieldCheck,
  Star,
  UserCheck,
} from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/ui/category-icon';
import { Faq } from '@/features/marketing/components/faq';
import { getCategories } from '@/lib/services/catalogue';
import { getServerDictionary } from '@/lib/i18n/server';

export const revalidate = 300;

const HOW_ICONS = [ClipboardList, MessagesSquare, UserCheck, Clock];

export default async function LandingPage() {
  const [{ t }, categories] = await Promise.all([getServerDictionary(), getCategories()]);

  const howSteps = [
    { title: t.landing.howStep1Title, body: t.landing.howStep1Body },
    { title: t.landing.howStep2Title, body: t.landing.howStep2Body },
    { title: t.landing.howStep3Title, body: t.landing.howStep3Body },
    { title: t.landing.howStep4Title, body: t.landing.howStep4Body },
  ];

  const benefits = [
    { icon: BadgeCheck, title: t.landing.benefit1Title, body: t.landing.benefit1Body },
    { icon: Quote, title: t.landing.benefit2Title, body: t.landing.benefit2Body },
    { icon: Clock, title: t.landing.benefit3Title, body: t.landing.benefit3Body },
    { icon: ShieldCheck, title: t.landing.benefit4Title, body: t.landing.benefit4Body },
  ];

  const providerSteps = [
    t.landing.providerStep1,
    t.landing.providerStep2,
    t.landing.providerStep3,
    t.landing.providerStep4,
  ];

  const testimonials = [
    {
      name: 'רונית ל׳',
      city: 'רמת גן',
      rating: 5,
      quote: 'נזילה בשבת בערב. תוך עשרים דקות היו לי שלוש הצעות, ואינסטלטור הגיע תוך שעה.',
    },
    {
      name: 'אבי מ׳',
      city: 'חיפה',
      rating: 5,
      quote: 'ידעתי בדיוק כמה זה יעלה לפני שהוא יצא לדרך. בלי הפתעות בסוף.',
    },
    {
      name: 'דנה כ׳',
      city: 'באר שבע',
      rating: 4,
      quote: 'הדירוגים עזרו לי לבחור. בחרתי מי שהיה קצת יותר יקר — ושילם את עצמו.',
    },
  ];

  const faq = [
    {
      question: 'כמה עולה לפתוח בקשה?',
      answer: 'פתיחת בקשה וקבלת הצעות מחיר הן ללא עלות. משלמים רק על העבודה עצמה, במחיר שסוכם מראש.',
    },
    {
      question: 'מתי אני מחויב?',
      answer:
        'בעת בחירת בעל המקצוע נתפסת הרשאת תשלום בסכום שסוכם. החיוב בפועל מתבצע רק לאחר שהעבודה הושלמה.',
    },
    {
      question: 'איך אתם מאמתים בעלי מקצוע?',
      answer:
        'כל בעל מקצוע מעלה מסמכי זיהוי, רישיונות וביטוח. הצוות בודק אותם ידנית לפני אישור, והמסמכים נשמרים באחסון פרטי.',
    },
    {
      question: 'מה קורה אם משהו משתבש?',
      answer:
        'אפשר לפתוח תלונה ישירות מתוך העבודה. הצוות בוחן את הפרטים ואת ההתכתבות ומטפל בהתאם למדיניות.',
    },
    {
      question: 'האם אפשר לבחור בעל מקצוע ספציפי?',
      answer: 'כן. אפשר לחפש בעלי מקצוע, לשמור אותם כמועדפים, ומועדפים מקבלים עדיפות בהתאמות הבאות.',
    },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="container-wide flex h-16 items-center justify-between gap-4">
          <Logo />
          <nav className="flex items-center gap-2" aria-label="ניווט ראשי">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">{t.common.login}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">{t.common.signup}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden bg-brand-ink text-white">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                'radial-gradient(60% 60% at 80% 10%, hsl(187 92% 38% / 0.45), transparent 60%)',
            }}
            aria-hidden
          />
          <div className="container-wide relative py-16 sm:py-24">
            <div className="max-w-2xl">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                בעלי מקצוע מאומתים, בזמן אמת
              </p>
              <h1 className="text-4xl font-black leading-[1.1] sm:text-6xl">
                {t.landing.heroTitle}
                <br />
                <span className="text-accent">{t.landing.heroTitleSecond}</span>
              </h1>
              <p className="mt-5 max-w-xl text-base text-white/75 sm:text-lg">
                {t.landing.heroSubtitle}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" variant="accent">
                  <Link href="/signup?role=customer">
                    {t.landing.ctaCustomer}
                    <ArrowLeft aria-hidden />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/30 bg-transparent text-white hover:bg-white/10"
                >
                  <Link href="/signup?role=provider">{t.landing.ctaProvider}</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="container-wide py-16" aria-labelledby="how-title">
          <h2 id="how-title" className="text-2xl font-bold sm:text-3xl">
            {t.landing.howItWorks}
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {howSteps.map((step, index) => {
              const Icon = HOW_ICONS[index];
              return (
                <li key={step.title} className="rounded-xl border bg-card p-5">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <p className="mt-4 text-xs font-bold text-accent">
                    {t.common.step} <span className="num">{index + 1}</span>
                  </p>
                  <h3 className="mt-1 font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Categories */}
        <section className="bg-brand-surface py-16" aria-labelledby="categories-title">
          <div className="container-wide">
            <h2 id="categories-title" className="text-2xl font-bold sm:text-3xl">
              {t.landing.categoriesTitle}
            </h2>
            <p className="mt-2 text-muted-foreground">{t.landing.categoriesSubtitle}</p>
            <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/signup?role=customer&category=${category.slug}`}
                    className="flex h-full flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center transition-colors hover:border-accent/60"
                  >
                    <span className="flex size-11 items-center justify-center rounded-full bg-accent/10 text-accent">
                      <CategoryIcon name={category.icon} />
                    </span>
                    <span className="text-sm font-medium">{category.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Benefits */}
        <section className="container-wide py-16" aria-labelledby="benefits-title">
          <h2 id="benefits-title" className="text-2xl font-bold sm:text-3xl">
            {t.landing.benefitsTitle}
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {benefits.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4 rounded-xl border bg-card p-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* For providers */}
        <section className="bg-brand-ink py-16 text-white" aria-labelledby="providers-title">
          <div className="container-wide grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 id="providers-title" className="text-2xl font-bold sm:text-3xl">
                {t.landing.providersTitle}
              </h2>
              <ol className="mt-6 space-y-3">
                {providerSteps.map((step, index) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                      {index + 1}
                    </span>
                    <span className="pt-0.5 text-white/85">{step}</span>
                  </li>
                ))}
              </ol>
              <Button asChild size="lg" variant="accent" className="mt-8">
                <Link href="/signup?role=provider">{t.landing.ctaProvider}</Link>
              </Button>
            </div>
            <dl className="grid grid-cols-2 gap-4">
              {[
                { label: 'עמלה שקופה', value: '10–15%', icon: CreditCard },
                { label: 'תשלום מאובטח', value: 'J5 + גבייה', icon: ShieldCheck },
                { label: 'עבודות באזור שלך', value: '5–20 ק״מ', icon: Clock },
                { label: 'אימות מסמכים', value: 'ידני', icon: BadgeCheck },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-xl border border-white/15 bg-white/5 p-5">
                  <Icon className="size-5 text-accent" aria-hidden />
                  <dd className="mt-3 text-xl font-bold">{value}</dd>
                  <dt className="text-sm text-white/60">{label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Testimonials */}
        <section className="container-wide py-16" aria-labelledby="reviews-title">
          <h2 id="reviews-title" className="text-2xl font-bold sm:text-3xl">
            {t.landing.reviewsTitle}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {testimonials.map((item) => (
              <li key={item.name} className="rounded-xl border bg-card p-5">
                <span className="flex gap-0.5" aria-label={`${item.rating} מתוך 5`}>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      className={
                        index < item.rating
                          ? 'size-4 fill-warning text-warning'
                          : 'size-4 text-muted-foreground/40'
                      }
                      aria-hidden
                    />
                  ))}
                </span>
                <blockquote className="mt-3 text-sm">{item.quote}</blockquote>
                <p className="mt-3 text-xs text-muted-foreground">
                  {item.name} · {item.city}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section className="bg-brand-surface py-16" aria-labelledby="faq-title">
          <div className="container-page">
            <h2 id="faq-title" className="text-2xl font-bold sm:text-3xl">
              {t.landing.faqTitle}
            </h2>
            <div className="mt-8">
              <Faq items={faq} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-brand-ink py-12 text-white">
        <div className="container-wide grid gap-8 sm:grid-cols-3">
          <div>
            <Logo tone="light" withTagline />
          </div>
          <nav aria-label={t.landing.footerProduct}>
            <h2 className="text-sm font-semibold">{t.landing.footerProduct}</h2>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>
                <Link href="/signup?role=customer" className="hover:text-white">
                  {t.landing.ctaCustomer}
                </Link>
              </li>
              <li>
                <Link href="/signup?role=provider" className="hover:text-white">
                  {t.landing.ctaProvider}
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white">
                  {t.common.login}
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label={t.landing.footerLegal}>
            <h2 className="text-sm font-semibold">{t.landing.footerLegal}</h2>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>
                <Link href="/legal/terms" className="hover:text-white">
                  {t.legal.terms}
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="hover:text-white">
                  {t.legal.privacy}
                </Link>
              </li>
              <li>
                <Link href="/legal/cancellation" className="hover:text-white">
                  {t.legal.cancellation}
                </Link>
              </li>
              <li>
                <Link href="/legal/provider-agreement" className="hover:text-white">
                  {t.legal.providerAgreement}
                </Link>
              </li>
              <li>
                <Link href="/legal/payment-terms" className="hover:text-white">
                  {t.legal.paymentTerms}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="container-wide mt-10 border-t border-white/10 pt-6 text-xs text-white/50">
          © <span className="num">{new Date().getFullYear()}</span> GET SERVICE. {t.landing.footerRights}
        </div>
      </footer>
    </div>
  );
}
