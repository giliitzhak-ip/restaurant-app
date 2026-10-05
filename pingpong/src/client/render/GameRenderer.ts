import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BALL, TABLE, type Side } from '../../shared/constants';
import type { GameEvent } from '../../shared/game';
import type { V3 } from '../../shared/vec';
import type { Quality } from '../settings';
import { buildHall, type HallObjects } from './scene';
import { blobTexture, glowTexture, ringTexture } from './textures';

export interface PadView {
  p: V3;
  tilt: number;
  spin: number;
  vx: number;
}

export interface RenderView {
  mySide: Side;
  ball: V3;
  ballVisible: boolean;
  pads: [PadView, PadView];
  styles: [string, string];
}

interface Preset {
  antialias: boolean;
  shadows: boolean;
  shadowSize: number;
  maxPixelRatio: number;
  env: boolean;
  spotsCast: boolean;
  highDetail: boolean;
}

const PRESETS: Record<Quality, Preset> = {
  low: { antialias: false, shadows: false, shadowSize: 512, maxPixelRatio: 0.85, env: false, spotsCast: false, highDetail: false },
  medium: { antialias: true, shadows: true, shadowSize: 1024, maxPixelRatio: 1.25, env: false, spotsCast: false, highDetail: false },
  high: { antialias: true, shadows: true, shadowSize: 2048, maxPixelRatio: 1.75, env: true, spotsCast: false, highDetail: true },
  // Ultra renders up to 3840x2160 (true 4K on 4K displays, supersampled 4K on 1080p-class ones).
  ultra: { antialias: true, shadows: true, shadowSize: 4096, maxPixelRatio: 2, env: true, spotsCast: true, highDetail: true },
};

const MAX_4K = { w: 3840, h: 2160 };

export const PADDLE_COLORS: Record<string, number> = {
  red: 0xd0202a,
  blue: 0x1f5fe0,
  black: 0x1c1c1f,
  green: 0x1c9a4a,
  purple: 0x7a3bd0,
  gold: 0xd9a520,
};

function makePaddle(style: string): { outer: THREE.Group; inner: THREE.Group; setStyle: (s: string) => void } {
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  outer.add(inner);
  // Blade: slightly oval disc whose axis points along local -z (the hitting face).
  const bladeGeo = new THREE.CylinderGeometry(0.076, 0.076, 0.0065, 48);
  bladeGeo.rotateX(Math.PI / 2);
  bladeGeo.scale(1, 1.06, 1);
  const wood = new THREE.MeshStandardMaterial({ color: 0xc89a5e, roughness: 0.6 });
  const blade = new THREE.Mesh(bladeGeo, wood);
  blade.castShadow = true;
  inner.add(blade);
  const rubberGeo = new THREE.CylinderGeometry(0.074, 0.074, 0.002, 48);
  rubberGeo.rotateX(Math.PI / 2);
  rubberGeo.scale(1, 1.06, 1);
  const front = new THREE.MeshStandardMaterial({ color: PADDLE_COLORS[style] ?? PADDLE_COLORS.red, roughness: 0.55 });
  const back = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.6 });
  const f = new THREE.Mesh(rubberGeo, front);
  f.position.z = -0.0042;
  const b = new THREE.Mesh(rubberGeo, back);
  b.position.z = 0.0042;
  f.castShadow = true;
  inner.add(f, b);
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, 0.1, 0.024),
    new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.5 }),
  );
  handle.position.y = -0.125;
  handle.castShadow = true;
  inner.add(handle);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.026), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  cap.position.y = -0.178;
  inner.add(cap);
  return {
    outer,
    inner,
    setStyle: (s: string) => {
      // The player sees the back rubber, so both sides carry the chosen colour
      // (the "black" paddle keeps the classic red/black pair).
      const c = PADDLE_COLORS[s] ?? PADDLE_COLORS.red;
      front.color.setHex(c);
      back.color.setHex(s === 'black' ? 0xc0182a : new THREE.Color(c).multiplyScalar(0.8).getHex());
    },
  };
}

