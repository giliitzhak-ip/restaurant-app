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
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const category = data?.catalog.categories.find((c) => c.slug === categorySlug) ?? null;
  const services = data?.catalog.services.filter((s) => s.category_slug === categorySlug) ?? [];
  const chosen = services.filter((s) => (prices[s.slug] ?? '').trim() !== '');

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

  if (loading) return <LoadingState label="טוען…" />;
  if (loadError && !data) return <ErrorState message={loadError} />;

  if (saved) {
    const verified = data?.profile?.verification === 'VERIFIED';
    return (
      <div className="space-y-5">
        <Logo />
        <Card className="border-success-500/40">
          <h1 className="text-xl font-bold text-white">הפרטים נשמרו</h1>
          {verified ? (
            <p className="mt-2 text-sm text-slate-300">
              החשבון מאומת ומוגדר. אפשר להתחיל משמרת ולקבל עבודות.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-300">
                החשבון מוגדר ומחכה לאימות של מנהל. עד לאישור לא יישלחו אליך
                עבודות.
              </p>
              <p className="mt-3 text-xs text-slate-500">
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
          <Badge tone={data.profile.verification === 'VERIFIED' ? 'success' : 'warning'}>
            {data.profile.verification === 'VERIFIED' ? 'מאומת' : 'ממתין לאימות'}
          </Badge>
        )}
      </header>

      <div>
        <h1 className="text-2xl font-black text-white">
          {data?.isConfigured ? 'עדכון הפרטים שלך' : 'בוא נגדיר את הפרופיל'}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          בלי תחום ומחירים לא נוכל לשלוח לך עבודות — המערכת פשוט לא תכלול אותך
          בחיפוש.
        </p>
      </div>

      {/* ── 1. Trade ─────────────────────────────────────────────────── */}
      <Card>
        <h2 className="text-base font-bold text-white">
          <span className="ltr-nums text-slate-500" dir="ltr">1</span> באיזה תחום אתה עובד?
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
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
                  ? 'border-accent-500 bg-accent-500/10 text-white'
                  : 'border-navy-600 bg-navy-950 text-slate-300 hover:border-accent-500'
              }`}
            >
              {c.name_he}
            </button>
          ))}
        </div>

        {category && (category.requires_license || category.requires_insurance) && (
          <p className="mt-3 rounded-xl bg-warning-500/10 px-3 py-2 text-sm text-warning-400">
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
      </Card>

      {/* ── 2. Services and prices ───────────────────────────────────── */}
      {categorySlug && (
        <Card>
          <h2 className="text-base font-bold text-white">
            <span className="ltr-nums text-slate-500" dir="ltr">2</span> מה אתה עושה, ובכמה?
          </h2>
          <p className="mt-1 text-sm text-slate-400">
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
                    active ? 'border-accent-500/50 bg-navy-950' : 'border-navy-700 bg-navy-950'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={`price-${s.slug}`} className="text-sm font-medium text-white">
                      {s.name_he}
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-400">₪</span>
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
                        className="ltr-nums w-24 rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-white"
                      />
                    </div>
                  </div>
                  {guide !== null && (
                    <p className="mt-1.5 text-xs text-slate-500">
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
            <p className="mt-3 text-sm text-success-400">
              נבחרו <span className="ltr-nums" dir="ltr">{chosen.length}</span> שירותים
            </p>
          )}
        </Card>
      )}

      {/* ── 3. Where ─────────────────────────────────────────────────── */}
      {categorySlug && (
        <Card>
          <h2 className="text-base font-bold text-white">
            <span className="ltr-nums text-slate-500" dir="ltr">3</span> איפה אתה עובד?
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            נשלח לך עבודות רק בתוך הרדיוס הזה.
          </p>

          <div className="mt-4">
            {areaLat !== null && areaLon !== null ? (
              <p className="flex items-center gap-2 text-sm text-success-400">
                <span aria-hidden="true">📍</span> מרכז אזור העבודה נקבע
              </p>
            ) : (
              <p className="text-sm text-slate-400">עדיין לא נקבע מרכז לאזור העבודה.</p>
            )}

            {geo.message && (
              <p className="mt-2 rounded-xl bg-warning-500/10 px-3 py-2 text-sm text-warning-400">
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
          <h2 className="text-base font-bold text-white">
            <span className="ltr-nums text-slate-500" dir="ltr">4</span> פרטי העסק
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
        <p role="alert" className="rounded-xl bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
          {error}
        </p>
      )}

      <div className="space-y-3">
        <Button size="xl" fullWidth loading={saving} disabled={!ready} onClick={submit}>
          שמור והמשך
        </Button>
        {!ready && (
          <p className="text-center text-sm text-slate-500">
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
