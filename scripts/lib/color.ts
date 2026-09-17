export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function shade(color: Rgb, amount: number): Rgb {
  // amount > 0 lightens towards white, < 0 darkens towards black.
  return amount >= 0
    ? mix(color, [255, 255, 255], amount)
    : mix(color, [0, 0, 0], -amount);
}

export function luminance(color: Rgb) {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
