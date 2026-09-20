import {
  circle,
  contactShadow,
  ink,
  line,
  path,
  rect,
  roundRect,
  svg,
  topLight,
} from "./furniture";
import type { LibraryAssetSeed } from "../../src/data/object-library";

/**
 * One drawing per category.
 *
 * Each receives the asset's real width and height in centimetres and returns
 * SVG in that coordinate space, so proportion is never a guess: a door seam
 * 2cm from the edge is 2cm from the edge whether the piece is 150 or 240
 * wide, and a 5cm shelf stays 5cm thick however long it gets.
 */

/** Deterministic noise, so regenerating the library produces identical files. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

/* ------------------------------------------------------------------ *
 * Screens
 * ------------------------------------------------------------------ */

function tv(w: number, h: number) {
  const bezel = Math.max(0.8, w * 0.011);
  return [
    contactShadow(w / 2, h + h * 0.06, w * 0.46, h * 0.07),
    roundRect(0, 0, w, h, bezel * 1.4, ink.bodyDark),
    rect(bezel, bezel, w - bezel * 2, h - bezel * 2.6, "url(#screen)"),
    // The sheen: a room reflected in a switched-off panel, which is what a
    // television in a photograph almost always is.
    path(
      `M${bezel} ${h * 0.62} L${w * 0.42} ${bezel} L${w * 0.63} ${bezel} L${bezel} ${h * 0.86} Z`,
      "#ffffff",
      'opacity="0.05"',
    ),
    topLight(0, 0, w, bezel * 0.5),
    // The foot of the bezel, slightly deeper, where the electronics sit.
    rect(0, h - bezel * 1.6, w, bezel * 1.6, ink.body),
    circle(w / 2, h - bezel * 0.8, bezel * 0.22, ink.metal, 'opacity="0.5"'),
  ].join("\n");
}

/* ------------------------------------------------------------------ *
 * Cabinetry
 * ------------------------------------------------------------------ */

/** Body, door seams, handles, top highlight. Shared by most casegoods. */
function caseBody(
  x: number,
  y: number,
  w: number,
  h: number,
  doors: number,
  fill: string,
  handle: "BAR" | "NOTCH" | "NONE" = "BAR",
) {
  const parts = [roundRect(x, y, w, h, Math.min(1.2, h * 0.06), fill), topLight(x, y, w)];
  const door = w / doors;
  for (let i = 1; i < doors; i += 1) {
    parts.push(line(x + door * i, y + 1, x + door * i, y + h - 1, ink.bodyDark, 0.5, 0.75));
  }
  if (handle === "BAR") {
    for (let i = 0; i < doors; i += 1) {
      const cx = x + door * i + door / 2;
      const len = Math.min(door * 0.4, 22);
      parts.push(
        roundRect(cx - len / 2, y + h * 0.5 - 0.5, len, 1, 0.5, ink.metal, 'opacity="0.85"'),
      );
    }
  } else if (handle === "NOTCH") {
    for (let i = 0; i < doors; i += 1) {
      const cx = x + door * i + door / 2;
      parts.push(
        rect(cx - door * 0.22, y + h * 0.12, door * 0.44, 0.9, ink.bodyDark, 'opacity="0.8"'),
      );
    }
  }
  return parts.join("\n");
}

function sideboardWall(w: number, h: number) {
  return [
    // Hung: the shadow is under it, on the wall, not on the floor.
    contactShadow(w / 2, h + h * 0.22, w * 0.44, h * 0.18),
    caseBody(0, 0, w, h, Math.max(2, Math.round(w / 80)), ink.wood, "NOTCH"),
    rect(0, h - h * 0.1, w, h * 0.1, ink.woodDark, 'opacity="0.55"'),
  ].join("\n");
}

