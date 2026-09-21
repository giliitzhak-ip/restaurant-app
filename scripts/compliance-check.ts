/**
 * Static compliance gate.
 *
 * Runs in CI and in `npm run qa`. It checks the handful of properties that are
 * cheap to assert statically, easy to break by accident, and expensive to
 * discover in production:
 *
 *  - every route the legal centre promises actually exists;
 *  - every legal document still has a version, and those versions still say
 *    "draft" (a consent record stores the version, so a version that silently
 *    drops "draft" implies a legal review that never happened);
 *  - nobody has filled a business fact with a plausible-looking invention;
 *  - the analytics module still consults consent;
 *  - the security headers are still present.
 *
 * It **reports** outstanding legal placeholders rather than failing on them.
 * A missing company ID is a launch blocker for the business, not a reason a
 * developer's build should go red — and a check that is always red is a check
 * everybody learns to ignore.
 *
 * What it cannot do: tell you whether any of this satisfies Israeli law. It
 * asserts that the code does what the documents say it does. See
 * docs/MANUAL-REVIEW-REQUIRED.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { legalDocuments, legalFacts, legalPlaceholders } from "../src/config/legal";

const root = process.cwd();
const failures: string[] = [];
const notes: string[] = [];

function check(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

function read(relative: string): string {
  return readFileSync(join(root, relative), "utf8");
}

/* ---------------------------------------------------------------- *
 * 1. The legal centre exists
 * ---------------------------------------------------------------- */

const REQUIRED_ROUTES = [
  "terms",
  "privacy",
  "accessibility",
  "shipping-and-returns",
  "cancel-order",
  "warranty",
  "cookies",
  "contact",
];

for (const route of REQUIRED_ROUTES) {
  const page = join("src", "app", "(store)", route, "page.tsx");
  check(existsSync(join(root, page)), `missing legal route: /${route} (expected ${page})`);
}

/* ---------------------------------------------------------------- *
 * 2. Documents are versioned, and still marked as drafts
 * ---------------------------------------------------------------- */

for (const [key, meta] of Object.entries(legalDocuments)) {
  check(Boolean(meta.version), `legal document "${key}" has no version`);
  check(Boolean(meta.date), `legal document "${key}" has no effective date`);
  check(
    meta.version.includes("draft"),
    `legal document "${key}" is no longer marked as a draft — if a lawyer has ` +
      `cleared it, remove this check deliberately rather than by editing the version string`,
  );
}

/* ---------------------------------------------------------------- *
 * 3. Nobody invented a business fact
 *
 * The failure mode this catches is well-intentioned: someone fills the
 * company ID with "12-3456789" to make the page look finished. A fabricated
 * company ID on a terms page is a false statement to consumers.
 * ---------------------------------------------------------------- */

const SUSPICIOUS = [
  /^0+$/,
  /000000/,
  /example\.(com|org)/i,
  /^12-?3456789$/,
  /lorem/i,
  /placeholder/i,
  /^ח\.פ\.?\s*0/,
];

for (const [key, fact] of Object.entries(legalFacts)) {
  if (!fact.value) continue;
  for (const pattern of SUSPICIOUS) {
    check(
      !pattern.test(fact.value),
      `legalFacts.${key} looks like an invented placeholder ("${fact.value}"). ` +
        `Leave it null until the business supplies the real value.`,
    );
  }
}

/* ---------------------------------------------------------------- *
 * 4. Consent still gates analytics
 * ---------------------------------------------------------------- */

const analytics = read("src/lib/analytics/index.ts");
check(
  analytics.includes("analyticsAllowed") && analytics.includes("hasDecided"),
  "src/lib/analytics/index.ts no longer checks consent before returning a driver — " +
    "every track() call would fire regardless of the visitor's choice",
);
check(
  /if \(!analyticsAllowed\(\)\) return noopDriver;/.test(analytics),
  "the analytics consent gate is present but no longer short-circuits to the noop driver",
);

const providers = read("src/components/providers.tsx");
check(
  providers.includes("ConsentProvider") && providers.includes("CookieBanner"),
  "src/components/providers.tsx no longer mounts the consent provider or the banner",
);

/* ---------------------------------------------------------------- *
 * 5. Marketing consent is not bundled with the terms
 * ---------------------------------------------------------------- */

const checkoutSchema = read("src/features/checkout/schema.ts");
check(
  checkoutSchema.includes("marketingOptIn"),
  "the checkout schema no longer carries a separate marketingOptIn field — " +
    "marketing consent must never ride on the terms checkbox",
);
check(
  /marketingOptIn:\s*z\.boolean\(\)\.default\(false\)/.test(checkoutSchema),
  "marketingOptIn must default to false; a pre-ticked marketing box is not consent",
);

/* ---------------------------------------------------------------- *
 * 6. Security headers
 * ---------------------------------------------------------------- */

const nextConfig = read("next.config.ts");
for (const header of [
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Strict-Transport-Security",
]) {
  check(nextConfig.includes(header), `next.config.ts no longer sets ${header}`);
}

const proxy = read("src/proxy.ts");
check(proxy.includes("default-src 'self'"), "the CSP no longer sets default-src 'self'");
check(
  !proxy.includes("'unsafe-inline'") || proxy.includes("style-src"),
  "script-src appears to allow 'unsafe-inline', which disables the CSP's main protection",
);

/* ---------------------------------------------------------------- *
 * 7. No secrets in the example env
 * ---------------------------------------------------------------- */

if (existsSync(join(root, ".env.example"))) {
  const example = read(".env.example");
  for (const line of example.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.+)$/.exec(line.trim());
    if (!match) continue;
    const [, key, value] = match;
    if (!key || !value) continue;
    // A URL or a driver name is fine; a long opaque string is not.
    const looksLikeSecret =
      /(SECRET|TOKEN|KEY|PASSWORD)/.test(key) && value.replace(/["']/g, "").length > 8;
    check(!looksLikeSecret, `.env.example appears to contain a real value for ${key}`);
  }
}

/* ---------------------------------------------------------------- *
 * Report
 * ---------------------------------------------------------------- */

const outstanding = legalPlaceholders();
const blocking = outstanding.filter((item) => item.required === "launch");
if (outstanding.length) {
  notes.push(
    `${outstanding.length} business facts are still placeholders ` +
      `(${blocking.length} launch-blocking, ${outstanding.length - blocking.length} conditional).`,
  );
  notes.push("These are the site owner's to supply — see docs/LEGAL-PLACEHOLDERS.md.");
}

console.log("compliance:check");
console.log("─".repeat(60));

if (notes.length) {
  for (const note of notes) console.log(`  note  ${note}`);
  console.log("");
}

if (failures.length) {
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`${failures.length} compliance check(s) failed.`);
  process.exit(1);
}

console.log(`  ok    ${REQUIRED_ROUTES.length} legal routes present`);
console.log(`  ok    ${Object.keys(legalDocuments).length} documents versioned and marked as drafts`);
console.log("  ok    analytics gated on consent");
console.log("  ok    marketing consent separate from purchase terms");
console.log("  ok    security headers present");
console.log("");
console.log("Automated checks only. Not evidence of legal compliance —");
console.log("see docs/MANUAL-REVIEW-REQUIRED.md for what still needs a human.");
