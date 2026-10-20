"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2, ShieldCheck, AlertTriangle, Users, Wallet, Sparkles } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usd } from "@/lib/money";
import { formatDuration } from "@/lib/format";
import { CONSENT_TEXT } from "@/lib/consent";
import { Uploader } from "@/components/projects/uploader";
import type { ProjectDTO } from "@/server/projects";
import type { AiJobDTO } from "@/server/face-swap";
import type { MediaKind } from "@/server/media/policy";
import { FaceSwapJobCard } from "./job-card";
import { CreditsBadge } from "./credits-badge";
import type { ProviderAccount } from "@/providers/face-swap/types";

export type ProviderSummary = {
  id: string;
  name: string;
  paid: boolean;
  maxDurationSec: number;
  notes: string[];
  isMock: boolean;
  hasAccountApi: boolean;
  /** Why it can't run here (not installed / no key), or null. */
  unavailable: string | null;
  account: ProviderAccount | null;
  accountError: string | null;
};

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  if (!res) throw new Error("אין חיבור לשרת. נסו שוב.");
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    const err = new Error(data?.error ?? `שגיאת שרת (${res.status})`) as Error & { errors?: string[] };
    err.errors = data?.errors;
    throw err;
  }
  return data;
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <Card className="space-y-4">
      <CardTitle className="flex items-center gap-3">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-sm font-black", done ? "bg-success/20 text-success" : "bg-gold/15 text-gold")}>
          {done ? <Check className="size-4" aria-hidden /> : n}
        </span>
        {title}
      </CardTitle>
      {children}
    </Card>
  );
}

function Pick({ selected, onClick, children, label }: { selected: boolean; onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-xl border-2 bg-black text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
        selected ? "border-gold" : "border-steel hover:border-gold/50",
      )}
    >
      {children}
      {selected && (
        <span className="absolute end-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-gold text-ink">
          <Check className="size-4" aria-hidden />
        </span>
      )}
    </button>
  );
}