function sideboardFloor(w: number, h: number) {
  const legH = h * 0.16;
  const body = h - legH;
  const legW = Math.max(2, w * 0.018);
  return [
    contactShadow(w / 2, h, w * 0.47, legH * 0.55),
    caseBody(0, 0, w, body, Math.max(2, Math.round(w / 75)), ink.wood, "BAR"),
    rect(w * 0.06, body, legW, legH, ink.metalDark),
    rect(w - w * 0.06 - legW, body, legW, legH, ink.metalDark),
    rect(w * 0.06, body, w * 0.88, legW * 0.7, ink.metalDark, 'opacity="0.8"'),
  ].join("\n");
}

function cabinet(w: number, h: number, tall: boolean) {
  const legH = tall ? h * 0.04 : h * 0.09;
  const body = h - legH;
  return [
    contactShadow(w / 2, h, w * 0.46, legH * 0.8),
    caseBody(0, 0, w, body, tall ? 2 : 2, ink.body, "BAR"),
    rect(w * 0.04, body, w * 0.92, legH, ink.bodyDark),
  ].join("\n");
}

function consoleTable(w: number, h: number) {
  const topH = Math.max(2.5, h * 0.05);
  const legW = Math.max(2, w * 0.022);
  const shelfY = h * 0.68;
  return [
    contactShadow(w / 2, h, w * 0.46, h * 0.055),
    rect(0, 0, w, topH, ink.wood),
    topLight(0, 0, w),
    rect(w * 0.04, topH, legW, h - topH, ink.metalDark),
    rect(w - w * 0.04 - legW, topH, legW, h - topH, ink.metalDark),
    rect(w * 0.04, shelfY, w * 0.92, topH * 0.6, ink.woodDark),
  ].join("\n");
}

/* ------------------------------------------------------------------ *
 * Shelving and recesses
 * ------------------------------------------------------------------ */

function floatingShelf(w: number, h: number) {
  return [
    // A floating shelf is read entirely by the shadow it throws on the wall.
    `<ellipse cx="${w / 2}" cy="${h * 2.2}" rx="${w * 0.47}" ry="${h * 1.6}" fill="url(#contact)"/>`,
    roundRect(0, 0, w, h, h * 0.18, ink.wood),
    topLight(0, 0, w, h * 0.22),
    rect(0, h * 0.7, w, h * 0.3, ink.woodDark, 'opacity="0.6"'),
  ].join("\n");
}

/**
 * A niche is a hole, not a box.
 *
 * It is drawn as a dark recess with light catching the top and one side, so
 * it reads as depth cut into the cladding behind it rather than as a panel
 * stuck on top of it — which is the difference between a niche and a picture
 * frame.
 */
function niche(w: number, h: number) {
  /*
   * Perspective depth, not a flat panel.
   *
   * The first version drew the opening and four faint bevels and came out as
   * a black rectangle — which is a picture frame, not a hole. This one sets
   * the back face noticeably smaller than the opening and draws the four side
   * walls as visible trapezoids: the top wall catches the room light, the
   * bottom is in shadow, and the two sides sit between. That difference in
   * value across the four faces is the only thing that says "this is cut into
   * the wall" at the size these are actually viewed.
   */
  const inset = Math.min(w, h) * 0.13;
  const bx = inset * 0.9;
  const by = inset * 0.75;
  const bw = w - bx * 2;
  const bh = h - by * 2;

  return [
    // Back face, deepest in shadow.
    rect(bx, by, bw, bh, "#14110f"),
    // Top wall: lit, because the light in a room comes from above.
    path(`M0 0 L${w} 0 L${bx + bw} ${by} L${bx} ${by} Z`, "#5c534a"),
    // Bottom wall: the deepest shadow in the recess.
    path(`M0 ${h} L${bx} ${by + bh} L${bx + bw} ${by + bh} L${w} ${h} Z`, "#0d0b09"),
    // Side walls, one a little brighter than the other so it is not symmetric.
    path(`M0 0 L${bx} ${by} L${bx} ${by + bh} L0 ${h} Z`, "#3a342e"),
    path(`M${w} 0 L${w} ${h} L${bx + bw} ${by + bh} L${bx + bw} ${by} Z`, "#241f1b"),
    // A gradient across the back, so it is not a flat fill.
    rect(bx, by, bw, bh * 0.45, "#ffffff", 'opacity="0.05"'),
    // The bright arris where the opening meets the cladding.
    rect(0, 0, w, Math.max(0.5, inset * 0.09), "#ffffff", 'opacity="0.22"'),
  ].join("\n");
}

