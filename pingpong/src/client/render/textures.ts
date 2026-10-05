import * as THREE from 'three';

/** All textures are drawn procedurally on canvases (original, no external assets). */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, srgb = true, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Seeded noise so textures look the same every load. */
function rand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function tableTopTexture(size: number): THREE.CanvasTexture {
  // Table is 2.74 x 1.525 m. Canvas maps u -> length (z), v -> width (x).
  const w = size;
  const h = Math.round(size * (1.525 / 2.74));
  const [c, g] = canvas(w, h);
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#174a82');
  grad.addColorStop(0.5, '#1b5592');
  grad.addColorStop(1, '#174a82');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const r = rand(7);
  g.globalAlpha = 0.05;
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() > 0.5 ? '#ffffff' : '#000000';
    g.fillRect(r() * w, r() * h, 1.5, 1.5);
  }
  g.globalAlpha = 1;
  const px = w / 2.74; // pixels per metre
  const line = 0.02 * px;
  g.fillStyle = '#f4f6f8';
  g.fillRect(0, 0, w, line);
  g.fillRect(0, h - line, w, line);
  g.fillRect(0, 0, line, h);
  g.fillRect(w - line, 0, line, h);
  // Centre line (3 mm, drawn slightly wider so it survives mip-mapping).
  g.fillRect(0, h / 2 - Math.max(1.5, 0.003 * px), w, Math.max(3, 0.006 * px));
  return tex(c);
}

export function woodFloorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const r = rand(11);
  const plankH = 64;
  for (let y = 0; y < 1024; y += plankH) {
    let x = -Math.floor(r() * 400);
    while (x < 1024) {
      const len = 300 + r() * 380;
      const base = 120 + r() * 40;
      g.fillStyle = `rgb(${base + 50}, ${base * 0.72 + 20}, ${base * 0.45})`;
      g.fillRect(x, y, len, plankH);
      g.globalAlpha = 0.18;
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = r() > 0.5 ? '#3a2412' : '#e0b98a';
        g.lineWidth = 0.6 + r() * 1.4;
        g.beginPath();
        const yy = y + r() * plankH;
        g.moveTo(x, yy);
        g.bezierCurveTo(x + len * 0.3, yy + (r() - 0.5) * 8, x + len * 0.7, yy + (r() - 0.5) * 8, x + len, yy + (r() - 0.5) * 4);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(30,18,8,0.55)';
      g.fillRect(x, y, 2, plankH);
      x += len;
    }
    g.fillStyle = 'rgba(30,18,8,0.6)';
    g.fillRect(0, y, 1024, 2);
  }
  return tex(c, true, [6, 6]);
}

export function courtMatTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#7a2230';
  g.fillRect(0, 0, 512, 512);
  const r = rand(5);
  g.globalAlpha = 0.07;
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = r() > 0.5 ? '#ffffff' : '#000000';
    g.fillRect(r() * 512, r() * 512, 2, 2);
  }
  return tex(c, true, [4, 3]);
}

export function netTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  g.clearRect(0, 0, 256, 64);
  g.strokeStyle = 'rgba(25,25,30,0.95)';
  g.lineWidth = 1.4;
  const cell = 8;
  for (let x = 0; x <= 256; x += cell) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 64);
    g.stroke();
  }
  for (let y = 0; y <= 64; y += cell) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
  }
  const t = tex(c, true, [12, 1]);
  return t;
}

export function barrierTexture(text: string, accent: string): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#16224a');
  grad.addColorStop(1, '#0d1533');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = accent;
  g.fillRect(0, 108, 1024, 8);
  g.font = 'bold 58px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.fillText(text, 512, 58);
  return tex(c);
}

export function wallTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1c2433');
  grad.addColorStop(0.55, '#2a3550');
  grad.addColorStop(1, '#3a4766');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 2;
  for (let x = 0; x < 512; x += 64) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 256);
    g.stroke();
  }
  g.fillStyle = 'rgba(80,170,255,0.18)';
  g.fillRect(0, 150, 512, 6);
  return tex(c, true, [6, 1]);
}

export function blobTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.4)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return tex(c, false);
}

export function glowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,240,200,0.55)');
  grad.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return tex(c, false);
}

export function ringTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  return tex(c, false);
}
