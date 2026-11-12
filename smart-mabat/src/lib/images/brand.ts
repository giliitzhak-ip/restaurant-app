import "server-only";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";

/** Instagram portrait feed format (4:5). */
export const OUT_W = 1080;
export const OUT_H = 1350;

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const FONT_HE = path.join(FONT_DIR, "heebo-hebrew-700-normal.woff");
const FONT_LATIN = path.join(FONT_DIR, "heebo-latin-700-normal.woff");

let fontsReady = false;
/** Register both Heebo subsets with fontconfig so Hebrew + digits/Latin render with one font family. */
async function ensureFonts() {
  if (fontsReady) return;
  for (const f of [FONT_LATIN, FONT_HE]) {
    await sharp({ text: { text: "x", font: "Heebo Bold 10", fontfile: f } }).png().toBuffer();
  }
  fontsReady = true;
}

function escapeMarkup(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Dark gradient band at the bottom + thin tech-blue accent line. */
function overlaySvg(withBand: boolean): Buffer {
  const band = withBand
    ? `<rect x="0" y="${OUT_H - 420}" width="${OUT_W}" height="420" fill="url(#g)"/>
       <rect x="60" y="${OUT_H - 120}" width="${OUT_W - 120}" height="4" rx="2" fill="#1E90FF" opacity="0.9"/>`
    : `<rect x="0" y="${OUT_H - 200}" width="${OUT_W}" height="200" fill="url(#g)"/>`;
  return Buffer.from(
    `<svg width="${OUT_W}" height="${OUT_H}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#050A14" stop-opacity="0"/>
        <stop offset="0.55" stop-color="#050A14" stop-opacity="0.78"/>
        <stop offset="1" stop-color="#050A14" stop-opacity="0.96"/>
      </linearGradient></defs>
      ${band}
    </svg>`,
  );
}

export interface BrandOptions {
  headline?: string | null;
  logo?: Buffer | null;
}

/**
 * Turn any photo (upload or AI) into an on-brand 1080×1350 JPEG:
 * crop to 4:5, dark gradient, optional Hebrew headline (RTL), optional logo.
 */
export async function brandImage(input: Buffer, opts: BrandOptions = {}): Promise<Buffer> {
  const base = await sharp(input).rotate().resize(OUT_W, OUT_H, { fit: "cover", position: "attention" }).toBuffer();
  const layers: OverlayOptions[] = [{ input: overlaySvg(Boolean(opts.headline)), top: 0, left: 0 }];

  if (opts.headline?.trim()) {
    await ensureFonts();
    const text = await sharp({
      text: {
        text: `<span foreground="#FFFFFF">${escapeMarkup(opts.headline.trim())}</span>`,
        font: "Heebo Bold 64",
        rgba: true,
        width: OUT_W - 160,
        align: "left", // Pango mirrors alignment for RTL paragraphs: "left" renders flush-right for Hebrew
        wrap: "word",
        dpi: 72,
      },
    })
      .png()
      .toBuffer({ resolveWithObject: true });
    // Right-align (RTL) inside the band, above the accent line.
    layers.push({
      input: text.data,
      top: Math.max(OUT_H - 150 - text.info.height, OUT_H - 380),
      left: Math.max(60, OUT_W - 60 - text.info.width),
    });
  }

  if (opts.logo) {
    // Logo sits bottom-left (opposite the RTL headline), below the accent line.
    const logo = await sharp(opts.logo)
      .resize({ width: 220, height: 80, fit: "inside" })
      .png()
      .toBuffer({ resolveWithObject: true });
    layers.push({ input: logo.data, top: OUT_H - 100 + Math.floor((80 - logo.info.height) / 2), left: 60 });
  }

  return sharp(base).composite(layers).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/** A clean branded placeholder (used in test mode when no image provider is configured). */
export async function placeholderImage(seed: number): Promise<Buffer> {
  const hue = [210, 220, 200, 230][seed % 4];
  const svg = `<svg width="${OUT_W}" height="${OUT_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="r" cx="0.7" cy="0.3" r="0.9">
        <stop offset="0" stop-color="hsl(${hue},80%,28%)"/>
        <stop offset="0.6" stop-color="#0A1428"/>
        <stop offset="1" stop-color="#03060C"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#r)"/>
    <g stroke="#1E90FF" stroke-opacity="0.12">
      ${Array.from({ length: 14 }, (_, i) => `<line x1="0" y1="${i * 100}" x2="${OUT_W}" y2="${i * 100}"/>`).join("")}
      ${Array.from({ length: 11 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="${OUT_H}"/>`).join("")}
    </g>
    <g transform="translate(330 380)">
      <rect x="0" y="40" width="360" height="160" rx="70" fill="#E8EEF7"/>
      <rect x="300" y="60" width="110" height="120" rx="30" fill="#C9D3E3"/>
      <circle cx="110" cy="120" r="62" fill="#0B1220"/>
      <circle cx="110" cy="120" r="38" fill="#12305C"/>
      <circle cx="96" cy="106" r="12" fill="#5FB4FF" opacity="0.9"/>
      <rect x="180" y="200" width="40" height="120" fill="#C9D3E3"/>
      <rect x="120" y="310" width="160" height="26" rx="8" fill="#C9D3E3"/>
    </g>
    <circle cx="830" cy="300" r="10" fill="#1E90FF"/>
    <circle cx="830" cy="300" r="26" fill="none" stroke="#1E90FF" stroke-opacity="0.4" stroke-width="3"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}
