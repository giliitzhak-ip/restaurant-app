/**
 * Every texture in STANGA is drawn at runtime with the 2D canvas API.
 * No external art assets, nothing with unclear licensing, nothing to download.
 */
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';
import { Rng } from '../core/Rng';

function createCanvasTexture(
  name: string,
  size: number,
  scene: Scene,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
): DynamicTexture {
  const texture = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  draw(ctx, size);
  texture.update(false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

function speckle(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: Rng,
  count: number,
  minRadius: number,
  maxRadius: number,
  colors: readonly string[],
): void {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = rng.pick(colors);
    ctx.beginPath();
    ctx.arc(rng.next() * size, rng.next() * size, rng.range(minRadius, maxRadius), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Worn asphalt with aggregate grain and faint tyre streaks. */
export function createAsphaltTexture(scene: Scene, size = 1024): DynamicTexture {
  return createCanvasTexture('asphalt', size, scene, (ctx) => {
    const rng = new Rng(0x5747d1);
    ctx.fillStyle = '#42444a';
    ctx.fillRect(0, 0, size, size);

    speckle(ctx, size, rng, 5200, 0.7, 2.6, [
      '#3a3c42',
      '#4b4d54',
      '#53555d',
      '#35373c',
      '#5b5d66',
    ]);

    // Damp patches for variation.
    for (let i = 0; i < 26; i += 1) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      const radius = rng.range(size * 0.04, size * 0.16);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(28,29,33,0.30)');
      gradient.addColorStop(1, 'rgba(28,29,33,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    // Hairline cracks.
    ctx.strokeStyle = 'rgba(24,25,28,0.55)';
    for (let i = 0; i < 18; i += 1) {
      ctx.lineWidth = rng.range(0.6, 1.8);
      ctx.beginPath();
      let x = rng.next() * size;
      let y = rng.next() * size;
      ctx.moveTo(x, y);
      for (let segment = 0; segment < 7; segment += 1) {
        x += rng.jitter(size * 0.07);
        y += rng.jitter(size * 0.07);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

/** Bump map matching the asphalt grain, so the pitch catches the light. */
export function createAsphaltBumpTexture(scene: Scene, size = 512): DynamicTexture {
  return createCanvasTexture('asphaltBump', size, scene, (ctx) => {
    const rng = new Rng(0x2f91aa);
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, rng, 2600, 0.8, 2.4, ['#7a7aff', '#8a8aff', '#7474f5', '#9090ff']);
  });
}

/**
 * The metallic-roughness map a PBR surface wants, in the glTF packing that
 * Babylon expects: green is roughness, blue is metallic, red is unused.
 *
 * Asphalt is dielectric and mostly rough, but not uniformly so — the polished
 * lanes where a ball has been rolling for years are visibly smoother than the
 * open grain, and that variation is most of what makes it read as a surface
 * rather than a flat colour.
 */
export function createAsphaltRoughnessTexture(scene: Scene, size = 512): DynamicTexture {
  return createCanvasTexture('asphaltRoughness', size, scene, (ctx) => {
    const rng = new Rng(0x41b7c3);
    // Green 0xdc ≈ 0.86 roughness: coarse, dry asphalt.
    ctx.fillStyle = '#00dc00';
    ctx.fillRect(0, 0, size, size);
    // Worn-smooth patches.
    for (let i = 0; i < 30; i += 1) {
      const radius = rng.range(size * 0.04, size * 0.16);
      const gradient = ctx.createRadialGradient(
        rng.next() * size,
        rng.next() * size,
        0,
        rng.next() * size,
        rng.next() * size,
        radius,
      );
      gradient.addColorStop(0, 'rgba(0, 150, 0, 0.55)');
      gradient.addColorStop(1, 'rgba(0, 150, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
    speckle(ctx, size, rng, 1400, 0.6, 2, ['#00e800', '#00cc00', '#00f000', '#00d400']);
  });
}

/** Painted street-pitch markings on a transparent layer laid over the asphalt. */
export function createLineTexture(scene: Scene, aspect: number, size = 1024): DynamicTexture {
  return createCanvasTexture('pitchLines', size, scene, (ctx) => {
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(236,238,241,0.72)';
    ctx.lineWidth = size * 0.007;

    const marginX = size * 0.05;
    const marginY = size * 0.05;
    ctx.strokeRect(marginX, marginY, size - marginX * 2, size - marginY * 2);

    // Halfway line.
    ctx.beginPath();
    ctx.moveTo(marginX, size / 2);
    ctx.lineTo(size - marginX, size / 2);
    ctx.stroke();

    // Centre circle, squashed to stay round once the texture is stretched.
    ctx.beginPath();
    ctx.ellipse(size / 2, size / 2, size * 0.11 * aspect, size * 0.11, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.009, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(236,238,241,0.8)';
    ctx.fill();

    // Goal areas.
    const areaWidth = size * 0.34;
    const areaDepth = size * 0.1;
    ctx.strokeRect(size / 2 - areaWidth / 2, marginY, areaWidth, areaDepth);
    ctx.strokeRect(size / 2 - areaWidth / 2, size - marginY - areaDepth, areaWidth, areaDepth);
  });
}

/** Poured concrete for the perimeter walls, with a painted stripe and scuffs. */
export function createConcreteTexture(scene: Scene, size = 512): DynamicTexture {
  return createCanvasTexture('concrete', size, scene, (ctx) => {
    const rng = new Rng(0x77c0de);
    ctx.fillStyle = '#9a9a96';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, rng, 2400, 0.8, 3, ['#8f8f8b', '#a5a5a0', '#868682', '#adada8']);

    // Formwork seams.
    ctx.strokeStyle = 'rgba(96,96,92,0.5)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i += 1) {
      const x = (size / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }

    // Street paint stripe.
    ctx.fillStyle = '#f0a222';
    ctx.fillRect(0, size * 0.62, size, size * 0.09);
    ctx.fillStyle = 'rgba(120,120,116,0.25)';
    for (let i = 0; i < 40; i += 1) {
      ctx.fillRect(rng.next() * size, size * 0.62, rng.range(2, 14), size * 0.09);
    }

    // Grime along the bottom.
    const gradient = ctx.createLinearGradient(0, size * 0.8, 0, size);
    gradient.addColorStop(0, 'rgba(60,60,58,0)');
    gradient.addColorStop(1, 'rgba(48,48,46,0.55)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, size * 0.8, size, size * 0.2);
  });
}

/** Chain-link fence: opaque where the wire is, transparent between the links. */
export function createFenceTexture(scene: Scene, size = 256): DynamicTexture {
  const texture = createCanvasTexture('fence', size, scene, (ctx) => {
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(176,180,186,0.92)';
    ctx.lineWidth = size * 0.016;
    const step = size / 8;
    for (let i = -8; i < 16; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step + size, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * step, size);
      ctx.lineTo(i * step + size, 0);
      ctx.stroke();
    }
  });
  texture.hasAlpha = true;
  return texture;
}

/** Goal net: a fine mesh with alpha, drawn as a diamond grid. */
export function createNetTexture(scene: Scene, size = 256): DynamicTexture {
  const texture = createCanvasTexture('net', size, scene, (ctx) => {
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(244,246,248,0.85)';
    ctx.lineWidth = size * 0.008;
    const step = size / 12;
    for (let i = -12; i < 24; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step + size, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * step, size);
      ctx.lineTo(i * step + size, 0);
      ctx.stroke();
    }
  });
  texture.hasAlpha = true;
  return texture;
}

/** Apartment block facade with lit and dark windows. */
export function createBuildingTexture(scene: Scene, seed: number, size = 512): DynamicTexture {
  return createCanvasTexture(`building-${seed}`, size, scene, (ctx) => {
    const rng = new Rng(seed);
    const base = rng.pick(['#8d8378', '#7d7a74', '#9a8e80', '#6f6f6e', '#a09284']);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, rng, 900, 1, 3, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.06)']);

    const cols = 5;
    const rows = 7;
    const marginX = size * 0.09;
    const marginY = size * 0.07;
    const cellW = (size - marginX * 2) / cols;
    const cellH = (size - marginY * 2) / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = marginX + col * cellW + cellW * 0.18;
        const y = marginY + row * cellH + cellH * 0.16;
        const w = cellW * 0.64;
        const h = cellH * 0.6;
        const lit = rng.chance(0.32);
        ctx.fillStyle = lit ? rng.pick(['#f4d79a', '#ffe9b8', '#e8c887']) : '#2f3238';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(30,30,30,0.35)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
        // Balcony rail under some windows.
        if (rng.chance(0.35)) {
          ctx.fillStyle = 'rgba(60,60,60,0.45)';
          ctx.fillRect(x - w * 0.12, y + h, w * 1.24, h * 0.12);
        }
      }
    }
  });
}

/** Vertical sky gradient for the dome. */
export function createSkyTexture(scene: Scene, size = 512): DynamicTexture {
  const texture = createCanvasTexture('sky', size, scene, (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, '#1b2233');
    gradient.addColorStop(0.42, '#42506b');
    gradient.addColorStop(0.72, '#9aa2ab');
    gradient.addColorStop(1, '#d8c2a2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Soft clouds.
    const rng = new Rng(0x1234abcd);
    for (let i = 0; i < 40; i += 1) {
      const x = rng.next() * size;
      const y = rng.range(size * 0.2, size * 0.6);
      const radius = rng.range(size * 0.03, size * 0.12);
      const cloud = ctx.createRadialGradient(x, y, 0, x, y, radius);
      cloud.addColorStop(0, 'rgba(228,232,238,0.22)');
      cloud.addColorStop(1, 'rgba(228,232,238,0)');
      ctx.fillStyle = cloud;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  });
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return texture;
}

/** Classic black-and-white football panels. */
export function createBallTexture(scene: Scene, size = 512): DynamicTexture {
  return createCanvasTexture('ball', size, scene, (ctx) => {
    ctx.fillStyle = '#f2f3f5';
    ctx.fillRect(0, 0, size, size);

    const drawPatch = (cx: number, cy: number, radius: number, rotation: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#17181c';
      ctx.fill();
      ctx.restore();
    };

    const radius = size * 0.085;
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        const offset = row % 2 === 0 ? 0 : size / 12;
        drawPatch(
          (col * size) / 6 + offset + size / 12,
          (row * size) / 4 + size / 8,
          radius,
          (row + col) * 0.7,
        );
      }
    }

    // Seam shading.
    ctx.strokeStyle = 'rgba(110,112,118,0.35)';
    ctx.lineWidth = size * 0.006;
    for (let i = 1; i < 6; i += 1) {
      ctx.beginPath();
      ctx.moveTo((i * size) / 6, 0);
      ctx.lineTo((i * size) / 6, size);
      ctx.stroke();
    }
  });
}

export type KitPattern = 'solid' | 'stripes' | 'sash' | 'hoops';

/**
 * Team kit. Each kit carries a distinct PATTERN as well as a distinct colour, so
 * the two sides stay tellable apart without relying on colour vision.
 */
export function createKitTexture(
  scene: Scene,
  shirt: string,
  trim: string,
  pattern: KitPattern,
  size = 256,
): DynamicTexture {
  return createCanvasTexture(`kit-${shirt}-${pattern}`, size, scene, (ctx) => {
    ctx.fillStyle = shirt;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = trim;

    switch (pattern) {
      case 'solid':
        // A single broad chest band still reads at a distance.
        ctx.fillRect(0, size * 0.42, size, size * 0.1);
        break;
      case 'stripes':
        for (let i = 0; i < 5; i += 1) {
          ctx.fillRect(size * (0.08 + i * 0.19), 0, size * 0.08, size);
        }
        break;
      case 'sash':
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.rotate(-Math.PI / 5);
        ctx.fillRect(-size, -size * 0.09, size * 2, size * 0.18);
        ctx.restore();
        break;
      case 'hoops':
        for (let i = 0; i < 4; i += 1) {
          ctx.fillRect(0, size * (0.12 + i * 0.22), size, size * 0.09);
        }
        break;
    }

    // Shadow under the hem, so the torso does not read as flat.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, size * 0.82, size, size * 0.18);
  });
}
