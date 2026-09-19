/**
 * Environment contract.
 *
 * Development is deliberately forgiving — the app runs with zero configuration
 * on an in-memory repository so a new contributor can `npm run dev` and see a
 * complete store. Production is deliberately strict: anything that would let
 * real customer data land somewhere volatile, or let an attacker in through a
 * default, stops the process at boot instead of failing quietly at 3am.
 */

export const isProduction = process.env.NODE_ENV === "production";
/** Set by `next build`; a build must not demand runtime-only secrets. */
export const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
/**
 * True only while actually serving traffic.
 *
 * `next build` runs with NODE_ENV=production and prerenders pages, so the
 * runtime guards (no memory repository, no local storage driver) have to sit
 * behind this rather than behind `isProduction` — otherwise a perfectly valid
 * build of a DATABASE_URL-less preview fails at page-collection time.
 */
export const isServingProduction = isProduction && !isBuildPhase;

export type EnvProblem = { key: string; message: string };

function read(key: string) {
  const value = process.env[key];
  return value && value.trim() ? value.trim() : null;
}

/**
 * Collects every production misconfiguration at once, so the operator fixes
 * them in one pass rather than one redeploy per missing variable.
 */
export function collectEnvProblems(): EnvProblem[] {
  if (!isProduction) return [];
  const problems: EnvProblem[] = [];

  if (!read("DATABASE_URL")) {
    problems.push({
      key: "DATABASE_URL",
      message:
        "required in production — the in-memory repository loses every order, design and account on restart.",
    });
  }

  const secret = read("AUTH_SECRET");
  if (!secret) {
    problems.push({ key: "AUTH_SECRET", message: "required in production — sessions are signed with it." });
  } else if (secret.length < 32) {
    problems.push({ key: "AUTH_SECRET", message: "must be at least 32 characters." });
  } else if (secret.includes("change-me") || secret.includes("development")) {
    problems.push({ key: "AUTH_SECRET", message: "still holds a placeholder value." });
  }

  const site = read("NEXT_PUBLIC_SITE_URL");
  if (!site) {
    problems.push({
      key: "NEXT_PUBLIC_SITE_URL",
      message: "required in production — canonicals, sitemap, OG tags and payment return URLs depend on it.",
    });
  } else if (!/^https:\/\//.test(site)) {
    problems.push({ key: "NEXT_PUBLIC_SITE_URL", message: "must be an https:// URL." });
  }

  if (read("STORAGE_DRIVER") !== "remote") {
    problems.push({
      key: "STORAGE_DRIVER",
      message:
        'must be "remote" in production — the local driver writes customer photos onto an ephemeral container disk.',
    });
  } else {
    for (const key of ["STORAGE_ENDPOINT", "STORAGE_BUCKET", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY", "STORAGE_PUBLIC_BASE_URL"]) {
      if (!read(key)) problems.push({ key, message: "required when STORAGE_DRIVER=remote." });
    }
  }

  const adminPassword = read("SEED_ADMIN_PASSWORD");
  if (adminPassword && (adminPassword.length < 12 || /^(admin|password|terra)/i.test(adminPassword))) {
    problems.push({
      key: "SEED_ADMIN_PASSWORD",
      message: "must be at least 12 characters and not a guessable default.",
    });
  }

  if (!read("RATE_LIMIT_REDIS_URL")) {
    problems.push({
      key: "RATE_LIMIT_REDIS_URL",
      message:
        "required in production — the in-memory limiter is per-instance and resets on every deploy, so it does not actually limit anything behind more than one container.",
    });
  }

  return problems;
}

let verified = false;

/**
 * Throws on the first production request (and at boot via instrumentation)
 * when the environment is not fit to take real orders.
 */
export function assertProductionEnv() {
  if (verified || !isProduction || isBuildPhase) return;
  const problems = collectEnvProblems();
  if (problems.length) {
    const lines = problems.map((p) => `  - ${p.key}: ${p.message}`).join("\n");
    throw new Error(`Refusing to start: invalid production environment.\n${lines}`);
  }
  verified = true;
}

/** True when the app may fall back to development-only conveniences. */
export function allowDevFallbacks() {
  return !isProduction;
}