function bookcase(w: number, h: number, seed: string) {
  const random = rng(seed);
  const frame = Math.max(2, w * 0.022);
  const shelves = Math.max(4, Math.round(h / 42));
  const parts = [
    contactShadow(w / 2, h, w * 0.47, h * 0.03),
    rect(0, 0, w, h, ink.wood),
    rect(frame, frame, w - frame * 2, h - frame * 2, ink.bodyDark),
  ];
  const inner = h - frame * 2;
  const gap = inner / shelves;
  for (let i = 1; i < shelves; i += 1) {
    parts.push(rect(frame, frame + gap * i, w - frame * 2, frame * 0.7, ink.wood));
  }
  // Books: deterministic, so the file does not change between runs.
  for (let s = 0; s < shelves; s += 1) {
    const top = frame + gap * s + frame * 0.7;
    const usable = gap - frame * 0.7;
    let x = frame + 1.5;
    while (x < w - frame - 4) {
      const bw = 1.6 + random() * 3.4;
      const bh = usable * (0.55 + random() * 0.4);
      const tone = [ink.brass, ink.woodLight, ink.metal, ink.leaf, ink.stoneDark][
        Math.floor(random() * 5)
      ]!;
      parts.push(rect(x, top + usable - bh, bw, bh, tone, 'opacity="0.85"'));
      x += bw + 0.5;
    }
  }
  return parts.join("\n");
}

/* ------------------------------------------------------------------ *
 * Bar
 * ------------------------------------------------------------------ */

function homeBar(w: number, h: number, seed: string) {
  const random = rng(seed);
  const counterY = h * 0.62;
  const counterH = h * 0.045;
  const backH = counterY;
  const parts = [
    contactShadow(w / 2, h, w * 0.47, h * 0.03),
    // Back wall with open shelving.
    rect(w * 0.06, 0, w * 0.88, backH, ink.bodyDark, 'opacity="0.95"'),
    rect(w * 0.06, 0, w * 0.88, backH, ink.wood, 'opacity="0.22"'),
  ];
  const shelfCount = 3;
  for (let i = 1; i <= shelfCount; i += 1) {
    const y = (backH / (shelfCount + 1)) * i;
    parts.push(rect(w * 0.08, y, w * 0.84, h * 0.012, ink.wood));
    // Bottles.
    let x = w * 0.11;
    while (x < w * 0.88) {
      const bw = 3 + random() * 2.4;
      const bh = (backH / (shelfCount + 1)) * (0.45 + random() * 0.3);
      const tone = [ink.leaf, ink.brass, ink.glassLight, ink.woodDark][
        Math.floor(random() * 4)
      ]!;
      parts.push(
        rect(x, y - bh, bw, bh, tone, 'opacity="0.8"'),
        rect(x + bw * 0.35, y - bh - bh * 0.22, bw * 0.3, bh * 0.22, tone, 'opacity="0.6"'),
      );
      x += bw + 1.6 + random() * 2.5;
    }
  }
  parts.push(
    rect(0, counterY, w, counterH, ink.stone),
    topLight(0, counterY, w),
    rect(w * 0.04, counterY + counterH, w * 0.92, h - counterY - counterH, ink.wood),
    line(w * 0.2, counterY + counterH, w * 0.2, h, ink.woodDark, 0.6, 0.6),
    line(w * 0.8, counterY + counterH, w * 0.8, h, ink.woodDark, 0.6, 0.6),
  );
  return parts.join("\n");
}

