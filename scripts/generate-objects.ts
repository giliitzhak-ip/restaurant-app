/**
 * Draws the room designer's object library.
 *
 * Writes `public/media/objects/<slug>.svg`, one per entry in
 * `src/data/object-library.ts`, sized in real centimetres so proportion
 * survives every scale the editor renders at.
 *
 * Vector rather than raster, for three reasons that all matter here: an SVG
 * is a few kilobytes where a transparent PNG large enough to sit in a 3000px
 * download is hundreds; it stays sharp when a customer pinches into a corner
 * of the room; and transparency is exact rather than a matte that fringes
 * against dark cladding.
 *
 * Idempotent and deterministic — every random detail is seeded from the
 * slug — so re-running produces byte-identical files and the repository does
 * not churn.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { libraryAssets } from "../src/data/object-library";
import { drawAsset } from "./lib/furniture-draw";

const root = process.cwd();
const outDir = join(root, "public", "media", "objects");
const sentinel = join(outDir, ".generated");

/** Bump when the drawings change, so a stale checkout regenerates. */
const OBJECTS_VERSION = "1";

const force = process.argv.includes("--force");

function main() {
  if (!force && existsSync(sentinel)) {
    const current = readFileSync(sentinel, "utf8").trim();
    if (current === OBJECTS_VERSION) {
      console.log(`[objects] up to date (${libraryAssets.length} assets)`);
      return;
    }
  }

  mkdirSync(outDir, { recursive: true });

  const written: { path: string; bytes: number }[] = [];
  for (const asset of libraryAssets) {
    const markup = drawAsset(asset);
    const file = join(outDir, `${asset.slug}.svg`);
    writeFileSync(file, markup, "utf8");
    written.push({
      path: `/media/objects/${asset.slug}.svg`,
      bytes: Buffer.byteLength(markup),
    });
  }

  /*
   * Merge into the media manifest the budget check reads. Without this the
   * library grows unwatched, which is exactly the failure that manifest was
   * written to catch for the textures.
   */
  const manifestPath = join(root, "public", "media", "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      assets: { path: string; bytes: number }[];
      totalBytes?: number;
      count?: number;
    };
    const others = (manifest.assets ?? []).filter(
      (entry) => !entry.path.startsWith("/media/objects/"),
    );
    manifest.assets = [...others, ...written].sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    manifest.count = manifest.assets.length;
    manifest.totalBytes = manifest.assets.reduce((sum, e) => sum + e.bytes, 0);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  const bytes = written.reduce((sum, entry) => sum + entry.bytes, 0);
  writeFileSync(sentinel, OBJECTS_VERSION, "utf8");
  console.log(
    `[objects] wrote ${written.length} assets, ${(bytes / 1024).toFixed(1)} KB total`,
  );
}

main();
