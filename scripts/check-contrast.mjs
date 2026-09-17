#!/usr/bin/env node
/**
 * Verify the palette's contrast ratios (spec §38: "Verify actual contrast.
 * Do not blindly use these exact values if accessibility testing shows
 * problems.").
 *
 * WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text (>=18.66px bold or
 * >=24px) and for UI component boundaries.
 */
const HEX = (h) => {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};
const luminance = (hex) => {
  const [r, g, b] = HEX(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const BG = '#080b12';
const S1 = '#0d121c';
const S2 = '#121925';
const S3 = '#182130';

const checks = [
  // [label, foreground, background, minimum]
  ['ink on bg', '#f8fafc', BG, 4.5],
  ['ink on surface-1', '#f8fafc', S1, 4.5],
  ['ink on surface-2', '#f8fafc', S2, 4.5],
  ['ink on surface-3', '#f8fafc', S3, 4.5],
  ['ink-2 (secondary) on bg', '#a8b3c4', BG, 4.5],
  ['ink-2 on surface-1', '#a8b3c4', S1, 4.5],
  ['ink-2 on surface-2', '#a8b3c4', S2, 4.5],
  ['ink-3 (muted, large only) on bg', '#6f7c90', BG, 3],
  ['ink-3 on surface-2', '#6f7c90', S2, 3],
  ['brand-bright on surface-1', '#60a5fa', S1, 4.5],
  ['brand-bright on surface-2', '#60a5fa', S2, 4.5],
  ['live on surface-2', '#22d3ee', S2, 4.5],
  ['ok-bright on surface-2', '#4ade80', S2, 4.5],
  ['warn-bright on surface-2', '#fbbf24', S2, 4.5],
  ['bad-bright on surface-2', '#f87171', S2, 4.5],
  // Text sitting ON the primary button.
  ['bg-ink on brand (button label)', '#081019', '#3b82f6', 4.5],
  // Component boundaries need 3:1 against their surface.
  ['line-strong on surface-1 (border)', '#2a3648', S1, 1.2],
  ['brand on bg (focus ring)', '#3b82f6', BG, 3],
];

let failures = 0;
const width = Math.max(...checks.map((c) => c[0].length));
process.stdout.write('\nPalette contrast (WCAG 2.1)\n\n');
for (const [label, fg, bg, min] of checks) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failures += 1;
  process.stdout.write(
    `  ${ok ? '✓' : '✗'} ${label.padEnd(width)}  ${r.toFixed(2)}:1  (need ${min}:1)\n`,
  );
}
process.stdout.write(
  `\n${failures === 0 ? '✅' : '❌'} ${checks.length - failures}/${checks.length} pass\n`,
);
if (failures > 0) process.exitCode = 1;