function barCounter(w: number, h: number) {
  const topH = h * 0.07;
  const railY = h * 0.82;
  return [
    contactShadow(w / 2, h, w * 0.47, h * 0.05),
    rect(0, 0, w, topH, ink.stone),
    topLight(0, 0, w),
    rect(w * 0.02, topH, w * 0.96, h - topH, ink.wood),
    rect(w * 0.02, topH, w * 0.96, h * 0.02, ink.woodDark, 'opacity="0.5"'),
    line(w * 0.25, topH, w * 0.25, h, ink.woodDark, 0.6, 0.5),
    line(w * 0.5, topH, w * 0.5, h, ink.woodDark, 0.6, 0.5),
    line(w * 0.75, topH, w * 0.75, h, ink.woodDark, 0.6, 0.5),
    roundRect(w * 0.06, railY, w * 0.88, h * 0.022, h * 0.011, ink.brass, 'opacity="0.9"'),
  ].join("\n");
}

function drinksCabinet(w: number, h: number, seed: string) {
  const random = rng(seed);
  const legH = h * 0.06;
  const body = h - legH;
  const split = body * 0.56;
  const parts = [
    contactShadow(w / 2, h, w * 0.45, legH * 0.9),
    rect(0, 0, w, body, ink.wood),
    // Glass-fronted upper half.
    rect(w * 0.05, body * 0.05, w * 0.9, split - body * 0.05, ink.bodyDark),
  ];
  const shelves = 3;
  for (let i = 1; i <= shelves; i += 1) {
    const y = body * 0.05 + ((split - body * 0.05) / (shelves + 1)) * i;
    parts.push(rect(w * 0.07, y, w * 0.86, h * 0.008, ink.woodLight));
    let x = w * 0.1;
    while (x < w * 0.86) {
      const bw = 3.2 + random() * 2;
      const bh = ((split - body * 0.05) / (shelves + 1)) * (0.5 + random() * 0.28);
      parts.push(
        rect(x, y - bh, bw, bh, [ink.leaf, ink.brass, ink.glassLight][Math.floor(random() * 3)]!, 'opacity="0.78"'),
      );
      x += bw + 1.8;
    }
  }
  parts.push(
    rect(w * 0.05, body * 0.05, w * 0.9, split - body * 0.05, "url(#glassPane)"),
    line(w / 2, body * 0.05, w / 2, split, ink.metal, 0.5, 0.7),
    caseBody(w * 0.05, split, w * 0.9, body - split - body * 0.04, 2, ink.woodDark, "BAR"),
    rect(w * 0.08, body, w * 0.84, legH, ink.metalDark),
  );
  return parts.join("\n");
}

function wineFridge(w: number, h: number) {
  const racks = Math.max(4, Math.round(h / 22));
  const parts = [
    contactShadow(w / 2, h, w * 0.45, h * 0.025),
    roundRect(0, 0, w, h, 1, ink.bodyDark),
    rect(w * 0.06, h * 0.04, w * 0.88, h * 0.82, ink.glass),
  ];
  for (let i = 0; i < racks; i += 1) {
    const y = h * 0.06 + ((h * 0.78) / racks) * i;
    parts.push(
      rect(w * 0.1, y, w * 0.8, h * 0.006, ink.metal, 'opacity="0.55"'),
      // Bottles lying on their side read as ellipses from the front.
      circle(w * 0.3, y + h * 0.012, w * 0.055, "#3f2d22", 'opacity="0.9"'),
      circle(w * 0.5, y + h * 0.012, w * 0.055, "#2f3b2f", 'opacity="0.9"'),
      circle(w * 0.7, y + h * 0.012, w * 0.055, "#3f2d22", 'opacity="0.9"'),
    );
  }
  parts.push(
    rect(w * 0.06, h * 0.04, w * 0.88, h * 0.82, "url(#glassPane)"),
    // Control strip and the vertical pull down one edge.
    roundRect(w * 0.12, h * 0.88, w * 0.36, h * 0.045, h * 0.02, ink.glassLight),
    circle(w * 0.62, h * 0.9, w * 0.03, ink.brass, 'opacity="0.9"'),
    roundRect(w * 0.9, h * 0.1, w * 0.035, h * 0.3, w * 0.018, ink.metal),
  );
  return parts.join("\n");
}

