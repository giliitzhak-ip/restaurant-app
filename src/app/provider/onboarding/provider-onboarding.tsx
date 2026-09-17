'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  inputClasses,
  LoadingState,
  Money,
  SectionLabel,
} from '@/components/ui';
import { Logo } from '@/components/brand';
import { apiFetch, ApiRequestError } from '@/lib/client/api';
import { useGeolocation } from '@/lib/client/use-geolocation';

interface Category {
  slug: string;
  name_he: string;
  default_radius_km: string;
  requires_license: boolean;
  requires_insurance: boolean;
  requires_documents: boolean;
}

interface Service {
  category_slug: string;
  slug: string;
  name_he: string;
  base_price_ils: string | null;
  min_price_ils: string | null;
  max_price_ils: string | null;
}

interface TradeProposal {
  id: string;
  proposed_name: string;
  description: string | null;
  price_ils: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  review_note: string | null;
  created_at: string;
  suggested_category_name: string | null;
  resolved_service_name: string | null;
  resolved_category_name: string | null;
}

interface ProfileResponse {
  catalog: { categories: Category[]; services: Service[] };
  profile: {
    business_name: string | null;
    bio: string | null;
    years_experience: number;
    max_radius_km: string;
    verification: string;
    full_name: string;
  } | null;
  categorySlug: string | null;
  services: { slug: string; price_ils: string | null }[];
  serviceArea: { lat: number; lon: number; radius_km: string } | null;
  isConfigured: boolean;
  canReceiveWork: boolean;
}

/**
 * A guided setup rather than one long form: each step is the next thing the
 * platform genuinely needs, and the provider can see why.
 */
