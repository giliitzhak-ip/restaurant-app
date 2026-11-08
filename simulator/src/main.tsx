import { useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Crosshair,
  MapPin,
  RotateCcw,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';

// ── Real application code — nothing below is re-implemented ────────────────
import { calculateFee, customerPriceBreakdown, providerPriceBreakdown } from '@/lib/services/fees';
import { canActorTransition, JOB_FLOW, TIMELINE_ORDER } from '@/lib/services/jobs/workflow';
import { normaliseWeights } from '@/lib/services/matching/engine';
import { KeywordJobClassifier } from '@/lib/services/ai/job-classifier';
import { SETTINGS_DEFAULTS } from '@/lib/services/settings/defaults';
import type { MatchWeights, PlatformFeeRules } from '@/lib/services/settings/schema';
import { FALLBACK_CATEGORIES, FALLBACK_SERVICES } from '@/lib/services/catalogue/fallback';
import { estimateEtaMinutes, haversineKm, type LatLng } from '@/lib/utils/geo';
import { formatDistance, formatEta, formatPercent, formatPrice } from '@/lib/utils/format';
import { getDictionary } from '@/lib/i18n';
import type { ActorType, JobStatus, JobUrgency } from '@/types/database';
import type { ScoredCandidate } from '@/lib/services/matching/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { OfferCard } from '@/components/ui/offer-card';
import { Price, PriceBreakdown } from '@/components/ui/price';
import { Rating } from '@/components/ui/rating';
import { StatusBadge } from '@/components/ui/status-badge';
import { Timeline, type TimelineEntry } from '@/components/ui/timeline';
import { cn } from '@/lib/utils';

import { runDiscovery, rerank } from './engine';
import { MAP_BOUNDS, PROVIDERS, providerById, type SimProvider } from './world';

const t = getDictionary('he');
const classifier = new KeywordJobClassifier();

/* ── Engine log ───────────────────────────────────────────────────────────── */

type LogKind = 'call' | 'result' | 'note' | 'deny';

interface LogEntry {
  id: number;
  kind: LogKind;
  text: string;
}

let logCounter = 0;

/* ── Deterministic jitter, so re-runs are reproducible ────────────────────── */

function seeded(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

const URGENCY_MULTIPLIER: Record<JobUrgency, number> = {
  now: 1.25,
  today: 1.1,
  tomorrow: 1,
  scheduled: 0.95,
};

interface SimOffer {
  providerId: string;
  price: number;
  etaMinutes: number;
  distanceKm: number;
  note: string | null;
  score: number;
  /** Fixed when the offer is built, so rendering stays pure. */
  createdAt: string;
  validUntil: string;
}

const NOTES = [
  'המחיר כולל חומרים וחשבונית.',
  'אפשר להגיע כבר היום אחר הצהריים.',
  'המחיר לביקור ואבחון; אם נדרש חלק חילוף נעדכן מראש.',
  'אחריות שנה על העבודה.',
  null,
];

function buildOffers(shortlist: ScoredCandidate[], urgency: JobUrgency, jobId: string): SimOffer[] {
  return shortlist
    .filter((entry) => {
      const provider = providerById(entry.candidate.providerId);
      return provider ? seeded(`${jobId}:${provider.id}:quote`) <= provider.quoteRate : false;
    })
    .map((entry) => {
      const { candidate } = entry;
      const base = candidate.basePrice ?? 300;
      const jitter = 0.85 + seeded(`${jobId}:${candidate.providerId}:price`) * 0.4;
      const price = Math.round((base * URGENCY_MULTIPLIER[urgency] * jitter) / 10) * 10;
      const travel = estimateEtaMinutes(candidate.distanceKm);
      const lag = Math.round((candidate.avgResponseSeconds ?? 600) / 60);

      const now = Date.now();

      return {
        providerId: candidate.providerId,
        price: Math.max(80, price),
        etaMinutes: travel + lag,
        distanceKm: candidate.distanceKm,
        note: NOTES[Math.floor(seeded(`${jobId}:${candidate.providerId}:note`) * NOTES.length)],
        score: entry.score,
        createdAt: new Date(now).toISOString(),
        validUntil: new Date(now + 2 * 3600_000).toISOString(),
      };
    })
    .sort((a, b) => a.price - b.price);
}

/* ── Schematic map ────────────────────────────────────────────────────────── */

const MAP_W = 100;
const MAP_H = 100;

function project(point: LatLng) {
  return {
    x: ((point.lng - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * MAP_W,
    y: ((MAP_BOUNDS.north - point.lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * MAP_H,
  };
}

function unproject(x: number, y: number): LatLng {
  return {
    lng: MAP_BOUNDS.west + (x / MAP_W) * (MAP_BOUNDS.east - MAP_BOUNDS.west),
    lat: MAP_BOUNDS.north - (y / MAP_H) * (MAP_BOUNDS.north - MAP_BOUNDS.south),
  };
}

/** Horizontal map units per kilometre, for drawing the radius rings. */
const UNITS_PER_KM =
  MAP_W /
  haversineKm(
    { lat: 32.0853, lng: MAP_BOUNDS.west },
    { lat: 32.0853, lng: MAP_BOUNDS.east },
  );

interface WorldMapProps {
  jobLocation: LatLng | null;
  categorySlug: string | null;
  onPick: (location: LatLng) => void;
  radiusKm?: number | null;
  shortlistIds?: string[];
  highlightId?: string | null;
}

function WorldMap({
  jobLocation,
  categorySlug,
  onPick,
  radiusKm,
  shortlistIds = [],
  highlightId,
}: WorldMapProps) {
  const relevant = (provider: SimProvider) =>
    !categorySlug || provider.categorySlugs.includes(categorySlug);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="block aspect-square w-full cursor-crosshair touch-none bg-secondary"
        role="application"
        aria-label="מפת הסימולטור — לחץ כדי למקם את העבודה"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * MAP_W;
          const y = ((event.clientY - rect.top) / rect.height) * MAP_H;
          onPick(unproject(x, y));
        }}
      >
        <defs>
          <pattern id="grid" width="6.25" height="6.25" patternUnits="userSpaceOnUse">
            <path d="M 6.25 0 L 0 0 0 6.25" fill="none" stroke="currentColor" strokeWidth="0.15" className="text-border" />
          </pattern>
        </defs>
        <rect width={MAP_W} height={MAP_H} fill="url(#grid)" />

        {/* Radius rings for the step the engine settled on */}
        {jobLocation && radiusKm
          ? [5, 10, 20]
              .filter((step) => step <= radiusKm)
              .map((step) => {
                const centre = project(jobLocation);
                return (
                  <circle
                    key={step}
                    cx={centre.x}
                    cy={centre.y}
                    r={step * UNITS_PER_KM}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.3"
                    strokeDasharray="1.2 1"
                    className={step === radiusKm ? 'text-accent' : 'text-accent/35'}
                  />
                );
              })
          : null}

        {/* Providers */}
        {PROVIDERS.map((provider) => {
          const { x, y } = project(provider.home);
          const dim = !relevant(provider);
          const inShortlist = shortlistIds.includes(provider.id);
          const isHighlight = highlightId === provider.id;

          return (
            <g key={provider.id} opacity={dim ? 0.25 : 1}>
              <circle
                cx={x}
                cy={y}
                r={isHighlight ? 2.6 : inShortlist ? 2.1 : 1.5}
                className={cn(
                  isHighlight
                    ? 'fill-accent'
                    : inShortlist
                      ? 'fill-success'
                      : provider.isVerified
                        ? 'fill-foreground/55'
                        : 'fill-destructive/60',
                )}
              />
              {provider.isAvailable ? (
                <circle cx={x} cy={y} r={0.6} className="fill-background" />
              ) : null}
              <title>
                {provider.businessName}
                {provider.isVerified ? '' : ' — לא מאומת'}
                {provider.isAvailable ? '' : ' — לא זמין'}
              </title>
            </g>
          );
        })}

        {/* The job */}
        {jobLocation ? (
          (() => {
            const { x, y } = project(jobLocation);
            return (
              <g>
                <circle cx={x} cy={y} r="3.4" className="fill-accent/20" />
                <path
                  d={`M ${x} ${y - 3.4} L ${x + 1.5} ${y} L ${x} ${y + 1.2} L ${x - 1.5} ${y} Z`}
                  className="fill-accent"
                />
              </g>
            );
          })()
        ) : null}
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t p-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-accent" />
          מיקום העבודה
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-success" />
          נבחר לשידור
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-foreground/55" />
          בעל מקצוע
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-destructive/60" />
          לא מאומת
        </span>
      </div>
    </div>
  );
}

/* ── Score breakdown ──────────────────────────────────────────────────────── */

const WEIGHT_LABELS: Record<keyof MatchWeights, string> = {
  distance: 'מרחק',
  rating: 'דירוג',
  availability: 'זמינות',
  category_match: 'התאמת מקצוע',
  response_speed: 'מהירות תגובה',
  completed_jobs: 'ותק',
};

function ScoreBreakdown({ entry, weights }: { entry: ScoredCandidate; weights: MatchWeights }) {
  const { breakdown } = entry;
  const rows: Array<[keyof MatchWeights, number]> = [
    ['distance', breakdown.distance],
    ['rating', breakdown.rating],
    ['availability', breakdown.availability],
    ['category_match', breakdown.categoryMatch],
    ['response_speed', breakdown.responseSpeed],
    ['completed_jobs', breakdown.completedJobs],
  ];

  const modifiers = Object.entries(breakdown.modifiers).filter(([, value]) => value !== 0);
  const modifierLabel: Record<string, string> = {
    favorite: 'מועדף',
    serviceArea: 'אזור שירות מוצהר',
    priceFit: 'התאמה לתקציב',
    reliability: 'היסטוריית ביטולים',
  };

  return (
    <div className="space-y-1.5">
      {rows.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2 text-[11px]">
          <span className="w-24 shrink-0 text-muted-foreground">{WEIGHT_LABELS[key]}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${Math.round(value * 100)}%` }}
            />
          </span>
          <span className="num w-20 shrink-0 text-end tabular-nums text-muted-foreground">
            {value.toFixed(2)} × {formatPercent(weights[key])}
          </span>
        </div>
      ))}

      {modifiers.length ? (
        <div className="flex flex-wrap gap-1 pt-1">
          {modifiers.map(([key, value]) => (
            <Badge key={key} variant={value > 0 ? 'success' : 'destructive'}>
              {modifierLabel[key] ?? key} {value > 0 ? '+' : '−'}
              <span className="num">{Math.abs(value).toFixed(3)}</span>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── The simulator ────────────────────────────────────────────────────────── */

type Stage = 'brief' | 'matching' | 'offers' | 'job' | 'review';

export function Simulator() {
  const [stage, setStage] = useState<Stage>('brief');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);

  // Brief
  const [freeText, setFreeText] = useState('');
  const [categorySlug, setCategorySlug] = useState('plumbing');
  const [serviceSlug, setServiceSlug] = useState<string | null>(null);
  const [urgency, setUrgency] = useState<JobUrgency>('now');
  const [budgetMax, setBudgetMax] = useState('800');
  const [jobLocation, setJobLocation] = useState<LatLng | null>({ lat: 32.0853, lng: 34.7818 });
  const [suggestion, setSuggestion] = useState<string | null>(null);

  // Settings the admin would own
  const [weights, setWeights] = useState<MatchWeights>(SETTINGS_DEFAULTS.match_weights);
  const [feeRules, setFeeRules] = useState<PlatformFeeRules>(SETTINGS_DEFAULTS.platform_fee_rules);
  const [showSettings, setShowSettings] = useState(false);

  // Run state
  const [jobId, setJobId] = useState('job-1');
  const [discovery, setDiscovery] = useState<ReturnType<typeof runDiscovery> | null>(null);
  const [offers, setOffers] = useState<SimOffer[]>([]);
  const [acceptedProviderId, setAcceptedProviderId] = useState<string | null>(null);
  const [agreedPrice, setAgreedPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<JobStatus>('requested');
  const [actor, setActor] = useState<ActorType>('provider');
  const [history, setHistory] = useState<Array<{ status: JobStatus; at: string }>>([]);
  const [captured, setCaptured] = useState(false);
  const [rating, setRating] = useState(0);

  const categories = FALLBACK_CATEGORIES;
  const services = useMemo(
    () => FALLBACK_SERVICES.filter((service) => service.category_id === categories.find((c) => c.slug === categorySlug)?.id),
    [categories, categorySlug],
  );

  const addLog = useCallback((kind: LogKind, text: string) => {
    logCounter += 1;
    setLog((current) => [...current, { id: logCounter, kind, text }]);
  }, []);

  /* ── Classify free text with the real classifier ────────────────────── */
  const classify = useCallback(async () => {
    if (freeText.trim().length < 4) return;

    addLog('call', `AIJobClassifier.classify("${freeText.trim().slice(0, 48)}…")`);
    const result = await classifier.classify({
      text: freeText,
      categorySlugs: categories.map((category) => category.slug),
      serviceSlugs: Object.fromEntries(
        categories.map((category) => [
          category.slug,
          FALLBACK_SERVICES.filter((service) => service.category_id === category.id).map((s) => s.slug),
        ]),
      ),
    });

    if (!result.categorySlug) {
      addLog('result', 'לא זוהתה קטגוריה (confidence 0) — הבחירה נשארת שלך');
      setSuggestion(null);
      return;
    }

    const category = categories.find((entry) => entry.slug === result.categorySlug);
    const service = FALLBACK_SERVICES.find((entry) => entry.slug === result.serviceSlug);

    addLog(
      'result',
      `→ ${result.categorySlug}${result.serviceSlug ? ` / ${result.serviceSlug}` : ''} · urgency=${result.urgency} · confidence=${result.confidence}`,
    );

    setCategorySlug(result.categorySlug);
    setServiceSlug(result.serviceSlug);
    setUrgency(result.urgency);
    setSuggestion(
      `${category?.name ?? result.categorySlug}${service ? ` · ${service.name}` : ''} · ${t.job.urgencyLabel[result.urgency]}`,
    );
  }, [addLog, categories, freeText]);

  /* ── Discovery ──────────────────────────────────────────────────────── */
  const matchContext = useMemo(
    () => ({
      categoryId: categorySlug,
      serviceId: serviceSlug,
      urgency,
      budgetMin: null,
      budgetMax: budgetMax ? Number(budgetMax) : null,
      favoriteProviderIds: [] as string[],
    }),
    [categorySlug, serviceSlug, urgency, budgetMax],
  );

  const submitJob = useCallback(() => {
    if (!jobLocation) return;

    const id = `job-${Date.now()}`;
    setJobId(id);
    setStatus('requested');
    setHistory([{ status: 'requested', at: new Date().toISOString() }]);
    setCaptured(false);
    setRating(0);
    setAcceptedProviderId(null);
    setAgreedPrice(null);

    addLog('note', '── בקשה חדשה ──');
    addLog('call', `POST /api/jobs { category: "${categorySlug}", urgency: "${urgency}" }`);

    const normalised = normaliseWeights(weights);
    if (normalised !== weights) addLog('note', 'normaliseWeights(): המשקלים לא הסתכמו ל-100% ונורמלו');

    const run = runDiscovery({
      categorySlug,
      serviceSlug,
      location: jobLocation,
      context: matchContext,
      weights: normalised,
      matching: SETTINGS_DEFAULTS.matching,
    });

    for (const step of run.steps) {
      addLog('call', `find_nearby_providers(radius_km=${step.radiusKm}) → ${step.poolSize} מועמדים`);
      addLog(
        step.enough ? 'result' : 'note',
        step.enough
          ? `rankCandidates() → ${step.shortlistSize} ברשימה (מינימום ${SETTINGS_DEFAULTS.matching.minimum_providers}) ✓`
          : `rankCandidates() → ${step.shortlistSize} בלבד — מרחיב רדיוס`,
      );
    }

    if (run.exhausted && run.shortlist.length === 0) {
      addLog('deny', 'כל שלבי הרדיוס מוצו ללא התאמות');
    }

    for (const entry of run.shortlist) {
      addLog('result', `  ${entry.candidate.businessName} → score ${entry.score}`);
    }

    setDiscovery(run);
    setStatus('searching');
    setHistory((current) => [...current, { status: 'searching', at: new Date().toISOString() }]);
    setStage('matching');
  }, [addLog, categorySlug, jobLocation, matchContext, serviceSlug, urgency, weights]);

  /* ── Weight changes re-rank live ────────────────────────────────────── */
  const applyWeights = useCallback(
    (next: MatchWeights) => {
      setWeights(next);
      if (!discovery || !jobLocation) return;

      const ranked = rerank({
        categorySlug,
        serviceSlug,
        location: jobLocation,
        context: matchContext,
        weights: normaliseWeights(next),
        matching: SETTINGS_DEFAULTS.matching,
        radiusKm: discovery.radiusKm,
      });
      setDiscovery({ ...discovery, shortlist: ranked });
    },
    [categorySlug, discovery, jobLocation, matchContext, serviceSlug],
  );

  const broadcast = useCallback(() => {
    if (!discovery) return;
    addLog('call', `job_assignments ← ${discovery.shortlist.length} שורות (זה מה שפותח להם גישה לעבודה)`);

    const generated = buildOffers(discovery.shortlist, urgency, jobId);
    addLog('result', `${generated.length} בעלי מקצוע שלחו הצעה`);
    setOffers(generated);

    const next: JobStatus = generated.length ? 'offers_received' : 'searching';
    if (generated.length) {
      setStatus(next);
      setHistory((current) => [...current, { status: next, at: new Date().toISOString() }]);
    }
    setStage('offers');
  }, [addLog, discovery, jobId, urgency]);

  /* ── Accept an offer: the real fee split ────────────────────────────── */
  const breakdown = useMemo(() => {
    if (agreedPrice === null) return null;
    return calculateFee(agreedPrice, feeRules, {
      categorySlug,
      providerId: acceptedProviderId ?? undefined,
    });
  }, [acceptedProviderId, agreedPrice, categorySlug, feeRules]);

  const acceptOffer = useCallback(
    (offer: SimOffer) => {
      addLog('call', `POST /api/offers/${offer.providerId}/accept`);
      const split = calculateFee(offer.price, feeRules, { categorySlug, providerId: offer.providerId });
      addLog(
        'result',
        `calculateFee(${offer.price}) → כלל «${split.rule.label}» ${formatPercent(split.rule.percentage)} · עמלה ${formatPrice(split.platformFee)} · נטו ${formatPrice(split.providerPayout)}`,
      );
      addLog('call', 'PaymentAdapter.authorize() → התשלום נתפס, לא נגבה');

      setAcceptedProviderId(offer.providerId);
      setAgreedPrice(offer.price);
      setStatus('provider_selected');
      setHistory((current) => [...current, { status: 'provider_selected', at: new Date().toISOString() }]);
      setStage('job');
    },
    [addLog, categorySlug, feeRules],
  );

  /* ── State machine ──────────────────────────────────────────────────── */
  const attempt = useCallback(
    (next: JobStatus) => {
      const allowed = canActorTransition(status, next, actor);
      addLog(
        allowed ? 'call' : 'deny',
        `canActorTransition("${status}", "${next}", "${actor}") → ${allowed}`,
      );
      if (!allowed) return;

      if (next === 'completed') {
        addLog('call', 'PaymentAdapter.capture() → התשלום נגבה');
        if (breakdown) {
          addLog('result', `platform_fees ← ${formatPrice(breakdown.platformFee)}`);
        }
        setCaptured(true);
      }

      setStatus(next);
      setHistory((current) => [...current, { status: next, at: new Date().toISOString() }]);
      if (next === 'completed') setStage('review');
    },
    [actor, addLog, breakdown, status],
  );

  const reset = useCallback(() => {
    setStage('brief');
    setDiscovery(null);
    setOffers([]);
    setAcceptedProviderId(null);
    setAgreedPrice(null);
    setStatus('requested');
    setHistory([]);
    setCaptured(false);
    setRating(0);
    setSuggestion(null);
    setFreeText('');
    addLog('note', '── אופס ──');
  }, [addLog]);

  /* ── Derived ────────────────────────────────────────────────────────── */
  const acceptedProvider = acceptedProviderId ? providerById(acceptedProviderId) : null;
  const acceptedOffer = offers.find((offer) => offer.providerId === acceptedProviderId) ?? null;

  const timelineEntries: TimelineEntry[] = useMemo(() => {
    const reached = new Map(history.map((entry) => [entry.status, entry.at]));
    if (status === 'cancelled') {
      return history.map((entry, index) => ({
        id: `${entry.status}-${index}`,
        label: t.job.statusLabel[entry.status],
        at: entry.at,
        state: index === history.length - 1 ? 'current' : 'done',
      }));
    }
    const currentIndex = TIMELINE_ORDER.indexOf(status);
    return TIMELINE_ORDER.map((step, index) => ({
      id: step,
      label: t.job.statusLabel[step],
      at: reached.get(step) ?? null,
      state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
    }));
  }, [history, status]);

  const nextStatuses = JOB_FLOW[status] ?? [];

  return (
    <div className="min-h-dvh bg-brand-surface" dir="rtl" lang="he">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="container-wide flex h-14 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span dir="ltr" className="text-base font-black tracking-[0.18em]">
              GET<span className="text-accent">SERVICE</span>
            </span>
            <Badge variant="accent">סימולטור</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setShowSettings((value) => !value)}>
              הגדרות
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowLog((value) => !value)}>
              <Terminal aria-hidden />
              יומן
              {log.length ? <span className="num">({log.length})</span> : null}
            </Button>
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw aria-hidden />
              אפס
            </Button>
          </div>
        </div>
      </header>

      <div className="container-wide grid gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0 space-y-5">
          {/* Intro */}
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm">
            <p className="font-semibold">זה לא מוקאפ.</p>
            <p className="mt-1 text-muted-foreground">
              הדירוג, חישוב העמלה, מכונת המצבים וסיווג הטקסט החופשי מגיעים מאותם קבצים שרצים
              באפליקציה. מה שמדומה כאן: 15 בעלי מקצוע, והשאילתה הגיאוגרפית ש-PostGIS מריץ במסד.
              פתח את <b>היומן</b> כדי לראות איזו פונקציה רצה בכל לחיצה.
            </p>
          </div>

          {/* ── Stage: brief ──────────────────────────────────────────── */}
          {stage === 'brief' ? (
            <Card>
              <CardHeader>
                <CardTitle>1 · פתיחת בקשה</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field
                  label="תאר את התקלה במילים שלך"
                  htmlFor="freeText"
                  hint="היציאה מהשדה מריצה את KeywordJobClassifier — נסה «יש נזילה מתחת לכיור, דחוף»"
                >
                  <Textarea
                    id="freeText"
                    rows={2}
                    value={freeText}
                    onChange={(event) => setFreeText(event.target.value)}
                    onBlur={classify}
                    placeholder="יש נזילה מתחת לכיור, דחוף"
                  />
                </Field>

                {suggestion ? (
                  <p className="flex items-center gap-2 rounded-lg bg-accent/5 p-3 text-sm">
                    <Sparkles className="size-4 text-accent" aria-hidden />
                    <span className="font-medium">הסיווג זיהה:</span>
                    <Badge variant="accent">{suggestion}</Badge>
                  </p>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="קטגוריה" htmlFor="category">
                    <Select
                      id="category"
                      value={categorySlug}
                      onChange={(event) => {
                        setCategorySlug(event.target.value);
                        setServiceSlug(null);
                      }}
                    >
                      {categories.map((category) => (
                        <option key={category.id} value={category.slug}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="שירות" htmlFor="service" hint="משפיע על רכיב «התאמת מקצוע»">
                    <Select
                      id="service"
                      value={serviceSlug ?? ''}
                      onChange={(event) => setServiceSlug(event.target.value || null)}
                    >
                      <option value="">כל שירות בקטגוריה</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.slug}>
                          {service.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <fieldset>
                  <legend className="mb-2 text-sm font-medium">דחיפות</legend>
                  <div className="grid grid-cols-4 gap-2">
                    {(['now', 'today', 'tomorrow', 'scheduled'] as JobUrgency[]).map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={urgency === value}
                        onClick={() => setUrgency(value)}
                        className={cn(
                          'rounded-lg border p-2.5 text-xs font-medium transition-colors',
                          urgency === value ? 'border-accent bg-accent/5 text-accent' : 'hover:bg-secondary',
                        )}
                      >
                        {t.job.urgencyLabel[value]}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    «עכשיו» מאפס את ציון הזמינות של מי שלא דלוק — נסה ותראה את הדירוג משתנה.
                  </p>
                </fieldset>

                <Field label="תקציב מקסימלי" htmlFor="budget" hint="משפיע על מתאם «התאמה לתקציב»">
                  <Input
                    id="budget"
                    type="number"
                    dir="ltr"
                    value={budgetMax}
                    onChange={(event) => setBudgetMax(event.target.value)}
                  />
                </Field>

                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                    <Crosshair className="size-4" aria-hidden />
                    לחץ על המפה כדי למקם את העבודה
                  </p>
                  <WorldMap
                    jobLocation={jobLocation}
                    categorySlug={categorySlug}
                    onPick={(location) => {
                      setJobLocation(location);
                      addLog('note', `מיקום העבודה: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
                    }}
                  />
                </div>

                <Button size="full" variant="accent" onClick={submitJob} disabled={!jobLocation}>
                  שלח בקשה והרץ התאמה
                  <ArrowLeft aria-hidden />
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* ── Stage: matching ───────────────────────────────────────── */}
          {stage === 'matching' && discovery ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>2 · הרחבת רדיוס</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ol className="space-y-2">
                    {discovery.steps.map((step) => (
                      <li
                        key={step.radiusKm}
                        className={cn(
                          'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3 text-sm',
                          step.enough ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5',
                        )}
                      >
                        <span className="num font-bold">{step.radiusKm} ק״מ</span>
                        <span className="text-muted-foreground">
                          מאגר: <span className="num">{step.poolSize}</span> · אחרי דירוג:{' '}
                          <span className="num">{step.shortlistSize}</span>
                        </span>
                        <span className="ms-auto">
                          {step.enough ? (
                            <Badge variant="success">
                              <Check className="size-3" aria-hidden />
                              מספיק
                            </Badge>
                          ) : (
                            <Badge variant="warning">מרחיב</Badge>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>

                  <WorldMap
                    jobLocation={jobLocation}
                    categorySlug={categorySlug}
                    onPick={() => {}}
                    radiusKm={discovery.radiusKm}
                    shortlistIds={discovery.shortlist.map((entry) => entry.candidate.providerId)}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    3 · דירוג ההתאמות
                    <span className="ms-2 text-xs font-normal text-muted-foreground">
                      ציון פנימי — לעולם לא מוצג ללקוח
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {discovery.shortlist.length === 0 ? (
                    <p className="rounded-lg bg-secondary p-4 text-sm text-muted-foreground">
                      {t.empty.noProviders} נסה למקם את העבודה קרוב יותר למרכז, או לבחור קטגוריה אחרת.
                    </p>
                  ) : (
                    <ol className="space-y-3">
                      {discovery.shortlist.map((entry, index) => (
                        <li key={entry.candidate.providerId} className="rounded-xl border bg-card p-3">
                          <div className="flex items-start gap-3">
                            <span className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2">
                                <span className="font-semibold">{entry.candidate.businessName}</span>
                                <span className="num text-sm font-bold text-accent">{entry.score}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistance(entry.candidate.distanceKm)}
                                  {entry.candidate.isAvailable ? '' : ' · לא זמין'}
                                </span>
                              </div>
                              <div className="mt-2">
                                <ScoreBreakdown entry={entry} weights={normaliseWeights(weights)} />
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setStage('brief')}>
                      <ArrowRight aria-hidden />
                      חזרה
                    </Button>
                    <Button
                      variant="accent"
                      className="flex-1"
                      onClick={broadcast}
                      disabled={discovery.shortlist.length === 0}
                    >
                      שדר לבעלי המקצוע
                      <ArrowLeft aria-hidden />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}

          {/* ── Stage: offers ─────────────────────────────────────────── */}
          {stage === 'offers' ? (
            <Card>
              <CardHeader>
                <CardTitle>4 · הצעות מחיר</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {offers.length === 0 ? (
                  <p className="rounded-lg bg-secondary p-4 text-sm text-muted-foreground">
                    {t.empty.noOffers} אף בעל מקצוע לא הגיב הפעם.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {offers.map((offer) => {
                      const provider = providerById(offer.providerId)!;
                      return (
                        <li key={offer.providerId}>
                          <OfferCard
                            offer={{
                              id: offer.providerId,
                              price: offer.price,
                              etaMinutes: offer.etaMinutes,
                              note: offer.note,
                              status: 'pending',
                              validUntil: offer.validUntil,
                              distanceKm: offer.distanceKm,
                              createdAt: offer.createdAt,
                              provider: {
                                id: provider.id,
                                businessName: provider.businessName,
                                avatarUrl: null,
                                categories: provider.categorySlugs.map(
                                  (slug) => categories.find((c) => c.slug === slug)?.name ?? slug,
                                ),
                                ratingAvg: provider.ratingAvg,
                                ratingCount: provider.ratingCount,
                                completedJobs: provider.completedJobs,
                                isVerified: provider.isVerified,
                              },
                            }}
                            action={
                              <Button variant="success" size="sm" onClick={() => acceptOffer(offer)}>
                                {t.offer.accept}
                              </Button>
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}

                <Button variant="outline" onClick={() => setStage('matching')}>
                  <ArrowRight aria-hidden />
                  חזרה לדירוג
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* ── Stage: job in flight ──────────────────────────────────── */}
          {(stage === 'job' || stage === 'review') && acceptedProvider && breakdown ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>5 · העבודה בביצוע</CardTitle>
                    <StatusBadge kind="job" status={status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{acceptedProvider.businessName}</p>
                      <Rating value={acceptedProvider.ratingAvg} count={acceptedProvider.ratingCount} size="sm" />
                    </div>
                    <div className="text-end">
                      <Price amount={agreedPrice} size="lg" />
                      <p className="text-xs text-muted-foreground">{formatEta(acceptedOffer?.etaMinutes ?? null)}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">הלקוח רואה</p>
                      <PriceBreakdown
                        rows={[{ label: t.payment.jobPrice, amount: customerPriceBreakdown(breakdown).jobPrice }]}
                        total={{ label: t.payment.total, amount: customerPriceBreakdown(breakdown).total }}
                        note={captured ? t.payment.captured : t.payment.authorized}
                      />
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">בעל המקצוע רואה</p>
                      <PriceBreakdown
                        rows={[
                          { label: t.provider.grossPrice, amount: providerPriceBreakdown(breakdown).gross },
                          {
                            label: t.provider.platformFee,
                            amount: providerPriceBreakdown(breakdown).platformFee,
                            negative: true,
                            muted: true,
                          },
                        ]}
                        total={{ label: t.provider.netPayout, amount: providerPriceBreakdown(breakdown).net }}
                        note={`כלל «${breakdown.rule.label}» · ${formatPercent(breakdown.effectiveRate)} בפועל`}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>6 · מכונת המצבים</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-medium">מי מבצע את הפעולה?</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(['customer', 'provider', 'admin'] as ActorType[]).map((value) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={actor === value}
                          onClick={() => setActor(value)}
                          className={cn(
                            'rounded-lg border p-2 text-xs font-medium transition-colors',
                            actor === value ? 'border-accent bg-accent/5 text-accent' : 'hover:bg-secondary',
                          )}
                        >
                          {value === 'customer' ? 'לקוח' : value === 'provider' ? 'בעל מקצוע' : 'מנהל'}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      החלף שחקן ונסה פעולה שאסורה לו — מכונת המצבים תסרב, והסירוב יופיע ביומן.
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium">מעברים אפשריים מ־«{t.job.statusLabel[status]}»</p>
                    {nextStatuses.length === 0 ? (
                      <p className="text-sm text-muted-foreground">זהו מצב סופי. אין לאן להמשיך.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {nextStatuses.map((next) => {
                          const allowed = canActorTransition(status, next, actor);
                          return (
                            <Button
                              key={next}
                              size="sm"
                              variant={allowed ? (next === 'cancelled' ? 'outline' : 'accent') : 'ghost'}
                              onClick={() => attempt(next)}
                              className={cn(!allowed && 'opacity-55')}
                              title={
                                allowed
                                  ? undefined
                                  : `השחקן «${actor}» לא רשאי להעביר ל-${next}`
                              }
                            >
                              {allowed ? <Check aria-hidden /> : <X aria-hidden />}
                              {t.job.statusLabel[next]}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border bg-card p-4">
                    <Timeline entries={timelineEntries} />
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}

          {/* ── Stage: review ─────────────────────────────────────────── */}
          {stage === 'review' && acceptedProvider ? (
            <Card>
              <CardHeader>
                <CardTitle>7 · דירוג</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  דירוג חדש משנה את הממוצע של בעל המקצוע — והממוצע הוא קלט לדירוג ההתאמות הבא.
                </p>
                <div className="flex items-center gap-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      aria-label={`${star} כוכבים`}
                      onClick={() => {
                        setRating(star);
                        const provider = providerById(acceptedProvider.id)!;
                        const total = provider.ratingAvg * provider.ratingCount + star;
                        provider.ratingCount += 1;
                        provider.ratingAvg = Math.round((total / provider.ratingCount) * 100) / 100;
                        provider.completedJobs += 1;
                        addLog(
                          'result',
                          `דירוג ${star}★ → ${provider.businessName}: ממוצע ${provider.ratingAvg} מתוך ${provider.ratingCount}`,
                        );
                      }}
                      className={cn(
                        'text-3xl transition-transform hover:scale-110',
                        star <= rating ? 'text-warning' : 'text-muted-foreground/35',
                      )}
                    >
                      ★
                    </button>
                  ))}
                </div>
                {rating ? (
                  <div className="rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
                    <p className="font-semibold">העבודה הושלמה.</p>
                    <p className="mt-1 text-muted-foreground">
                      {acceptedProvider.businessName}: ממוצע{' '}
                      <span className="num">{acceptedProvider.ratingAvg}</span> מתוך{' '}
                      <span className="num">{acceptedProvider.ratingCount}</span> ביקורות. הרץ עבודה
                      נוספת באותה קטגוריה כדי לראות איך זה מזיז אותו בדירוג.
                    </p>
                  </div>
                ) : null}
                <Button variant="accent" size="full" onClick={reset}>
                  עבודה חדשה
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </main>

        {/* ── Side panel ───────────────────────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
          {showSettings ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">משקלי ההתאמה</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(Object.keys(weights) as Array<keyof MatchWeights>).map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <label htmlFor={`w-${key}`} className="w-24 shrink-0 text-xs">
                      {WEIGHT_LABELS[key]}
                    </label>
                    <input
                      id={`w-${key}`}
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={weights[key]}
                      onChange={(event) =>
                        applyWeights({ ...weights, [key]: Number(event.target.value) })
                      }
                      className="flex-1 accent-[hsl(var(--accent))]"
                    />
                    <span className="num w-10 text-end text-xs">{formatPercent(weights[key])}</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  סכום:{' '}
                  <span className="num">
                    {formatPercent(Object.values(weights).reduce((sum, value) => sum + value, 0))}
                  </span>{' '}
                  — אם הוא לא 100%, <code>normaliseWeights()</code> מתקן לפני הדירוג.
                </p>

                <div className="border-t pt-3">
                  <p className="mb-2 text-sm font-semibold">כללי עמלה</p>
                  {feeRules.tiers.map((tier, index) => (
                    <div key={tier.label} className="mb-2 flex items-center gap-2">
                      <span className="flex-1 text-xs text-muted-foreground">{tier.label}</span>
                      <input
                        type="range"
                        min={0}
                        max={0.3}
                        step={0.01}
                        aria-label={`אחוז עמלה ${tier.label}`}
                        value={tier.percentage}
                        onChange={(event) => {
                          const tiers = [...feeRules.tiers];
                          tiers[index] = { ...tier, percentage: Number(event.target.value) };
                          setFeeRules({ ...feeRules, tiers });
                        }}
                        className="flex-1 accent-[hsl(var(--accent))]"
                      />
                      <span className="num w-10 text-end text-xs">{formatPercent(tier.percentage)}</span>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    מינימום {formatPrice(feeRules.minimum_fee)} · מקסימום{' '}
                    {formatPrice(feeRules.maximum_fee)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {showLog ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Terminal className="size-4" aria-hidden />
                  יומן מנוע
                </CardTitle>
              </CardHeader>
              <CardContent>
                {log.length === 0 ? (
                  <p className="text-xs text-muted-foreground">עדיין ריק. שלח בקשה.</p>
                ) : (
                  <ol dir="ltr" className="max-h-[28rem] space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
                    {log.map((entry) => (
                      <li
                        key={entry.id}
                        className={cn(
                          'rounded px-1.5 py-0.5',
                          entry.kind === 'call' && 'text-accent',
                          entry.kind === 'result' && 'text-success',
                          entry.kind === 'deny' && 'bg-destructive/10 text-destructive',
                          entry.kind === 'note' && 'text-muted-foreground',
                        )}
                      >
                        {entry.text}
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">העולם המדומה</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-xs">
                {PROVIDERS.filter((provider) => provider.categorySlugs.includes(categorySlug)).map(
                  (provider) => (
                    <li key={provider.id} className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-block size-2 shrink-0 rounded-full',
                          !provider.isVerified
                            ? 'bg-destructive'
                            : provider.isAvailable
                              ? 'bg-success'
                              : 'bg-muted-foreground/50',
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{provider.businessName}</span>
                      <span className="num shrink-0 text-muted-foreground">
                        {provider.ratingCount ? provider.ratingAvg.toFixed(1) : '—'}
                      </span>
                    </li>
                  ),
                )}
              </ul>
              <p className="mt-3 flex gap-1.5 text-[11px] text-muted-foreground">
                <CircleAlert className="size-3.5 shrink-0" aria-hidden />
                אדום = לא מאומת. גילוי לעולם לא יחזיר אותו, גם אם הוא הכי קרוב.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <MapPin className="size-4" aria-hidden />
                מה לנסות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 ps-4 text-xs text-muted-foreground">
                <li>מקם עבודה בפאתי המפה — צפה בהרחבה 5 ← 10 ← 20 ק״מ.</li>
                <li>החלף דחיפות ל«עכשיו» — מי שלא זמין נופל לתחתית.</li>
                <li>העלה את משקל המרחק ל-100% — הדירוג הופך לרשימת קרבה בלבד.</li>
                <li>בחר הצעה מעל ₪1,000 — העמלה עוברת ממדרגת 15% ל-10%.</li>
                <li>בחר «לקוח» ונסה לסמן «הושלמה» — מכונת המצבים תסרב.</li>
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) createRoot(container).render(<Simulator />);