export class GameRenderer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 80);
  private renderer!: THREE.WebGLRenderer;
  private canvas!: HTMLCanvasElement;
  private hall: HallObjects | null = null;
  private preset: Preset;
  private quality: Quality;
  private envTex: THREE.Texture | null = null;

  private ball: THREE.Mesh;
  private glow: THREE.Sprite;
  private blob: THREE.Mesh;
  private trail: THREE.Mesh;
  private trailPts: THREE.Vector3[] = [];
  private trailPos: Float32Array;
  private trailCol: Float32Array;
  private paddles: ReturnType<typeof makePaddle>[];
  private rings: { m: THREE.Mesh; t: number }[] = [];
  private flash = 0;
  private styles: [string, string] = ['', ''];
  private side: Side = 0;
  private camX = 0;
  private rolls: [number, number] = [0, 0];

  private dynScale = 1;
  private frameEma = 1 / 60;
  private sinceAdjust = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  fps = 0;
  reduceEffects = false;
  /** player: behind your end (gameplay) · tv: high broadcast · side: courtside · top: overhead. */
  cameraMode: 'player' | 'tv' | 'side' | 'top' = 'player';
  dynamicRes = true;

  constructor(
    private container: HTMLElement,
    quality: Quality,
  ) {
    this.quality = quality;
    this.preset = PRESETS[quality];
    this.scene.background = new THREE.Color(0x0b0f18);
    this.scene.fog = new THREE.Fog(0x0b0f18, 14, 34);
    this.createRenderer();
    this.buildWorld();

    // Ball: bright, slightly emissive so it reads against the dark hall and the blue top.
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL.radius, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xfffaf0, emissive: 0xffd9a0, emissiveIntensity: 0.35, roughness: 0.35 }),
    );
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff1d0, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.glow.scale.setScalar(0.085);
    this.scene.add(this.glow);
    const blobGeo = new THREE.PlaneGeometry(1, 1);
    blobGeo.rotateX(-Math.PI / 2);
    this.blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
    this.blob.renderOrder = 1;
    this.scene.add(this.blob);

    // Trail: camera-facing ribbon through the last positions, fading out.
    const N = 16;
    this.trailPos = new Float32Array(N * 2 * 3);
    this.trailCol = new Float32Array(N * 2 * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setIndex(idx);
    this.trail = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);

    this.paddles = [makePaddle('red'), makePaddle('blue')];
    for (const p of this.paddles) this.scene.add(p.outer);
  }

  get domElement(): HTMLCanvasElement {
    return this.canvas;
  }

  private createRenderer(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.container.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.preset.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.preset.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    if (this.preset.env) {
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    } else this.envTex = null;
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.35;
    this.resize();
  }

  private buildWorld(): void {
    if (this.hall) {
      this.scene.remove(this.hall.root);
      this.hall.root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            (m as THREE.MeshStandardMaterial).map?.dispose();
            m.dispose();
          }
        }
      });
    }
    this.hall = buildHall(this.preset.highDetail);
    const p = this.preset;
    this.hall.sun.castShadow = p.shadows;
    this.hall.sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
    for (const s of this.hall.spots) {
      s.castShadow = p.spotsCast;
      s.shadow.mapSize.set(1024, 1024);
    }
    this.scene.add(this.hall.root);
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    const prev = this.preset;
    this.quality = q;
    this.preset = PRESETS[q];
    this.dynScale = 1;
    if (prev.antialias !== this.preset.antialias || prev.env !== this.preset.env) {
      // Context attributes are fixed at creation: rebuild the WebGL context.
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.canvas.remove();
      this.createRenderer();
    }
    this.renderer.shadowMap.enabled = this.preset.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    if (prev.highDetail !== this.preset.highDetail || prev.shadowSize !== this.preset.shadowSize || prev.spotsCast !== this.preset.spotsCast) {
      this.buildWorld();
    }
    this.resize();
  }

  private basePixelRatio(): number {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    let pr = Math.min(window.devicePixelRatio || 1, this.preset.maxPixelRatio);
    if (this.quality === 'ultra') pr = this.preset.maxPixelRatio;
    // Never exceed a 3840x2160 drawing buffer.
    pr = Math.min(pr, MAX_4K.w / w, MAX_4K.h / h);
    return Math.max(0.35, pr);
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(this.basePixelRatio() * this.dynScale);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = w / h;
    // Keep the whole table width (plus room for the paddle) visible on narrow screens.
    const halfW = 1.35;
    const dist = 1.6;
    const vfovForWidth = 2 * Math.atan(Math.tan(Math.atan(halfW / dist)) / this.camera.aspect) * (180 / Math.PI);
    this.camera.fov = Math.min(75, Math.max(48, vfovForWidth));
    this.camera.updateProjectionMatrix();
  }

  /** Drawing-buffer size actually rendered. */
  get renderSize(): { w: number; h: number; pr: number } {
    const v = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(v);
    return { w: v.x, h: v.y, pr: this.renderer.getPixelRatio() };
  }

  /** Map a pointer position (NDC -1..1) onto the vertical plane z = planeZ. */
  project(ndcX: number, ndcY: number, planeZ: number): { x: number; y: number } | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeZ);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.y } : null;
  }

  /** Screen position (CSS px) of a world point — used by automated browser tests. */
  screenOf(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.container.clientWidth, y: ((1 - v.y) / 2) * this.container.clientHeight };
  }

  /** Visual feedback for game events (bounce rings, hit flash). */
  onEvent(e: GameEvent): void {
    if (this.reduceEffects) return;
    if (e.k === 'table') {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: ringTex(), transparent: true, depthWrite: false, opacity: 0.8, color: 0xbfe6ff }),
      );
      m.position.set(e.x, TABLE.height + 0.002, e.z);
      m.renderOrder = 2;
      this.scene.add(m);
      this.rings.push({ m, t: 0 });
    } else if (e.k === 'hit') {
      this.flash = Math.min(1, 0.4 + e.power);
    }
  }

  render(view: RenderView, dt: number): void {
    this.updateDynamicResolution(dt);
    if (view.mySide !== this.side) {
      this.side = view.mySide;
      this.trailPts = [];
    }
    for (const s of [0, 1] as const) {
      if (view.styles[s] !== this.styles[s]) {
        this.styles[s] = view.styles[s];
        this.paddles[s].setStyle(view.styles[s]);
      }
      this.placePaddle(s, view.pads[s], view.ball, dt);
    }

    // Camera: behind my end, gently following my paddle sideways; stable during a point.
    const sgn = view.mySide === 0 ? 1 : -1;
    const follow = this.reduceEffects ? 0 : view.pads[view.mySide].p.x * 0.16;
    this.camX += (follow - this.camX) * Math.min(1, dt * 2.5);
    switch (this.cameraMode) {
      case 'tv':
        this.camera.position.set(0, 3.1, sgn * 5.0);
        this.camera.lookAt(0, TABLE.height - 0.1, -sgn * 0.2);
        break;
      case 'side':
        this.camera.position.set(3.3, 1.75, 0);
        this.camera.lookAt(0, TABLE.height + 0.05, 0);
        break;
      case 'top':
        this.camera.position.set(0, 5.2, sgn * 0.9);
        this.camera.lookAt(0, TABLE.height, 0);
        break;
      default:
        this.camera.position.set(this.camX, 1.62, sgn * 3.0);
        this.camera.lookAt(this.camX * 0.4, TABLE.height + 0.02, -sgn * 0.55);
    }

    // Ball.
    const b = view.ball;
    this.ball.visible = view.ballVisible;
    this.ball.position.set(b.x, b.y, b.z);
    // Keep the ball at least ~5 px on screen so it never vanishes at low resolutions.
    const dist = this.camera.position.distanceTo(this.ball.position);
    const pxPerM = this.renderSize.h / (2 * dist * Math.tan((this.camera.fov * Math.PI) / 360));
    const px = BALL.radius * 2 * pxPerM;
    const minPx = 5 * this.renderer.getPixelRatio();
    this.ball.scale.setScalar(px < minPx ? minPx / px : 1);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.glow.visible = view.ballVisible;
    this.glow.position.copy(this.ball.position);
    this.glow.scale.setScalar(0.085 * this.ball.scale.x * (1 + this.flash * 0.8));
    (this.glow.material as THREE.SpriteMaterial).opacity = 0.32 + this.flash * 0.4;

    // Blob shadow on the table or the floor directly below the ball.
    const overTable = Math.abs(b.x) <= TABLE.halfW && Math.abs(b.z) <= TABLE.halfL && b.y >= TABLE.height;
    const groundY = overTable ? TABLE.height + 0.001 : 0.006;
    const hgt = Math.max(0, b.y - groundY);
    this.blob.visible = view.ballVisible;
    this.blob.position.set(b.x, groundY, b.z);
    const sz = 0.05 + hgt * 0.06;
    this.blob.scale.set(sz, 1, sz);
    (this.blob.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 0.75 - hgt * 0.9);

    this.updateTrail(view, dt);

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / 0.4;
      r.m.scale.setScalar(0.04 + k * 0.16);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      if (k >= 1) {
        this.scene.remove(r.m);
        r.m.geometry.dispose();
        (r.m.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);

    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
  }

  private placePaddle(s: Side, pv: PadView, ball: V3, dt: number): void {
    const { outer, inner } = this.paddles[s];
    outer.position.set(pv.p.x, pv.p.y, pv.p.z);
    outer.rotation.y = s === 0 ? 0 : Math.PI;
    // Forehand when the ball is on the player's right, backhand on the left.
    const right = s === 0 ? ball.x > pv.p.x - 0.05 : ball.x < pv.p.x + 0.05;
    const targetRoll = right ? -0.55 : 0.55;
    this.rolls[s] += (targetRoll - this.rolls[s]) * Math.min(1, dt * 8);
    inner.rotation.set(pv.tilt * 0.45 - pv.spin * 0.12, (s === 0 ? -1 : 1) * pv.vx * 0.04, this.rolls[s], 'XYZ');
  }

  private updateTrail(view: RenderView, dt: number): void {
    const N = this.trailPos.length / 6;
    const cur = new THREE.Vector3(view.ball.x, view.ball.y, view.ball.z);
    const last = this.trailPts[0];
    if (!view.ballVisible || this.reduceEffects || (last && last.distanceTo(cur) > 0.6)) this.trailPts = [];
    if (view.ballVisible && !this.reduceEffects && dt > 0) {
      this.trailPts.unshift(cur);
      if (this.trailPts.length > N) this.trailPts.length = N;
    }
    const pts = this.trailPts;
    const camPos = this.camera.position;
    for (let i = 0; i < N; i++) {
      const p = pts[Math.min(i, pts.length - 1)] ?? cur;
      const q = pts[Math.min(i + 1, pts.length - 1)] ?? p;
      const tan = new THREE.Vector3().subVectors(p, q);
      if (tan.lengthSq() < 1e-10) tan.set(0, 0, 1);
      const toCam = new THREE.Vector3().subVectors(camPos, p);
      const side = new THREE.Vector3().crossVectors(tan, toCam).normalize();
      const k = i / (N - 1);
      const w = BALL.radius * 0.9 * (1 - k) * this.ball.scale.x;
      const a = i < pts.length - 1 ? 0.55 * (1 - k) * (1 - k) : 0;
      for (const [j, sg] of [[0, 1], [1, -1]] as const) {
        const o = (i * 2 + j) * 3;
        this.trailPos[o] = p.x + side.x * w * sg;
        this.trailPos[o + 1] = p.y + side.y * w * sg;
        this.trailPos[o + 2] = p.z + side.z * w * sg;
        const c = (i * 2 + j) * 4;
        this.trailCol[c] = 1;
        this.trailCol[c + 1] = 0.93;
        this.trailCol[c + 2] = 0.8;
        this.trailCol[c + 3] = a;
      }
    }
    const g = this.trail.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }

  private updateDynamicResolution(dt: number): void {
    if (dt <= 0 || dt > 0.5) return;
    this.frameEma += (dt - this.frameEma) * 0.08;
    this.sinceAdjust += dt;
    if (!this.dynamicRes) {
      if (this.dynScale !== 1) {
        this.dynScale = 1;
        this.resize();
      }
      return;
    }
    if (this.sinceAdjust < 1.2) return;
    if (this.frameEma > 1 / 52 && this.dynScale > 0.5) {
      this.dynScale = Math.max(0.5, this.dynScale - 0.1);
      this.sinceAdjust = 0;
      this.resize();
    } else if (this.frameEma < 1 / 58 && this.dynScale < 1 && this.sinceAdjust > 3) {
      this.dynScale = Math.min(1, this.dynScale + 0.05);
      this.sinceAdjust = 0;
      this.resize();
    }
  }

  dispose(): void {
    this.renderer.dispose();
    this.canvas.remove();
  }
}

let ringTexCache: THREE.Texture | null = null;
function ringTex(): THREE.Texture {
  if (!ringTexCache) ringTexCache = ringTexture();
  return ringTexCache;
}