/* ------------------------------------------------------------------ *
 * Wall pieces
 * ------------------------------------------------------------------ */

function fireplace(w: number, h: number) {
  const inset = h * 0.12;
  return [
    roundRect(0, 0, w, h, h * 0.06, ink.bodyDark),
    rect(inset * 0.8, inset, w - inset * 1.6, h - inset * 2, "#0b0908"),
    rect(inset * 0.8, h - inset * 2, w - inset * 1.6, inset * 0.9, "url(#ember)"),
    rect(inset * 0.8, inset, w - inset * 1.6, h - inset * 2, "url(#ember)", 'opacity="0.32"'),
    topLight(0, 0, w, h * 0.03),
    // Glow spilling onto the wall below.
    `<ellipse cx="${w / 2}" cy="${h}" rx="${w * 0.42}" ry="${h * 0.22}" fill="#e8a13f" opacity="0.12"/>`,
  ].join("\n");
}

function mirrorTall(w: number, h: number) {
  const frame = Math.max(1.2, w * 0.035);
  return [
    contactShadow(w / 2, h + h * 0.03, w * 0.44, h * 0.03),
    roundRect(0, 0, w, h, frame, ink.brass),
    rect(frame, frame, w - frame * 2, h - frame * 2, ink.glassLight),
    rect(frame, frame, w - frame * 2, h - frame * 2, "url(#mirrorPane)"),
    path(
      `M${frame} ${h * 0.7} L${w * 0.55} ${frame} L${w * 0.75} ${frame} L${frame} ${h * 0.92} Z`,
      "#ffffff",
      'opacity="0.14"',
    ),
  ].join("\n");
}

function mirrorRound(w: number, h: number) {
  const r = Math.min(w, h) / 2;
  const frame = r * 0.06;
  return [
    circle(w / 2, h / 2, r, ink.brass),
    circle(w / 2, h / 2, r - frame, ink.glassLight),
    `<circle cx="${w / 2}" cy="${h / 2}" r="${r - frame}" fill="url(#mirrorPane)"/>`,
    path(
      `M${w * 0.18} ${h * 0.7} L${w * 0.62} ${h * 0.14} L${w * 0.78} ${h * 0.2} L${w * 0.28} ${h * 0.82} Z`,
      "#ffffff",
      'opacity="0.13"',
    ),
  ].join("\n");
}

function wallArt(w: number, h: number, panels: number, seed: string) {
  const random = rng(seed);
  const frame = Math.max(0.8, Math.min(w, h) * 0.022);
  const gap = panels > 1 ? w * 0.035 : 0;
  const panelW = (w - gap * (panels - 1)) / panels;
  const parts: string[] = [];
  for (let p = 0; p < panels; p += 1) {
    const x = p * (panelW + gap);
    parts.push(
      rect(x, 0, panelW, h, ink.bodyDark),
      rect(x + frame, frame, panelW - frame * 2, h - frame * 2, "#e9e3d9"),
    );
    // A calm abstract composition rather than a picture of something.
    const bands = 2 + Math.floor(random() * 3);
    for (let b = 0; b < bands; b += 1) {
      const by = frame + (h - frame * 2) * (0.15 + random() * 0.7);
      const bh = (h - frame * 2) * (0.06 + random() * 0.18);
      const tone = [ink.brass, ink.leaf, ink.stoneDark, ink.woodLight][
        Math.floor(random() * 4)
      ]!;
      parts.push(
        rect(
          x + frame + panelW * 0.08,
          by,
          (panelW - frame * 2) * (0.4 + random() * 0.5),
          bh,
          tone,
          `opacity="${(0.35 + random() * 0.4).toFixed(2)}"`,
        ),
      );
    }
    parts.push(topLight(x, 0, panelW, frame * 0.5));
  }
  return parts.join("\n");
}

