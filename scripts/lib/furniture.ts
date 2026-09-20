/**
 * Vector furniture.
 *
 * Every object in the room designer's library is drawn here, procedurally, in
 * real centimetres: the SVG `viewBox` is the object's actual size, so a 65"
 * television and a 200cm sideboard keep their true proportion to each other
 * and to the floor behind them without a single hand-tuned number downstream.
 *
 * These are illustrations, and they are meant to look like illustrations —
 * a clean silhouette with enough interior detail to read at a glance. They
 * are not photographs of stock, they carry no brand, and nothing here is for
 * sale: an item only becomes purchasable when an administrator links it to a
 * real catalogue product.
 *
 * Two constraints shaped the drawing style:
 *
 * **They sit on a photograph.** The palette is a warm charcoal family that
 * reads against both a bright white room and a dark one, every piece carries
 * a soft contact shadow so it does not look pasted on, and nothing uses pure
 * black or pure white, which are the two colours a photograph never contains.
 *
 * **The background must be genuinely absent.** No white plate, no rectangle
 * behind the object, no near-white fill standing in for transparency — the
 * cladding the customer chose has to show around the legs of a console table
 * and under a floating shelf, and a baked-in background would cover it.
 */

/* ------------------------------------------------------------------ *
 * Palette
 * ------------------------------------------------------------------ */

export const ink = {
  /** Main body of a dark piece. */
  body: "#2b2723",
  bodyLight: "#3b352f",
  bodyDark: "#1c1917",
  /** Warm wood, for anything that should read as oak or walnut. */
  wood: "#7a5a3c",
  woodLight: "#96724c",
  woodDark: "#5c4229",
  /** Metal: legs, frames, handles. */
  metal: "#8a8177",
  metalDark: "#5f584f",
  /** Glass and screens. */
  glass: "#1a1d20",
  glassLight: "#2f363b",
  /** Brass accent, matching the storefront. */
  brass: "#8c6a43",
  /** Foliage. */
  leaf: "#4a6350",
  leafLight: "#5f7c64",
  /** Stone / marble tops. */
  stone: "#cfc8bd",
  stoneDark: "#a99f92",
} as const;

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

const n = (value: number) => Math.round(value * 100) / 100;

export function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  extra = "",
) {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra ? " " + extra : ""}/>`;
}

export function roundRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  extra = "",
) {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" fill="${fill}"${extra ? " " + extra : ""}/>`;
}

export function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  width = 0.6,
  opacity = 1,
) {
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${n(width)}" stroke-opacity="${opacity}" stroke-linecap="round"/>`;
}

export function circle(cx: number, cy: number, r: number, fill: string, extra = "") {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"${extra ? " " + extra : ""}/>`;
}

export function path(d: string, fill: string, extra = "") {
  return `<path d="${d}" fill="${fill}"${extra ? " " + extra : ""}/>`;
}

/**
 * The line of light along a top edge.
 *
 * Every real piece of furniture catches the room's light on its upper face.
 * Without it a flat fill reads as a sticker; with it, at one or two percent
 * opacity, it reads as an object.
 */
export function topLight(x: number, y: number, w: number, thickness = 0.8) {
  return rect(x, y, w, thickness, "#ffffff", 'opacity="0.13"');
}

/**
 * The shadow where a piece meets the floor or the wall behind it.
 *
 * An ellipse rather than a rectangle, and soft: a hard-edged shadow is worse
 * than none, because it announces that the object was pasted on.
 */
export function contactShadow(cx: number, cy: number, rx: number, ry: number) {
  return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="url(#contact)"/>`;
}

/** Shared definitions: the soft shadow, the screen sheen, the glass gradient. */
export function defs() {
  return `<defs>
  <radialGradient id="contact" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#15120f" stop-opacity="0.34"/>
    <stop offset="60%" stop-color="#15120f" stop-opacity="0.16"/>
    <stop offset="100%" stop-color="#15120f" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="screen" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#2c343b"/>
    <stop offset="45%" stop-color="#171b1f"/>
    <stop offset="100%" stop-color="#0f1215"/>
  </linearGradient>
  <linearGradient id="glassPane" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0%" stop-color="#9fb2bd" stop-opacity="0.32"/>
    <stop offset="55%" stop-color="#7d8d97" stop-opacity="0.16"/>
    <stop offset="100%" stop-color="#5d6a73" stop-opacity="0.26"/>
  </linearGradient>
  <linearGradient id="mirrorPane" x1="0.1" y1="0" x2="0.9" y2="1">
    <stop offset="0%" stop-color="#c8d2d8" stop-opacity="0.55"/>
    <stop offset="40%" stop-color="#9daab3" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#d7dee2" stop-opacity="0.5"/>
  </linearGradient>
  <linearGradient id="ember" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0%" stop-color="#e8a13f"/>
    <stop offset="55%" stop-color="#c3591f" stop-opacity="0.85"/>
    <stop offset="100%" stop-color="#7d2f12" stop-opacity="0.1"/>
  </linearGradient>
</defs>`;
}

/**
 * XML-escapes text going into an attribute.
 *
 * Not a formality: half the library is named with an inch mark — `טלוויזיה
 * 65"` — and dropping that raw into `aria-label="…"` closes the attribute
 * early and produces a document that is not XML at all.
 */
function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Wraps a body in the SVG envelope, sized in centimetres. */
export function svg(widthCm: number, heightCm: number, body: string, title: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(widthCm)} ${n(heightCm)}" width="${n(widthCm)}" height="${n(heightCm)}" role="img" aria-label="${escapeXml(title)}">
${defs()}
${body}
</svg>`;
}
