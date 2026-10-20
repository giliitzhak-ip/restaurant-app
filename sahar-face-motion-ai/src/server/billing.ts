import { db } from "@/lib/db";
import type { FaceSwapProvider, ProviderAccount } from "@/providers/face-swap/types";

import { usd } from "@/lib/money";

export { usd };

/**
 * Free Mode (FREE_MODE, ON unless explicitly "false"): no action may cost money.
 * Free providers run normally. A paid provider is allowed only when its own
 * account proves the job is covered by free credits: free tier, no subscription,
 * and enough remaining credits. ALLOW_PAID_PROVIDERS and budgets don't matter here.
 */
export function freeMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.FREE_MODE !== "false";
}

export type FreeCreditsCheck = { ok: true } | { ok: false; reason: string };

/** Whether a paid provider's job is fully covered by free credits on a free, subscription-less account. */
export function coveredByFreeCredits(account: ProviderAccount | null, creditsNeeded: number | undefined): FreeCreditsCheck {
  if (creditsNeeded === undefined) return { ok: false, reason: "הספק אינו מחייב בקרדיטים, ולכן אינו זמין במצב חינמי." };
  if (!account) return { ok: false, reason: "לא ניתן לבדוק את יתרת הקרדיטים אצל הספק, ולכן ההרצה נחסמה כדי לא לחייב." };
  if (account.tier !== "free" || account.subscription !== null) {
    return { ok: false, reason: `חשבון הספק אינו בתוכנית החינמית (${account.subscription ?? account.tier}). במצב חינמי מותר להשתמש רק בחשבון חינמי ללא מנוי.` };
  }
  if (account.credits < creditsNeeded) {
    return { ok: false, reason: `אין מספיק קרדיטים חינמיים: נדרשים ${creditsNeeded.toLocaleString("he-IL")}, נותרו ${account.credits.toLocaleString("he-IL")}. קצרו את הקטע או הורידו את קצב הפריימים.` };
  }
  return { ok: true };
}

/** Hard per-job ceiling, independent of user budgets (MAX_JOB_COST_USD, default $20). */
export function maxJobCostCents(env: Record<string, string | undefined> = process.env) {
  return Math.round((Number(env.MAX_JOB_COST_USD) || 20) * 100);
}

/** Highest monthly budget a user may set for themselves (MAX_USER_MONTHLY_BUDGET_USD, default $50). */
export function maxUserBudgetCents(env: Record<string, string | undefined> = process.env) {
  return Math.round((Number(env.MAX_USER_MONTHLY_BUDGET_USD) || 50) * 100);
}

function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function dayStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export type BudgetStatus = {
  monthlyBudgetCents: number;
  spentCents: number; // billed this month
  reservedCents: number; // approved but not finished yet
  availableCents: number;
  jobsToday: number;
  dailyJobLimit: number;
};

export async function budgetStatus(userId: string): Promise<BudgetStatus> {
  const [user, spent, reserved, jobsToday] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { monthlyBudgetCents: true, dailyJobLimit: true } }),
    db.usageRecord.aggregate({ where: { userId, createdAt: { gte: monthStartUtc() } }, _sum: { costCents: true } }),
    db.job.aggregate({ where: { userId, status: { in: ["QUEUED", "RUNNING"] }, approvedCostCents: { not: null } }, _sum: { approvedCostCents: true } }),
    db.job.count({ where: { userId, approvedAt: { gte: dayStartUtc() } } }),
  ]);
  const spentCents = spent._sum.costCents ?? 0;
  const reservedCents = reserved._sum.approvedCostCents ?? 0;
  return {
    monthlyBudgetCents: user.monthlyBudgetCents,
    spentCents,
    reservedCents,
    availableCents: Math.max(0, user.monthlyBudgetCents - spentCents - reservedCents),
    jobsToday,
    dailyJobLimit: user.dailyJobLimit,
  };
}

/** True when an external provider could not reach URLs on this host (localhost storage/app). */
export function mediaUrlsArePrivate(env: Record<string, string | undefined> = process.env): boolean {
  const base = (env.STORAGE_DRIVER || "s3") === "local" ? env.APP_URL : env.S3_ENDPOINT || "https://s3.amazonaws.com";
  try {
    const host = new URL(base ?? "").hostname;
    return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?$)/.test(host);
  } catch {
    return true;
  }
}

/**
 * Everything that prevents running a job right now, in Hebrew. Empty = may run.
 * Checked when quoting AND again at approval time.
 */
export function jobBlockers(opts: {
  provider: FaceSwapProvider;
  costCents: number;
  budget: BudgetStatus;
  env?: Record<string, string | undefined>;
  /** Free Mode only: provider account + credits the job needs. */
  account?: ProviderAccount | null;
  credits?: number;
}): string[] {
  const env = opts.env ?? process.env;
  const { provider, costCents, budget } = opts;
  const out: string[] = [];
  const missing = provider.requiredEnv.filter((k) => !env[k]);
  if (missing.length) out.push(`הספק ${provider.displayName} לא הוגדר בשרת (חסר מפתח API).`);

  if (freeMode(env)) {
    if (provider.paid) {
      const check = coveredByFreeCredits(opts.account ?? null, opts.credits);
      if (!missing.length && !check.ok) out.push(`מצב חינמי פעיל: ${check.reason}`);
    }
    if (budget.jobsToday >= budget.dailyJobLimit) out.push(`הגעתם למגבלת המשימות היומית (${budget.dailyJobLimit}).`);
    if (provider.capabilities.needsPublicUrls && mediaUrlsArePrivate(env)) out.push("האחסון נמצא בכתובת פרטית, ולכן הספק לא יוכל להוריד את הקבצים.");
    return out;
  }

  if (provider.paid && env.ALLOW_PAID_PROVIDERS !== "true") out.push("שירותי AI בתשלום חסומים בהגדרות השרת (ALLOW_PAID_PROVIDERS). לא יתבצע חיוב.");
  if (provider.paid && costCents > budget.availableCents) {
    out.push(
      budget.monthlyBudgetCents === 0
        ? "לא הוגדר תקציב חודשי לשירותים בתשלום. ניתן להגדיר אותו בעמוד החשבון."
        : `העלות (${usd(costCents)}) גבוהה מהיתרה בתקציב החודשי (${usd(budget.availableCents)} מתוך ${usd(budget.monthlyBudgetCents)}).`,
    );
  }
  if (costCents > maxJobCostCents(env)) out.push(`העלות חורגת מהתקרה למשימה אחת (${usd(maxJobCostCents(env))}).`);
  if (budget.jobsToday >= budget.dailyJobLimit) out.push(`הגעתם למגבלת המשימות היומית (${budget.dailyJobLimit}).`);
  if (provider.capabilities.needsPublicUrls && mediaUrlsArePrivate(env)) out.push("האחסון נמצא בכתובת פרטית, ולכן הספק לא יוכל להוריד את הקבצים. נדרש אחסון ענן (S3/R2).");
  return out;
}