export function ProviderOnboarding() {
  const router = useRouter();
  const geo = useGeolocation();

  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [businessName, setBusinessName] = useState('');
  const [years, setYears] = useState('5');
  const [radiusKm, setRadiusKm] = useState('15');
  const [areaLat, setAreaLat] = useState<number | null>(null);
  const [areaLon, setAreaLon] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /* ── Searching the catalog, and proposing a trade it does not have ──── */
  const [search, setSearch] = useState('');
  const [proposals, setProposals] = useState<TradeProposal[]>([]);
  const [proposing, setProposing] = useState(false);
  const [proposalName, setProposalName] = useState('');
  const [proposalDesc, setProposalDesc] = useState('');
  const [proposalPrice, setProposalPrice] = useState('');
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposalNotice, setProposalNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const fresh = await apiFetch<ProfileResponse>('/api/provider/profile').catch(
        (caught: unknown) => {
          if (active) {
            setLoadError(
              caught instanceof ApiRequestError ? caught.message : 'לא הצלחנו לטעון את הפרטים',
            );
          }
          return null;
        },
      );
      if (!active) return;
      if (fresh) {
        setData(fresh);
        // Prefill from whatever is already configured, so this doubles as an
        // edit screen rather than only a first-run wizard.
        setCategorySlug(fresh.categorySlug);
        setBusinessName(fresh.profile?.business_name ?? '');
        setYears(String(fresh.profile?.years_experience ?? 5));
        setRadiusKm(String(Number(fresh.profile?.max_radius_km ?? 15)));
        setPrices(
          Object.fromEntries(
            fresh.services.map((s) => [s.slug, s.price_ils ? String(Number(s.price_ils)) : '']),
          ),
        );
        if (fresh.serviceArea) {
          setAreaLat(fresh.serviceArea.lat);
          setAreaLon(fresh.serviceArea.lon);
        }
      }
      // The provider's own proposals. Fetched separately because a failure
      // here must not cost them the setup screen.
      const mine = await apiFetch<{ proposals: TradeProposal[] }>(
        '/api/provider/trades',
      ).catch(() => null);
      if (active && mine) setProposals(mine.proposals);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const category = data?.catalog.categories.find((c) => c.slug === categorySlug) ?? null;
  const services = data?.catalog.services.filter((s) => s.category_slug === categorySlug) ?? [];
  const chosen = services.filter((s) => (prices[s.slug] ?? '').trim() !== '');

  /**
   * Search the catalog by the work, not by our category names.
   *
   * A provider thinks "מכונת כביסה", not "חשמל", so matching only category
   * titles would send them straight to the free-text form and fill the review
   * queue with things the catalog already covers. Services are searched too,
   * and a service hit shows which category it belongs to.
   */
  const searchHits = (() => {
    const query = search.trim();
    if (query.length < 2 || !data) return [];
    const hits: {
      categorySlug: string;
      categoryName: string;
      serviceSlug: string | null;
      serviceName: string | null;
    }[] = [];

    for (const c of data.catalog.categories) {
      if (c.name_he.includes(query)) {
        hits.push({ categorySlug: c.slug, categoryName: c.name_he, serviceSlug: null, serviceName: null });
      }
    }
    for (const service of data.catalog.services) {
      if (!service.name_he.includes(query)) continue;
      const parent = data.catalog.categories.find((c) => c.slug === service.category_slug);
      if (!parent) continue;
      hits.push({
        categorySlug: parent.slug,
        categoryName: parent.name_he,
        serviceSlug: service.slug,
        serviceName: service.name_he,
      });
    }
    return hits.slice(0, 6);
  })();

  // Not named use* on purpose: that prefix is reserved for hooks.
  const applyCurrentLocation = async () => {
    const fix = await geo.request();
    if (fix) {
      setAreaLat(fix.lat);
      setAreaLon(fix.lon);
    }
  };

  const ready =
    categorySlug !== null &&
    chosen.length > 0 &&
    areaLat !== null &&
    areaLon !== null &&
    Number(radiusKm) > 0;

  const submit = async () => {
    if (!ready || areaLat === null || areaLon === null) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/provider/setup', {
        method: 'PUT',
        json: {
          categorySlug,
          businessName: businessName.trim() || undefined,
          yearsExperience: Number(years) || 0,
          maxRadiusKm: Number(radiusKm),
          services: chosen.map((s) => ({
            serviceSlug: s.slug,
            priceIls: Number(prices[s.slug]),
          })),
          serviceArea: { lat: areaLat, lon: areaLon, radiusKm: Number(radiusKm) },
        },
      });
      setSaved(true);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : 'לא הצלחנו לשמור את הפרטים',
      );
    } finally {
      setSaving(false);
    }
  };

  const submitProposal = async () => {
    setProposalError(null);
    setProposalNotice(null);
    setProposalBusy(true);
    try {
      const price = proposalPrice.trim() === '' ? undefined : Number(proposalPrice);
      const result = await apiFetch<{ message: string }>('/api/provider/trades', {
        method: 'POST',
        json: {
          name: proposalName.trim(),
          description: proposalDesc.trim() || undefined,
          priceIls: price !== undefined && Number.isFinite(price) ? price : undefined,
          // The provider's guess helps whoever reviews it; it is not binding.
          suggestedCategorySlug: categorySlug ?? undefined,
        },
      });
      const mine = await apiFetch<{ proposals: TradeProposal[] }>('/api/provider/trades');
      setProposals(mine.proposals);
      setProposalName('');
      setProposalDesc('');
      setProposalPrice('');
      setProposing(false);
      setProposalNotice(result.message);
    } catch (caught) {
      setProposalError(
        caught instanceof ApiRequestError ? caught.message : 'לא הצלחנו לשלוח את הבקשה',
      );
    } finally {
      setProposalBusy(false);
    }
  };

  const withdrawProposal = async (id: string) => {
    setProposalError(null);
    setProposalBusy(true);
    try {
      await apiFetch(`/api/provider/trades?id=${id}`, { method: 'DELETE' });
      const mine = await apiFetch<{ proposals: TradeProposal[] }>('/api/provider/trades');
      setProposals(mine.proposals);
    } catch (caught) {
      setProposalError(
        caught instanceof ApiRequestError ? caught.message : 'לא הצלחנו לבטל את הבקשה',
      );
    } finally {
      setProposalBusy(false);
    }
  };

  if (loading) return <LoadingState label="טוען…" />;
  if (loadError && !data) return <ErrorState message={loadError} />;

  if (saved) {
    const verified = data?.profile?.verification === 'VERIFIED';
    return (
      <div className="space-y-5">
        <Logo />
        <Card className="border-ok/40">
          <h1 className="text-xl font-bold text-ink">הפרטים נשמרו</h1>
          {verified ? (
            <p className="mt-2 text-sm text-ink-2">
              החשבון מאומת ומוגדר. אפשר להתחיל משמרת ולקבל עבודות.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink-2">
                החשבון מוגדר ומחכה לאימות של מנהל. עד לאישור לא יישלחו אליך
                עבודות.
              </p>
              <p className="mt-3 text-xs text-ink-3">
                זה שלב מכוון: אנחנו מאמתים בעלי מקצוע לפני שהם מקבלים גישה
                ללקוחות.
              </p>
            </>
          )}
          <Button fullWidth className="mt-5" onClick={() => router.push('/provider')}>
            לאזור האישי
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <Logo />
        {data?.profile?.verification && (
          <Badge tone={data.profile.verification === 'VERIFIED' ? 'ok' : 'warn'}>
            {data.profile.verification === 'VERIFIED' ? 'מאומת' : 'ממתין לאימות'}
          </Badge>
        )}
      </header>

      <div>
        <h1 className="text-2xl font-black text-ink">
          {data?.isConfigured ? 'עדכון הפרטים שלך' : 'בוא נגדיר את הפרופיל'}
        </h1>
        <p className="mt-2 text-sm text-ink-2">
          בלי תחום ומחירים לא נוכל לשלוח לך עבודות — המערכת פשוט לא תכלול אותך
          בחיפוש.
        </p>
      </div>

      {/* ── 1. Trade ─────────────────────────────────────────────────── */}
      <Card>
        <h2 className="text-base font-bold text-ink">
          <span className="ltr-nums text-ink-3" dir="ltr">1</span> באיזה תחום אתה עובד?
        </h2>

        {/* Search across categories AND services, because a provider thinks
            in terms of the work they do ("מכונת כביסה"), not in terms of our
            seven category names. Finding an existing match is better for
            everyone than proposing a duplicate. */}
        <label htmlFor="trade-search" className="sr-only">חיפוש מקצוע</label>
        <input
          id="trade-search"
          className={`${inputClasses} mt-3`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="חפש את המקצוע שלך — למשל מזגן, אסלה, גינה…"
        />

        {searchHits.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <SectionLabel>נמצא בקטלוג</SectionLabel>
            {searchHits.map((hit) => (
              <button
                key={`${hit.categorySlug}-${hit.serviceSlug ?? 'cat'}`}
                type="button"
                onClick={() => {
                  setCategorySlug(hit.categorySlug);
                  const category = data?.catalog.categories.find((c) => c.slug === hit.categorySlug);
                  if (category) setRadiusKm(String(Number(category.default_radius_km)));
                  setSearch('');
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-bg px-3 py-2.5 text-start hover:border-brand"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">
                    {hit.serviceName ?? hit.categoryName}
                  </span>
                  {hit.serviceName && (
                    <span className="block text-xs text-ink-3">{hit.categoryName}</span>
                  )}
                </span>
                <span aria-hidden="true" className="shrink-0 text-ink-3">›</span>
              </button>
            ))}
          </div>
        )}

        {search.trim().length >= 2 && searchHits.length === 0 && (
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
            לא מצאנו את זה בקטלוג. אפשר להציע אותו למטה — נבדוק ונאשר.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {data?.catalog.categories.map((c) => (
            <button
              key={c.slug}
              type="button"
              aria-pressed={categorySlug === c.slug}
              onClick={() => {
                setCategorySlug(c.slug);
                setRadiusKm(String(Number(c.default_radius_km)));
              }}
              className={`inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-medium ${
                categorySlug === c.slug
                  ? 'border-brand bg-brand/10 text-ink'
                  : 'border-line-strong bg-bg text-ink-2 hover:border-brand'
              }`}
            >
              {c.name_he}
            </button>
          ))}
        </div>

        {category && (category.requires_license || category.requires_insurance) && (
          <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn-bright">
            התחום הזה דורש{' '}
            {[
              category.requires_license ? 'רישיון' : null,
              category.requires_insurance ? 'ביטוח' : null,
            ]
              .filter(Boolean)
              .join(' ו')}
            . המנהל יבקש את המסמכים לפני האימות.
          </p>
        )}

        {/* ── The catalog is not the world ────────────────────────────────
            Seven categories and twenty-three services do not cover the
            trades people actually do, and a provider whose work is missing
            has no way in at all: the candidate search requires a declared
            trade, so without one they are absent from every search. */}
        <div className="mt-4 border-t border-line pt-4">
          {!proposing ? (
            <button
              type="button"
              onClick={() => {
                setProposing(true);
                if (search.trim().length >= 2) setProposalName(search.trim());
              }}
              className="min-h-11 rounded-lg text-sm font-semibold text-brand-bright hover:bg-surface-2"
            >
              המקצוע שלי לא ברשימה — אני רוצה להוסיף אותו
            </button>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-bold text-ink">הוספת מקצוע חדש</p>
                <p className="mt-1 text-sm text-ink-2">
                  כתוב מה אתה עושה במילים שלך. נבדוק ונאשר, ורק אחרי האישור
                  תתחיל לקבל עבודות בו.
                </p>
              </div>

              <Field label="שם המקצוע" htmlFor="proposal-name">
                <input
                  id="proposal-name"
                  className={inputClasses}
                  value={proposalName}
                  maxLength={80}
                  onChange={(event) => setProposalName(event.target.value)}
                  placeholder="לדוגמה: תיקון מכונות כביסה"
                />
              </Field>

              <Field
                label="מה אתה עושה בפועל (לא חובה)"
                htmlFor="proposal-desc"
                hint="כמה מילים יעזרו לנו לאשר מהר ולנתב אליך את הלקוחות הנכונים"
              >
                <textarea
                  id="proposal-desc"
                  rows={3}
                  maxLength={500}
                  className={`${inputClasses} resize-none`}
                  value={proposalDesc}
                  onChange={(event) => setProposalDesc(event.target.value)}
                  placeholder="תיקון והתקנה של מכונות כביסה ומייבשים, כולל החלפת חלקים"
                />
              </Field>

              <Field label="המחיר שלך לעבודה כזו (לא חובה)" htmlFor="proposal-price">
                <input
                  id="proposal-price"
                  type="number"
                  min={0}
                  dir="ltr"
                  inputMode="numeric"
                  className={`${inputClasses} ltr-nums`}
                  value={proposalPrice}
                  onChange={(event) => setProposalPrice(event.target.value)}
                  placeholder="320"
                />
              </Field>

              {proposalError && (
                <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad-bright">
                  {proposalError}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="md"
                  loading={proposalBusy}
                  disabled={proposalName.trim().length < 2}
                  onClick={() => void submitProposal()}
                >
                  שלח לאישור
                </Button>
                <Button
                  size="md"
                  variant="quiet"
                  onClick={() => {
                    setProposing(false);
                    setProposalError(null);
                  }}
                >
                  ביטול
                </Button>
              </div>
            </div>
          )}

          {proposalNotice && (
            <p role="status" className="mt-3 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok-bright">
              {proposalNotice}
            </p>
          )}

          {proposals.length > 0 && (
            <div className="mt-4 space-y-2">
              <SectionLabel>המקצועות שהצעת</SectionLabel>
              {proposals.map((proposal) => (
                <div key={proposal.id} className="rounded-xl bg-surface-2 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{proposal.proposed_name}</p>
                      {proposal.price_ils && (
                        <p className="mt-0.5 text-xs text-ink-3">
                          <Money shekels={Number(proposal.price_ils)} />
                        </p>
                      )}
                    </div>
                    <Badge
                      tone={
                        proposal.status === 'APPROVED'
                          ? 'ok'
                          : proposal.status === 'REJECTED'
                            ? 'bad'
                            : 'warn'
                      }
                    >
                      {proposal.status === 'APPROVED'
                        ? 'אושר'
                        : proposal.status === 'REJECTED'
                          ? 'לא אושר'
                          : 'ממתין לאישור'}
                    </Badge>
                  </div>

                  {/* Said in plain words, because the opposite belief — that
                      submitting was enough — is the expensive one. */}
                  {proposal.status === 'PENDING' && (
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-xs text-ink-3">
                        עדיין לא יישלחו לך עבודות במקצוע הזה.
                      </p>
                      <button
                        type="button"
                        onClick={() => void withdrawProposal(proposal.id)}
                        disabled={proposalBusy}
                        className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-medium text-ink-3 hover:text-bad-bright"
                      >
                        בטל בקשה
                      </button>
                    </div>
                  )}
                  {proposal.status === 'APPROVED' && proposal.resolved_category_name && (
                    <p className="mt-2 text-xs text-ok-bright">
                      נוסף תחת {proposal.resolved_category_name} — אתה יכול לקבל עבודות בו.
                    </p>
                  )}
                  {proposal.status === 'REJECTED' && proposal.review_note && (
                    <p className="mt-2 text-xs text-ink-2">{proposal.review_note}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ── 2. Services and prices ───────────────────────────────────── */}
      {categorySlug && (
        <Card>
          <h2 className="text-base font-bold text-ink">
            <span className="ltr-nums text-ink-3" dir="ltr">2</span> מה אתה עושה, ובכמה?
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            סמן רק מה שאתה מבצע. המחיר שתזין הוא המחיר שיוצג ללקוח.
          </p>

          <div className="mt-4 space-y-3">
            {services.map((s) => {
              const active = (prices[s.slug] ?? '').trim() !== '';
              const guide = s.base_price_ils ? Number(s.base_price_ils) : null;
              return (
                <div
                  key={s.slug}
                  className={`rounded-xl border p-3 ${
                    active ? 'border-brand/50 bg-bg' : 'border-line bg-bg'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={`price-${s.slug}`} className="text-sm font-medium text-ink">
                      {s.name_he}
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink-2">₪</span>
                      <input
                        id={`price-${s.slug}`}
                        type="number"
                        min={0}
                        dir="ltr"
                        inputMode="numeric"
                        placeholder={guide ? String(guide) : '—'}
                        value={prices[s.slug] ?? ''}
                        onChange={(event) =>
                          setPrices((current) => ({ ...current, [s.slug]: event.target.value }))
                        }
                        className="ltr-nums w-24 rounded-lg border border-line-strong bg-surface-1 px-3 py-2 text-ink"
                      />
                    </div>
                  </div>
                  {guide !== null && (
                    <p className="mt-1.5 text-xs text-ink-3">
                      מחיר ייחוס בפלטפורמה: <Money shekels={guide} />
                      {s.min_price_ils && s.max_price_ils && (
                        <>
                          {' · טווח מקובל '}
                          <Money shekels={Number(s.min_price_ils)} />
                          {'–'}
                          <Money shekels={Number(s.max_price_ils)} />
                        </>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {chosen.length > 0 && (
            <p className="mt-3 text-sm text-ok-bright">
              נבחרו <span className="ltr-nums" dir="ltr">{chosen.length}</span> שירותים
            </p>
          )}
        </Card>
      )}

      {/* ── 3. Where ─────────────────────────────────────────────────── */}
      {categorySlug && (
        <Card>
          <h2 className="text-base font-bold text-ink">
            <span className="ltr-nums text-ink-3" dir="ltr">3</span> איפה אתה עובד?
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            נשלח לך עבודות רק בתוך הרדיוס הזה.
          </p>

          <div className="mt-4">
            {areaLat !== null && areaLon !== null ? (
              <p className="flex items-center gap-2 text-sm text-ok-bright">
                <span aria-hidden="true">📍</span> מרכז אזור העבודה נקבע
              </p>
            ) : (
              <p className="text-sm text-ink-2">עדיין לא נקבע מרכז לאזור העבודה.</p>
            )}

            {geo.message && (
              <p className="mt-2 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn-bright">
                {geo.message}
              </p>
            )}

            <Button
              variant="secondary"
              size="md"
              className="mt-3"
              loading={geo.status === 'requesting'}
              onClick={() => void applyCurrentLocation()}
            >
              השתמש במיקום הנוכחי שלי
            </Button>
          </div>

          <div className="mt-4">
            <Field label="רדיוס עבודה (ק״מ)" htmlFor="radius">
              <input
                id="radius"
                type="number"
                min={1}
                max={200}
                dir="ltr"
                inputMode="numeric"
                value={radiusKm}
                onChange={(event) => setRadiusKm(event.target.value)}
                className={`${inputClasses} ltr-nums`}
              />
            </Field>
          </div>
        </Card>
      )}

      {/* ── 4. About ─────────────────────────────────────────────────── */}
      {categorySlug && (
        <Card>
          <h2 className="text-base font-bold text-ink">
            <span className="ltr-nums text-ink-3" dir="ltr">4</span> פרטי העסק
          </h2>
          <div className="mt-4 space-y-4">
            <Field label="שם העסק (אופציונלי)" htmlFor="business">
              <input
                id="business"
                className={inputClasses}
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="לדוגמה: אינסטלציה מהירה תל אביב"
              />
            </Field>
            <Field label="שנות ניסיון" htmlFor="years">
              <input
                id="years"
                type="number"
                min={0}
                max={70}
                dir="ltr"
                inputMode="numeric"
                value={years}
                onChange={(event) => setYears(event.target.value)}
                className={`${inputClasses} ltr-nums`}
              />
            </Field>
          </div>
        </Card>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad-bright">
          {error}
        </p>
      )}

      <div className="space-y-3">
        <Button size="xl" fullWidth loading={saving} disabled={!ready} onClick={submit}>
          שמור והמשך
        </Button>
        {!ready && (
          <p className="text-center text-sm text-ink-3">
            {categorySlug === null
              ? 'בחר תחום כדי להמשיך'
              : chosen.length === 0
                ? 'הזן מחיר לפחות לשירות אחד'
                : 'קבע את מרכז אזור העבודה'}
          </p>
        )}
      </div>
    </div>
  );
}
