import { deflateSync } from "node:zlib";

/** Minimal RGBA raster with helpers the generators need. */
export class Raster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  set(x: number, y: number, r: number, g: number, b: number, a = 255) {
    const i = (y * this.width + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  /** Bilinear sample with wrap-around — used for seamless tiling. */
  sampleWrap(u: number, v: number): [number, number, number] {
    const fx = u * this.width - 0.5;
    const fy = v * this.height - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const wrap = (value: number, max: number) => ((value % max) + max) % max;
    const x1 = wrap(x0 + 1, this.width);
    const y1 = wrap(y0 + 1, this.height);
    const xa = wrap(x0, this.width);
    const ya = wrap(y0, this.height);

    const at = (x: number, y: number) => (y * this.width + x) * 4;
    const i00 = at(xa, ya);
    const i10 = at(x1, ya);
    const i01 = at(xa, y1);
    const i11 = at(x1, y1);
    const d = this.data;

    const mix = (o: number) => {
      const top = d[i00 + o]! * (1 - tx) + d[i10 + o]! * tx;
      const bottom = d[i01 + o]! * (1 - tx) + d[i11 + o]! * tx;
      return top * (1 - ty) + bottom * ty;
    };

    return [mix(0), mix(1), mix(2)];
  }
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

/** Encodes a raster as an 8-bit RGB PNG (alpha is dropped — every asset is opaque). */
export function encodePng(raster: Raster, level = 6): Buffer {
  const { width, height, data } = raster;
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    // Filter type 1 (Sub) compresses smooth gradients far better than none.
    raw[rowStart] = 1;
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 4;
      const dst = rowStart + 1 + x * 3;
      for (let c = 0; c < 3; c += 1) {
        const current = data[src + c]!;
        const left = x === 0 ? 0 : data[src - 4 + c]!;
        raw[dst + c] = (current - left) & 0xff;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Box-downsamples a raster to the requested width, keeping the aspect ratio. */
export function resize(source: Raster, width: number): Raster {
  const height = Math.max(1, Math.round((source.height / source.width) * width));
  const out = new Raster(width, height);
  const sx = source.width / width;
  const sy = source.height / height;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      const x0 = Math.floor(x * sx);
      const x1 = Math.min(source.width, Math.ceil((x + 1) * sx));
      const y0 = Math.floor(y * sy);
      const y1 = Math.min(source.height, Math.ceil((y + 1) * sy));
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const i = (yy * source.width + xx) * 4;
          r += source.data[i]!;
          g += source.data[i + 1]!;
          b += source.data[i + 2]!;
          n += 1;
        }
      }
      out.set(x, y, r / n, g / n, b / n);
    }
  }
  return out;
}