export function FaceSwapStudio({
  initial,
  providers,
  defaultProviderId,
  maxBytes,
  freeMode,
}: {
  initial: ProjectDTO;
  providers: ProviderSummary[];
  defaultProviderId: string;
  maxBytes: Record<MediaKind, number>;
  freeMode: boolean;
}) {
  const [project, setProject] = useState(initial);
  const [engineId, setEngineId] = useState(
    (providers.find((p) => p.id === defaultProviderId && !p.unavailable) ?? providers.find((p) => !p.unavailable) ?? providers[0]!).id,
  );
  const provider = providers.find((p) => p.id === engineId) ?? providers[0]!;
  const account = provider.account;
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [personIndex, setPersonIndex] = useState<number | null>(null);
  const [faceOwner, setFaceOwner] = useState<"SELF" | "OTHER_WITH_PERMISSION" | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [checks, setChecks] = useState({ face: false, video: false, label: false });
  const [quote, setQuote] = useState<AiJobDTO | null>(null);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(0);
  const [maxFps, setMaxFps] = useState<30 | 24 | 15>(30);
  const [acceptCharge, setAcceptCharge] = useState(false);
  const [busy, setBusy] = useState<"quote" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      setProject((await api(`/api/projects/${initial.id}`, "GET")).project);
    } catch {
      /* next poll */
    }
  }, [initial.id]);

  const images = project.assets.filter((a) => a.kind === "IMAGE" && a.role === "SOURCE");
  const videos = project.assets.filter((a) => a.kind === "VIDEO" && a.role === "SOURCE");
  const source = images.find((a) => a.id === sourceId);
  const target = videos.find((a) => a.id === targetId);
  const persons = target?.faces?.status === "ok" ? target.faces.persons : [];
  const activeJobs = project.aiJobs.filter((j) => j.status !== "PENDING_APPROVAL");

  const needsPoll =
    project.assets.some((a) => a.status === "PROCESSING") || project.aiJobs.some((j) => j.status === "QUEUED" || j.status === "RUNNING");
  useEffect(() => {
    if (!needsPoll) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [needsPoll, refresh]);

  // Auto-select when there is exactly one person in the video; reset the clip to the whole video.
  const targetDuration = (target?.durationMs ?? 0) / 1000;
  useEffect(() => {
    setPersonIndex(persons.length === 1 ? persons[0]!.index : null);
    setQuote(null);
    setClipStart(0);
    setClipEnd(Math.min(targetDuration, provider.maxDurationSec));
  }, [targetId, persons.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setQuote(null), [clipStart, clipEnd, maxFps, engineId]);
  const clipLen = Math.max(0, clipEnd - clipStart);
  const sendFps = Math.min(maxFps, target?.fps ?? 30);

  const consentOk = faceOwner !== null && subjectName.trim().length >= 2 && checks.face && checks.video && checks.label;
  const personOk = persons.length <= 1 || personIndex !== null;
  const ready = Boolean(!provider.unavailable && source?.status === "READY" && target?.status === "READY" && personOk && consentOk && clipEnd - clipStart >= 1);

  const sourceWarning = useMemo(() => {
    if (!source || source.status !== "READY") return null;
    if (source.faces?.status === "ok" && source.faces.persons.length === 0) return "לא זוהו פנים בתמונה הזו. בחרו תמונה ברורה מלפנים.";
    if (source.faces?.status === "ok" && source.faces.persons.length > 1) return "בתמונה יש כמה פנים. ייבחרו הפנים הבולטות ביותר. מומלץ תמונה של אדם אחד.";
    return null;
  }, [source]);

  async function getQuote() {
    setBusy("quote");
    setError(null);
    setErrors([]);
    setAcceptCharge(false);
    try {
      const data = await api("/api/face-swap/quote", "POST", {
        projectId: project.id,
        sourceAssetId: sourceId,
        targetAssetId: targetId,
        personIndex: persons.length > 1 ? personIndex : persons.length === 1 ? persons[0]!.index : null,
        clip: { startSec: Math.round(clipStart * 10) / 10, endSec: Math.round(clipEnd * 10) / 10, maxFps },
        providerId: engineId,
        consent: { faceOwner, subjectName, confirmFace: checks.face, confirmVideo: checks.video, confirmLabel: checks.label },
      });
      setQuote(data.job);
    } catch (e) {
      setError((e as Error).message);
      setErrors((e as Error & { errors?: string[] }).errors ?? []);
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!quote) return;
    setBusy("approve");
    setError(null);
    try {
      await api(`/api/jobs/${quote.id}/approve`, "POST", { confirmCostCents: quote.estimatedCostCents, acceptCharge: true });
      setQuote(null);
      await refresh();
      document.getElementById("jobs")?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
      setErrors((e as Error & { errors?: string[] }).errors ?? []);
    } finally {
      setBusy(null);
    }
  }

  const q = quote?.quote;
  const expiresMin = quote?.quoteExpiresAt ? Math.max(0, Math.round((new Date(quote.quoteExpiresAt).getTime() - Date.now()) / 60000)) : 0;

  return (
    <div className="space-y-5">
      <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-1 text-sm text-ash hover:text-gold">
        <ArrowRight className="size-4" aria-hidden />
        חזרה לפרויקט
      </Link>
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">
          <span className="gold-text">AI Face Swap</span> · <span dir="auto">{project.name}</span>
        </h1>
        {freeMode && (
          <p className="mt-2 text-sm text-success">מצב חינמי פעיל: פעולות בתשלום חסומות לחלוטין. מותר רק מנוע חינמי, או קרדיטים חינמיים של חשבון חינמי.</p>
        )}
      </div>

      <Card className="space-y-3">
        <CardTitle>מנוע החלפת הפנים</CardTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={engineId === p.id}
              disabled={Boolean(p.unavailable)}
              onClick={() => setEngineId(p.id)}
              className={cn(
                "rounded-xl border p-3 text-start transition-colors disabled:opacity-50",
                engineId === p.id ? "border-gold bg-gold/10" : "border-steel hover:border-gold/50",
              )}
            >
              <span className="flex flex-wrap items-center gap-2 font-semibold">
                {p.name}
                {p.isMock ? (
                  <Badge>בדיקה בלבד</Badge>
                ) : !p.paid ? (
                  <Badge variant="success">חינם</Badge>
                ) : freeMode ? (
                  <Badge variant="gold">קרדיטים חינמיים בלבד</Badge>
                ) : (
                  <Badge variant="danger">בתשלום</Badge>
                )}
              </span>
              {p.unavailable && <span className="mt-1 block text-xs text-danger">לא זמין: {p.unavailable}</span>}
            </button>
          ))}
        </div>
        <ul className="space-y-1 text-xs text-ash">
          {provider.notes.map((n) => (
            <li key={n} className="flex gap-2">
              <Sparkles className="mt-0.5 size-3 shrink-0 text-gold" aria-hidden />
              {n}
            </li>
          ))}
        </ul>
        {provider.hasAccountApi && <CreditsBadge key={provider.id} initial={account} error={provider.accountError} />}
      </Card>

      <Step n={1} title="תמונת הפנים החדשות" done={source?.status === "READY"}>
        <p className="text-sm text-ash">תמונה חדה של פנים מלפנים, בתאורה טובה ובלי משקפי שמש. אדם אחד בתמונה.</p>
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {images.map((a) => (
              <Pick key={a.id} selected={sourceId === a.id} onClick={() => setSourceId(a.id)} label={`בחירת ${a.originalName ?? "תמונה"}`}>
                {a.status === "READY" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/assets/${a.id}/file?v=poster`} alt={a.originalName ?? ""} className="aspect-square w-full object-cover" />
                ) : (
                  <span className="grid aspect-square place-items-center text-xs text-ash">{a.status === "PROCESSING" ? <Loader2 className="size-5 animate-spin text-gold" /> : "נדחה"}</span>
                )}
              </Pick>
            ))}
          </div>
        )}
        {sourceWarning && <Alert variant="info">{sourceWarning}</Alert>}
        <Uploader projectId={project.id} accept="image/*,.heic" maxBytes={maxBytes} onUploaded={refresh} />
      </Step>

      <Step n={2} title="הסרטון" done={target?.status === "READY"}>
        <p className="text-sm text-ash">
          סרטון ריקוד או תנועה שבו הפנים נראות רוב הזמן. אורך מרבי אצל הספק: {provider.maxDurationSec} שניות.
        </p>
        {videos.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {videos.map((a) => (
              <Pick key={a.id} selected={targetId === a.id} onClick={() => setTargetId(a.id)} label={`בחירת ${a.originalName ?? "סרטון"}`}>
                {a.status === "READY" ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/assets/${a.id}/file?v=poster`} alt={a.originalName ?? ""} className="aspect-[3/4] w-full object-cover" />
                    <span className="absolute bottom-1 start-1 rounded bg-ink/80 px-1.5 text-[11px] text-pearl" dir="ltr">{formatDuration(a.durationMs)}</span>
                  </>
                ) : (
                  <span className="grid aspect-[3/4] place-items-center text-xs text-ash">{a.status === "PROCESSING" ? <Loader2 className="size-5 animate-spin text-gold" /> : "נדחה"}</span>
                )}
              </Pick>
            ))}
          </div>
        )}
        {target && (target.durationMs ?? 0) / 1000 > provider.maxDurationSec && (
          <Alert>הסרטון ארוך מהמותר אצל הספק ({provider.maxDurationSec} שניות). קצרו אותו לפני ההעלאה.</Alert>
        )}
        <Uploader projectId={project.id} accept="video/*,.mov" maxBytes={maxBytes} onUploaded={refresh} />
      </Step>

      <Step n={3} title="את מי מחליפים?" done={Boolean(target) && personOk}>
        {!target ? (
          <p className="text-sm text-ash">בחרו סרטון כדי לראות את האנשים שזוהו בו.</p>
        ) : target.faces?.status !== "ok" ? (
          <Alert variant="info">זיהוי הפנים בסרטון אינו זמין. הספק יחליף את הפנים הבולטות בסרטון.</Alert>
        ) : persons.length === 0 ? (
          <Alert>לא זוהו פנים בסרטון. החלפת פנים דורשת פנים גלויות לפחות בחלק מהזמן.</Alert>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm text-ash">
              <Users className="size-4 text-gold" aria-hidden />
              {persons.length === 1 ? "זוהה אדם אחד בסרטון, והוא ייבחר אוטומטית." : `זוהו ${persons.length} אנשים. בחרו את מי להחליף:`}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {persons.map((p) => (
                <Pick key={p.index} selected={personIndex === p.index} onClick={() => setPersonIndex(p.index)} label={`אדם ${p.index + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${target.id}/file?v=face&n=${p.index}`} alt={`אדם ${p.index + 1}`} className="aspect-square w-full object-cover" />
                  <span className="block bg-coal px-1 py-0.5 text-center text-[11px] text-ash">נראה ב-{Math.round(p.presence * 100)}%</span>
                </Pick>
              ))}
            </div>
            {persons.some((p) => p.presence < 0.5) && (
              <p className="text-xs text-ash">כשהפנים נראות רק בחלק מהסרטון, ההחלפה תתבצע רק בקטעים שבהם הן גלויות.</p>
            )}
          </>
        )}
      </Step>

      <Step n={4} title="אישור זכויות שימוש" done={consentOk}>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm text-pearl/90">של מי הפנים בתמונה?</legend>
          {([["SELF", "שלי"], ["OTHER_WITH_PERMISSION", "של אדם אחר שנתן לי הסכמה מפורשת"]] as const).map(([v, label]) => (
            <label key={v} className={cn("flex items-center gap-3 rounded-xl border p-3 text-sm", faceOwner === v ? "border-gold bg-gold/10" : "border-steel")}>
              <input type="radio" name="faceOwner" checked={faceOwner === v} onChange={() => setFaceOwner(v)} className="size-5 accent-[#d4af37]" />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="subject">שם האדם שבתמונה</Label>
          <Input id="subject" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} maxLength={80} autoComplete="off" />
        </div>
        {(
          [
            ["face", faceOwner === "OTHER_WITH_PERMISSION" ? CONSENT_TEXT.faceOther : CONSENT_TEXT.faceSelf],
            ["video", CONSENT_TEXT.videoRights],
            ["label", CONSENT_TEXT.label],
          ] as const
        ).map(([k, text]) => (
          <label key={k} className="flex items-start gap-3 rounded-xl border border-steel bg-coal/60 p-3 text-sm leading-relaxed">
            <input type="checkbox" checked={checks[k]} onChange={(e) => setChecks((c) => ({ ...c, [k]: e.target.checked }))} className="mt-0.5 size-5 shrink-0 accent-[#d4af37]" />
            {text}
          </label>
        ))}
        <p className="flex items-center gap-2 text-xs text-ash">
          <ShieldCheck className="size-4 text-gold" aria-hidden />
          ההצהרה נשמרת במערכת יחד עם התאריך, ותצורף לתוצאה.
        </p>
      </Step>

      <Step n={5} title="קטע ואיכות" done={Boolean(target) && clipLen >= 1}>
        {!target ? (
          <p className="text-sm text-ash">בחרו סרטון.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ash">
              {provider.paid ? "החיוב לפי מספר הפריימים. קטע קצר וקצב פריימים נמוך חוסכים קרדיטים." : "ניתן לעבד רק חלק מהסרטון."}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="clip-start">התחלה: <span dir="ltr">{clipStart.toFixed(1)}s</span></Label>
                <input id="clip-start" type="range" min={0} max={Math.max(0, targetDuration - 1)} step={0.1} value={clipStart}
                  onChange={(e) => { const v = Number(e.target.value); setClipStart(v); if (clipEnd < v + 1) setClipEnd(Math.min(targetDuration, v + 1)); }}
                  className="w-full accent-[#d4af37]" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="clip-end">סיום: <span dir="ltr">{clipEnd.toFixed(1)}s</span></Label>
                <input id="clip-end" type="range" min={Math.min(targetDuration, clipStart + 1)} max={targetDuration} step={0.1} value={clipEnd}
                  onChange={(e) => setClipEnd(Number(e.target.value))} className="w-full accent-[#d4af37]" />
              </div>
            </div>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="mb-2 text-sm">קצב פריימים לעיבוד</legend>
              {([30, 24, 15] as const).map((f) => (
                <label key={f} className={cn("cursor-pointer rounded-xl border px-3 py-2 text-sm", maxFps === f ? "border-gold bg-gold/10 text-gold" : "border-steel")}>
                  <input type="radio" name="fps" className="sr-only" checked={maxFps === f} onChange={() => setMaxFps(f)} />
                  <span dir="ltr">{f} fps</span>
                  {f === 30 ? " · חלק" : f === 15 ? " · חסכוני" : ""}
                </label>
              ))}
            </fieldset>
            <p className="text-sm">
              אורך הקטע: <b dir="ltr">{clipLen.toFixed(1)}s</b> · פריימים: <b>{Math.ceil(clipLen * sendFps).toLocaleString("he-IL")}</b>
              {account && provider.paid && (
                <span className={cn("ms-2", Math.ceil(clipLen * sendFps) > account.credits ? "text-danger" : "text-success")}>
                  ({Math.ceil(clipLen * sendFps) > account.credits ? "יותר מהקרדיטים שנותרו" : "בתוך הקרדיטים שנותרו"})
                </span>
              )}
            </p>
          </div>
        )}
      </Step>

      <Step n={6} title="עלות ואישור" done={false}>
        {!quote ? (
          <>
            <p className="text-sm text-ash">לפני כל יצירה מוצגת הערכת עלות. שום חיוב לא מתבצע בלי אישור מפורש שלכם.</p>
            <Button size="lg" className="w-full" disabled={!ready || busy !== null} onClick={getQuote}>
              {busy === "quote" && <Loader2 className="animate-spin" aria-hidden />}
              קבלת הערכת עלות
            </Button>
            {!ready && <p className="text-xs text-ash">יש להשלים את שלבים 1–5.</p>}
          </>
        ) : (
          q && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gold/40 bg-gold/5 p-4">
                <p className="text-sm text-ash">{q.freeCredits ? "חיוב כספי" : "עלות משוערת"}</p>
                <p className="text-4xl font-black text-gold">{usd(quote.estimatedCostCents)}</p>
                {q.freeCredits && q.estimate.credits !== undefined && (
                  <p className="mt-1 text-sm text-success">
                    שימוש ב-{q.estimate.credits.toLocaleString("he-IL")} קרדיטים חינמיים{q.account ? ` מתוך ${q.account.credits.toLocaleString("he-IL")} שנותרו` : ""}
                  </p>
                )}
                <p className="mt-1 text-xs text-ash">{q.freeCredits ? "שווי מסחרי משוער: " + usd(q.estimate.costCents) + " · " : ""}{q.estimate.basis}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {q.estimate.breakdown.map((b) => (
                    <div key={b.label} className="contents">
                      <dt className="text-ash">{b.label}</dt>
                      <dd dir="auto">{b.value}</dd>
                    </div>
                  ))}
                  <dt className="text-ash">ספק</dt>
                  <dd dir="auto">{q.provider.name}</dd>
                </dl>
              </div>
              <ul className="space-y-1 text-xs text-ash">
                {q.provider.notes.map((n) => (
                  <li key={n} className="flex gap-2">
                    <Sparkles className="mt-0.5 size-3 shrink-0 text-gold" aria-hidden />
                    {n}
                  </li>
                ))}
              </ul>
              {q.blockers.length > 0 ? (
                <Alert>
                  <p className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" aria-hidden />לא ניתן להפעיל כרגע:</p>
                  <ul className="list-disc space-y-1 ps-5">{q.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                  {q.blockers.some((b) => b.includes("תקציב")) && (
                    <Link href="/account" className="mt-2 inline-flex items-center gap-1 underline"><Wallet className="size-4" aria-hidden />הגדרת תקציב</Link>
                  )}
                </Alert>
              ) : (
                <label className="flex items-start gap-3 rounded-xl border border-gold/50 p-3 text-sm leading-relaxed">
                  <input type="checkbox" checked={acceptCharge} onChange={(e) => setAcceptCharge(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#d4af37]" />
                  {q.freeCredits
                    ? `אני מאשר/ת שימוש ב-${q.estimate.credits?.toLocaleString("he-IL")} קרדיטים חינמיים אצל ${q.provider.name} (ללא חיוב כספי).`
                    : q.provider.paid
                      ? `אני מאשר/ת חיוב של עד ${usd(quote.estimatedCostCents)} אצל ${q.provider.name} עבור יצירת הסרטון.`
                      : "אני מאשר/ת את הפעלת המשימה (ללא עלות)."}
                </label>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button size="lg" className="flex-1" disabled={!acceptCharge || q.blockers.length > 0 || busy !== null} onClick={approve}>
                  {busy === "approve" && <Loader2 className="animate-spin" aria-hidden />}
                  {q.provider.paid && !q.freeCredits ? `אישור ויצירה (${usd(quote.estimatedCostCents)})` : "אישור ויצירה"}
                </Button>
                <Button size="lg" variant="ghost" onClick={() => setQuote(null)} disabled={busy !== null}>
                  ביטול
                </Button>
              </div>
              <p className="text-xs text-ash">ההצעה בתוקף עוד כ-{expiresMin} דקות.</p>
            </div>
          )
        )}
        {error && (
          <Alert>
            {error}
            {errors.length > 1 && <ul className="mt-1 list-disc ps-5">{errors.slice(1).map((e) => <li key={e}>{e}</li>)}</ul>}
          </Alert>
        )}
      </Step>

      <section id="jobs" className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          משימות החלפת פנים {activeJobs.length > 0 && <Badge>{activeJobs.length}</Badge>}
        </h2>
        {activeJobs.length === 0 ? (
          <p className="text-sm text-ash">עדיין אין משימות בפרויקט הזה.</p>
        ) : (
          activeJobs.map((j) => (
            <FaceSwapJobCard
              key={j.id}
              job={j}
              assets={project.assets}
              onCancel={async (id) => {
                try {
                  await api(`/api/jobs/${id}/cancel`, "POST");
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          ))
        )}
      </section>
    </div>
  );
}
