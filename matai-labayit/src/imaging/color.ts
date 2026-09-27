// כלי צבע: המרות, צבעים משלימים ודגימה.
export type RGB = { r: number; g: number; b: number };

const clamp = (v: number, a = 0, b = 255) => Math.max(a, Math.min(b, v));

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 200, g: 200, b: 200 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const h = (v: number) => Math.round(clamp(v)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function rgbToHsl({ r, g, b }: RGB) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export const hslHex = (h: number, s: number, l: number) => rgbToHex(hslToRgb(h, s, l));

/** בהירות יחסית (0..1) – משמשת לשמירת צללים. */
export const luma = ({ r, g, b }: RGB) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/** האם להשתמש בטקסט כהה או בהיר מעל הצבע (לנגישות). */
export const readableOn = (hex: string) => (luma(hexToRgb(hex)) > 0.55 ? '#1E1C19' : '#FFFFFF');

export type Harmony = { label: string; colors: string[] };

/** צבעים משלימים לפי גלגל הצבעים, מותאמים לעיצוב פנים (רוויה מתונה). */
export function harmonies(hex: string): Harmony[] {
  const { h, s, l } = rgbToHsl(hexToRgb(hex));
  const soft = Math.min(s, 0.55);
  const L = (v: number) => Math.max(0.12, Math.min(0.92, v));
  return [
    { label: 'משלים', colors: [hslHex(h + 180, soft, L(l)), hslHex(h + 180, soft * 0.7, L(l + 0.15))] },
    { label: 'אנלוגי', colors: [hslHex(h - 30, soft, L(l)), hslHex(h + 30, soft, L(l))] },
    { label: 'טריאדי', colors: [hslHex(h + 120, soft, L(l)), hslHex(h + 240, soft, L(l))] },
    { label: 'גוונים', colors: [hslHex(h, s, L(l - 0.18)), hslHex(h, s * 0.8, L(l + 0.18)), hslHex(h, s * 0.35, L(0.9))] },
  ];
}

/** פלטת צבעי קיר פופולריים. */
export const WALL_PALETTE = [
  '#F4F1EA', '#EDE6DA', '#E4D9C6', '#D8CBB3', '#C9B79C', '#B8A58A',
  '#E8E4DC', '#D5D3CC', '#BDBDB7', '#8F9290', '#5E6462', '#3B403F',
  '#DDE5DC', '#BFCDBE', '#9DB29C', '#6F8A73', '#4A6352', '#2E4A3D',
  '#DCE4EA', '#B9C9D6', '#8FA9BE', '#5E7C96', '#3E566C', '#243646',
  '#F2DDD3', '#E6C1B0', '#D49C85', '#B87561', '#8E5443', '#5E3A2F',
  '#F3E6C4', '#E9D28E', '#D9B45C', '#B98E3A', '#1E1C19', '#FFFFFF',
];

/** דגימת צבע ממוצע בסביבת נקודה. */
export function sampleColor(data: Uint8Array, width: number, height: number, x: number, y: number, r = 3): RGB {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let yy = Math.max(0, cy - r); yy <= Math.min(height - 1, cy + r); yy++) {
    for (let xx = Math.max(0, cx - r); xx <= Math.min(width - 1, cx + r); xx++) {
      const i = (yy * width + xx) * 4;
      sr += data[i];
      sg += data[i + 1];
      sb += data[i + 2];
      n++;
    }
  }
  return n ? { r: sr / n, g: sg / n, b: sb / n } : { r: 128, g: 128, b: 128 };
}

export const TEMPERATURE_COLORS = {
  warm: '#FFB870',
  neutral: '#FFF2DE',
  cool: '#CFE2FF',
} as const;

export const TEMPERATURE_LABELS = { warm: 'חם', neutral: 'ניטרלי', cool: 'קר' } as const;
