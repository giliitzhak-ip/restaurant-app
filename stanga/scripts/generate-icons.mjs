/**
 * Generates the PWA icons as real PNG files, drawn from scratch with a tiny
 * encoder (node:zlib + PNG chunks). No binary assets are checked in that we
 * did not produce ourselves, and no image library is needed.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const INK = [13, 13, 15];
const CONCRETE = [43, 45, 50];
const ACCENT = [255, 165, 36];
const PAPER = [243, 245, 247];

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Draws the STANGA mark: a goal frame with a highlighted junction, on concrete. */
function drawIcon(size, padding) {
  const pixels = Buffer.alloc(size * size * 3);
  const set = (x, y, colour) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 3;
    pixels[offset] = colour[0];
    pixels[offset + 1] = colour[1];
    pixels[offset + 2] = colour[2];
  };

  // Background: vertical gradient from ink to concrete.
  for (let y = 0; y < size; y += 1) {
    const t = y / (size - 1);
    const colour = [
      Math.round(INK[0] + (CONCRETE[0] - INK[0]) * t),
      Math.round(INK[1] + (CONCRETE[1] - INK[1]) * t),
      Math.round(INK[2] + (CONCRETE[2] - INK[2]) * t),
    ];
    for (let x = 0; x < size; x += 1) set(x, y, colour);
  }

  const inner = size - padding * 2;
  const bar = Math.max(3, Math.round(inner * 0.085));
  const left = padding + Math.round(inner * 0.12);
  const right = size - padding - Math.round(inner * 0.12);
  const top = padding + Math.round(inner * 0.2);
  const bottom = size - padding - Math.round(inner * 0.16);

  const rect = (x0, y0, x1, y1, colour) => {
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) set(x, y, colour);
  };

  // Ground line.
  rect(padding, bottom, size - padding, bottom + Math.max(2, bar / 2), CONCRETE);

  // Posts and crossbar.
  rect(left, top, left + bar, bottom, PAPER);
  rect(right - bar, top, right, bottom, PAPER);
  rect(left, top, right, top + bar, PAPER);

  // Junctions in the accent colour — the five-point spot.
  const junction = Math.round(bar * 1.9);
  rect(left, top, left + junction, top + junction, ACCENT);
  rect(right - junction, top, right, top + junction, ACCENT);

  // Ball.
  const ballRadius = Math.round(inner * 0.11);
  const ballX = Math.round(size / 2);
  const ballY = bottom - ballRadius - Math.round(bar * 0.4);
  for (let y = -ballRadius; y <= ballRadius; y += 1) {
    for (let x = -ballRadius; x <= ballRadius; x += 1) {
      const distance = Math.sqrt(x * x + y * y);
      if (distance > ballRadius) continue;
      const shade = distance > ballRadius * 0.72 ? 0.78 : 1;
      set(ballX + x, ballY + y, [
        Math.round(PAPER[0] * shade),
        Math.round(PAPER[1] * shade),
        Math.round(PAPER[2] * shade),
      ]);
    }
  }

  return encodePng(size, size, pixels);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192.png', 192, 14],
  ['icon-512.png', 512, 38],
  // Maskable icons need a safe zone: everything important inside the inner 80%.
  ['icon-maskable-512.png', 512, 96],
  ['favicon.png', 64, 5],
];

for (const [name, size, padding] of targets) {
  writeFileSync(join(OUT_DIR, name), drawIcon(size, padding));
  console.log(`wrote icons/${name} (${size}x${size})`);
}