/* ------------------------------------------------------------------ *
 * Freestanding
 * ------------------------------------------------------------------ */

function speaker(w: number, h: number, floorStanding: boolean) {
  const drivers = floorStanding ? 3 : 2;
  const parts = [
    contactShadow(w / 2, h, w * 0.5, h * 0.025),
    roundRect(0, 0, w, h, w * 0.06, ink.body),
    topLight(0, 0, w, w * 0.04),
    rect(w * 0.08, h * 0.05, w * 0.84, h * 0.86, ink.bodyDark, 'opacity="0.7"'),
  ];
  for (let i = 0; i < drivers; i += 1) {
    const cy = h * (0.22 + (0.56 / Math.max(1, drivers - 1)) * i);
    const r = w * (i === drivers - 1 && floorStanding ? 0.3 : 0.22);
    parts.push(
      circle(w / 2, cy, r, ink.bodyDark),
      circle(w / 2, cy, r * 0.65, ink.metalDark, 'opacity="0.6"'),
      circle(w / 2, cy, r * 0.22, ink.metal, 'opacity="0.5"'),
    );
  }
  if (floorStanding) parts.push(rect(w * 0.1, h - h * 0.02, w * 0.8, h * 0.02, ink.metalDark));
  return parts.join("\n");
}

function plant(w: number, h: number, seed: string) {
  const random = rng(seed);
  const potH = h * 0.32;
  const potY = h - potH;
  const parts = [
    contactShadow(w / 2, h, w * 0.42, potH * 0.18),
    path(
      `M${w * 0.28} ${potY} L${w * 0.72} ${potY} L${w * 0.64} ${h} L${w * 0.36} ${h} Z`,
      ink.stoneDark,
    ),
    rect(w * 0.28, potY, w * 0.44, potH * 0.12, ink.stone),
  ];
  const leaves = 7 + Math.floor(random() * 5);
  for (let i = 0; i < leaves; i += 1) {
    const angle = -80 + (160 / leaves) * i + random() * 12;
    const len = (h - potH) * (0.45 + random() * 0.5);
    const rad = (angle * Math.PI) / 180;
    const tipX = w / 2 + Math.sin(rad) * len * 0.55;
    const tipY = potY - Math.cos(rad) * len;
    const midX = w / 2 + Math.sin(rad) * len * 0.22;
    const midY = potY - Math.cos(rad) * len * 0.55;
    const wide = w * (0.07 + random() * 0.05);
    parts.push(
      path(
        `M${w / 2} ${potY} Q${midX - wide} ${midY} ${tipX} ${tipY} Q${midX + wide} ${midY} ${w / 2} ${potY} Z`,
        i % 2 ? ink.leaf : ink.leafLight,
        'opacity="0.95"',
      ),
    );
  }
  return parts.join("\n");
}

/* ------------------------------------------------------------------ *
 * The full media wall
 * ------------------------------------------------------------------ */

