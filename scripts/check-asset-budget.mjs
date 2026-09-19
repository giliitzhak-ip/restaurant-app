#!/usr/bin/env node
/**
 * Asset budget.
 *
 * Generated imagery is the easiest thing in this repo to let grow without
 * anyone noticing: nobody reviews a 4 MB hero, because nobody sees it in a
 * diff. This reads public/media/manifest.json and fails when the total or any
 * single file crosses a stated line, so growth has to be argued for rather
 * than absorbed.
 *
 *   npm run assets:check
 *
 * Budgets can be raised deliberately — edit the constants and say why in the
 * commit message.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/*
 * Budgets are set just above what the current generator produces (247 files,
 * about 2 MB), so an accidental regression to PNG output, a forgotten resize
 * or a new set of oversized scenes fails the build instead of shipping.
 */
/** Every generated asset together. */
const TOTAL_BUDGET_MB = 6;
/** Any one file. A hero is allowed to be big; nothing is allowed to be huge. */
const FILE_BUDGET_KB = 90;
/** Anything a page loads above the fold. */
const CRITICAL_BUDGET_KB = 60;
const CRITICAL = [/\/scenes\/hero/, /\/categories\//];

const manifestPath = join(process.cwd(), "public", "media", "manifest.json");

if (!existsSync(manifestPath)) {
  console.error(
    "✗ public/media/manifest.json is missing. Run `npm run media:generate` first.",
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const assets = manifest.assets ?? [];
const failures = [];

const totalMb = manifest.totalBytes / 1024 / 1024;
if (totalMb > TOTAL_BUDGET_MB) {
  failures.push(
    `total generated media is ${totalMb.toFixed(1)} MB, budget is ${TOTAL_BUDGET_MB} MB`,
  );
}

for (const asset of assets) {
  const kb = asset.bytes / 1024;
  const isCritical = CRITICAL.some((pattern) => pattern.test(asset.path));
  const limit = isCritical ? CRITICAL_BUDGET_KB : FILE_BUDGET_KB;
  if (kb > limit) {
    failures.push(`${asset.path} is ${kb.toFixed(0)} KB, budget is ${limit} KB`);
  }
}

const biggest = [...assets].sort((a, b) => b.bytes - a.bytes).slice(0, 5);

console.log(
  `media: ${assets.length} files, ${totalMb.toFixed(1)} MB of ${TOTAL_BUDGET_MB} MB budget`,
);
for (const asset of biggest) {
  console.log(`  ${(asset.bytes / 1024).toFixed(0).padStart(5)} KB  ${asset.path}`);
}

if (failures.length) {
  console.error("\n✗ asset budget exceeded:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("✓ within budget");