function tvWall(w: number, h: number, seed: string) {
  const random = rng(seed);
  const baseH = h * 0.17;
  const recessW = w * 0.52;
  const recessH = h * 0.34;
  const recessX = (w - recessW) / 2;
  const recessY = h * 0.22;
  const parts = [
    contactShadow(w / 2, h, w * 0.48, baseH * 0.22),
    // Vertical slatted panelling across the whole wall.
    rect(0, 0, w, h - baseH * 0.2, ink.wood, 'opacity="0.95"'),
  ];
  const slats = Math.round(w / 11);
  for (let i = 1; i < slats; i += 1) {
    const x = (w / slats) * i;
    parts.push(line(x, 0, x, h - baseH * 0.2, ink.woodDark, 0.7, 0.55));
  }
  parts.push(
    // Recess for the screen.
    rect(recessX, recessY, recessW, recessH, ink.bodyDark),
    path(
      `M${recessX} ${recessY} L${recessX + recessW} ${recessY} L${recessX + recessW - 2} ${recessY + 2} L${recessX + 2} ${recessY + 2} Z`,
      "#ffffff",
      'opacity="0.1"',
    ),
    // A shelf above and open cubbies to one side.
    rect(w * 0.08, h * 0.12, w * 0.2, h * 0.012, ink.stone),
    rect(w * 0.72, h * 0.12, w * 0.2, h * 0.012, ink.stone),
  );
  for (let i = 0; i < 4; i += 1) {
    const x = w * 0.1 + i * w * 0.04;
    parts.push(
      rect(x, h * 0.12 - h * (0.03 + random() * 0.03), w * 0.022, h * (0.03 + random() * 0.03), ink.brass, 'opacity="0.75"'),
    );
  }
  parts.push(
    // Base unit.
    rect(0, h - baseH, w, baseH, ink.bodyDark),
    topLight(0, h - baseH, w),
    line(w * 0.33, h - baseH, w * 0.33, h, ink.body, 0.7, 0.9),
    line(w * 0.66, h - baseH, w * 0.66, h, ink.body, 0.7, 0.9),
    rect(w * 0.12, h - baseH * 0.55, w * 0.1, 1, ink.metal, 'opacity="0.8"'),
    rect(w * 0.45, h - baseH * 0.55, w * 0.1, 1, ink.metal, 'opacity="0.8"'),
    rect(w * 0.78, h - baseH * 0.55, w * 0.1, 1, ink.metal, 'opacity="0.8"'),
  );
  return parts.join("\n");
}

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

export function drawAsset(asset: LibraryAssetSeed): string {
  const { widthCm: w, heightCm: h, slug } = asset;
  let body: string;

  switch (asset.category) {
    case "TV":
      body = tv(w, h);
      break;
    case "TV_WALL":
      body = tvWall(w, h, slug);
      break;
    case "SIDEBOARD_WALL":
      body = sideboardWall(w, h);
      break;
    case "SIDEBOARD_FLOOR":
      body = sideboardFloor(w, h);
      break;
    case "FLOATING_SHELF":
      body = floatingShelf(w, h);
      break;
    case "NICHE":
      body = niche(w, h);
      break;
    case "HOME_BAR":
      body = homeBar(w, h, slug);
      break;
    case "BAR_COUNTER":
      body = barCounter(w, h);
      break;
    case "DRINKS_CABINET":
      body = drinksCabinet(w, h, slug);
      break;
    case "WINE_FRIDGE":
      body = wineFridge(w, h);
      break;
    case "BOOKCASE":
      body = bookcase(w, h, slug);
      break;
    case "FIREPLACE":
      body = fireplace(w, h);
      break;
    case "MIRROR":
      body = slug.includes("round") ? mirrorRound(w, h) : mirrorTall(w, h);
      break;
    case "WALL_ART":
      body = wallArt(w, h, slug.includes("triptych") ? 3 : 1, slug);
      break;
    case "SPEAKER":
      body = speaker(w, h, asset.snap === "FLOOR");
      break;
    case "PLANT":
      body = plant(w, h, slug);
      break;
    case "CABINET_LOW":
      body = cabinet(w, h, false);
      break;
    case "CABINET_TALL":
      body = cabinet(w, h, true);
      break;
    case "CONSOLE_TABLE":
      body = consoleTable(w, h);
      break;
    default:
      body = cabinet(w, h, false);
  }

  return svg(w, h, body, asset.name);
}
