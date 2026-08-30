/**
 * hud.js — flight + camera instrumentation drawn on a transparent overlay
 * canvas, so the scene canvas stays clean for photo capture.
 */
'use strict';

import {
  clamp, clamp01, lerp, smoothstep, TAU, DEG, formatTime, cachedRGB, rgba,
} from './math.js';
import { gradeFor, breakdownRows } from './scoring.js';
import { POI_INFO } from './world.js';
import { CAMERA_LABELS } from './camera.js';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif';

const INK = 'rgba(233,241,250,0.92)';
const DIM = 'rgba(198,214,232,0.55)';
const FAINT = 'rgba(198,214,232,0.24)';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h, r = 8, alpha = 0.34) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(8,14,22,' + alpha + ')';
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,196,232,0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function label(ctx, str, x, y, size = 9, color = DIM) {
  ctx.font = '600 ' + size + 'px ' + SANS;
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function mono(ctx, str, x, y, size = 13, color = INK, align = 'left') {
  ctx.font = '600 ' + size + 'px ' + MONO;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(str, x, y);
  ctx.textAlign = 'left';
}

export class HUD {
  constructor() {
    this.minimap = null;
    this.minimapMeta = null;
    this.toasts = [];
    this.flash = 0;
    this.recPulse = 0;
    this.lastPhoto = null;
    this.photoCardT = 0;
    this.zoomIndex = 1;
    this.zoomLevels = [900, 1600, 2600];
    this.show = true;
    this.guides = true;
    this._compass = 0;

    /** Compact layout for phones: fewer instruments, bigger touch clearance. */
    this.compact = false;
    /** Display safe-area insets (notches, home indicators). */
    this.inset = { t: 0, r: 0, b: 0, l: 0 };
    /** Screen edges reserved by the on-screen button columns. */
    this.reserve = { l: 0, r: 0 };
  }

  toast(text, sub, color = '#8fd7ff', ttl = 3.4) {
    this.toasts.unshift({ text, sub, color, t: 0, ttl });
    if (this.toasts.length > 5) this.toasts.pop();
  }

  showPhoto(photo) {
    this.lastPhoto = photo;
    this.photoCardT = 0;
    this.flash = 1;
  }

  cycleZoom() {
    this.zoomIndex = (this.zoomIndex + 1) % this.zoomLevels.length;
  }

  /** Bake a top-down colour map of the terrain once per mission. */
  buildMinimap(world, size = 200, span = 4800) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const img = g.createImageData(size, size);
    const t = world.terrain;
    const pal = t.palette;
    const col = [0, 0, 0];
    const step = span / size;
    const sun = { x: -0.5, y: 0.72, z: 0.48 };

    // Sample the heightfield once, then derive normals from the grid.
    const hs = new Float32Array((size + 1) * (size + 1));
    for (let j = 0; j <= size; j++) {
      const z = -span / 2 + j * step;
      for (let i = 0; i <= size; i++) hs[j * (size + 1) + i] = t.height(-span / 2 + i * step, z);
    }

    for (let j = 0; j < size; j++) {
      const z = -span / 2 + j * step;
      for (let i = 0; i < size; i++) {
        const x = -span / 2 + i * step;
        const h = hs[j * (size + 1) + i];
        const idx = (j * size + i) * 4;
        img.data[idx + 3] = 255;
        if (h < t.waterLevel) {
          const d = clamp01((t.waterLevel - h) / 60);
          img.data[idx] = lerp(pal.shallow[0], pal.deep[0], d) * 0.8;
          img.data[idx + 1] = lerp(pal.shallow[1], pal.deep[1], d) * 0.8;
          img.data[idx + 2] = lerp(pal.shallow[2], pal.deep[2], d) * 0.85;
          continue;
        }
        const hx = hs[j * (size + 1) + i + 1] - h;
        const hz = hs[(j + 1) * (size + 1) + i] - h;
        const nx = -hx, nz = -hz, ny = step;
        const l = Math.hypot(nx, ny, nz) || 1;
        let lam = (nx / l) * sun.x + (ny / l) * sun.y + (nz / l) * sun.z;
        lam = clamp(lam, 0, 1) * 0.75 + 0.35;
        const slope = clamp01(1 - ny / l);
        t.shade(x, z, h, slope, col);
        img.data[idx] = clamp(col[0] * lam, 0, 255);
        img.data[idx + 1] = clamp(col[1] * lam, 0, 255);
        img.data[idx + 2] = clamp(col[2] * lam, 0, 255);
      }
    }
    g.putImageData(img, 0, 0);
    this.minimap = cv;
    this.minimapMeta = { size, span };
    return cv;
  }

  update(dt) {
    this.recPulse += dt;
    this.flash = Math.max(0, this.flash - dt * 2.6);
    this.photoCardT += dt;
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < t.ttl);
  }

  draw(ctx, s) {
    const w = s.width, h = s.height;
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'alphabetic';

    if (this.flash > 0.01) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,' + (this.flash * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    if (!this.show) {
      if (s.recorder && s.recorder.recording) this._recBadge(ctx, s, w, h);
      return;
    }

    if (this.guides) this._guides(ctx, s, w, h);
    this._horizon(ctx, s, w, h);
    this._compassTape(ctx, s, w, h);

    if (this.compact) {
      this._compactPanels(ctx, s, w, h);
    } else {
      // On a tablet the edge button columns still need clearance.
      const L = this.inset.l + this.reserve.l + 26;
      const R = w - this.inset.r - this.reserve.r - 26;
      const T = this.inset.t + 20;
      const B = h - this.inset.b - 26;
      this._altitudeTape(ctx, s, L, h);
      this._speedTape(ctx, s, R - 54, h);
      const bw = 178;
      this._battery(ctx, s, R - bw, T, bw);
      this._cameraStrip(ctx, s, L, B - 62);
      this._compositionMeter(ctx, s, w / 2 - 130, B - 74, 260, 74);
      this._objectives(ctx, s, L, T);
      const ms = 176;
      this._minimap(ctx, s, R - ms, B - ms, ms);
      this._photoCard(ctx, s, L, B - 62 - 14);
    }

    this._toasts(ctx, s, w, h);
    if (s.recorder && s.recorder.recording) this._recBadge(ctx, s, w, h);
    this._warnings(ctx, s, w, h);
  }

  // ── Compact (phone) layout ───────────────────────────────────────────────
  /** A single-line instrument pill. */
  _pill(ctx, x, y, w, h, cells, accent) {
    panel(ctx, x, y, w, h, 6, 0.42);
    let cx = x + 9;
    for (const c of cells) {
      if (c.k) {
        ctx.font = '600 8px ' + SANS;
        ctx.fillStyle = FAINT;
        ctx.fillText(c.k, cx, y + h / 2 + 3.5);
        cx += ctx.measureText(c.k).width + 5;
      }
      ctx.font = '700 ' + (c.size || 11) + 'px ' + (c.mono === false ? SANS : MONO);
      ctx.fillStyle = c.color || INK;
      ctx.fillText(c.v, cx, y + h / 2 + 4);
      cx += ctx.measureText(c.v).width + (c.gap || 12);
    }
    if (accent) {
      ctx.fillStyle = accent;
      ctx.fillRect(x, y + 5, 2, h - 10);
    }
    return cx - x;
  }

  _compactPanels(ctx, s, w, h) {
    const d = s.drone, cam = s.camera, atm = s.atmosphere, sess = s.session;
    const L = this.inset.l + this.reserve.l + 10;
    const R = w - this.inset.r - this.reserve.r - 10;
    const T = this.inset.t + 8;
    const B = h - this.inset.b - 8;
    const PH = 24;

    // Mission + clock + objective progress
    const done = sess ? sess.objectives.filter((o) => o.done).length : 0;
    const total = sess ? sess.objectives.length : 0;
    this._pill(ctx, L, T, 186, PH, [
      { v: s.world.def.name.toUpperCase().slice(0, 14), size: 9, mono: false, gap: 10 },
      { v: formatTime(s.elapsed), size: 10, gap: 10 },
      { v: done + '/' + total, size: 10, color: done === total && total ? '#8affc1' : DIM },
    ], s.world.def.accent);

    // Camera state
    this._pill(ctx, L, T + PH + 5, 186, PH, [
      { v: CAMERA_LABELS[cam.mode], size: 9, mono: false, color: '#8fd7ff', gap: 9 },
      { v: cam.focal + 'mm', size: 10, gap: 9 },
      { v: d.mode.label, size: 9, mono: false, color: DIM, gap: 9 },
      { v: Math.round(d.gimbalPitch / DEG) + '°', size: 10, color: DIM },
    ]);

    // Telemetry
    const vs = d.verticalSpeed;
    this._pill(ctx, L, T + (PH + 5) * 2, 200, PH, [
      { k: 'ALT', v: Math.round(d.altitude), size: 10, gap: 8 },
      { k: 'AGL', v: Math.round(d.agl), size: 10, color: d.agl < 15 ? '#ffb45e' : INK, gap: 8 },
      { k: 'GS', v: d.speed.toFixed(1), size: 10, gap: 8 },
      { k: 'V/S', v: (vs >= 0 ? '+' : '') + vs.toFixed(1), size: 10,
        color: Math.abs(vs) > 4 ? '#ffd76a' : INK },
    ]);

    // Battery, right aligned
    const bw = 132;
    this._battery(ctx, s, R - bw, T, bw, true);

    // Minimap under the battery
    const ms = Math.min(116, Math.max(84, h * 0.30));
    this._minimap(ctx, s, R - ms, T + 34, ms);

    // Composition meter, centred between the sticks
    const cw = Math.min(228, w * 0.34);
    this._compositionMeter(ctx, s, w / 2 - cw / 2, B - 44, cw, 44);

    this._photoCardCompact(ctx, s, L, T + (PH + 5) * 3 + 4);

    // Wind, tucked under the minimap
    const ws = Math.hypot(d.wind.x, d.wind.z);
    this._pill(ctx, R - 84, T + 40 + ms, 84, 20, [
      { k: 'WIND', v: ws.toFixed(1), size: 10, color: ws > 9 ? '#ffb45e' : INK },
    ]);
  }

  _photoCardCompact(ctx, s, x, y) {
    const p = this.lastPhoto;
    if (!p || this.photoCardT > 4) return;
    const a = this.photoCardT < 0.25 ? this.photoCardT / 0.25 : clamp01((4 - this.photoCardT) / 0.7);
    const cw = 132, ch = cw * 0.5625 + 20;
    ctx.save();
    ctx.globalAlpha = a;
    panel(ctx, x, y, cw, ch, 7, 0.6);
    if (p.thumb) {
      ctx.save();
      roundRect(ctx, x + 5, y + 5, cw - 10, (cw - 10) * 0.5625, 4);
      ctx.clip();
      ctx.drawImage(p.thumb, x + 5, y + 5, cw - 10, (cw - 10) * 0.5625);
      ctx.restore();
    }
    ctx.font = '800 12px ' + SANS;
    ctx.fillStyle = p.grade.color;
    ctx.fillText(p.grade.grade, x + 7, y + ch - 6);
    ctx.font = '700 11px ' + MONO;
    ctx.fillStyle = INK;
    ctx.fillText('+' + p.score, x + 22, y + ch - 6);
    ctx.restore();
  }

  // ── Framing guides ───────────────────────────────────────────────────────
  _guides(ctx, s, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      ctx.moveTo((w * i) / 3, h * 0.14);
      ctx.lineTo((w * i) / 3, h * 0.86);
      ctx.moveTo(w * 0.12, (h * i) / 3);
      ctx.lineTo(w * 0.88, (h * i) / 3);
    }
    ctx.stroke();

    // Corner safe-area brackets, kept clear of notches and button columns.
    const len = this.compact ? 18 : 26;
    const mx0 = this.inset.l + this.reserve.l + (this.compact ? 8 : 22);
    const mx1 = w - this.inset.r - this.reserve.r - (this.compact ? 8 : 22);
    const my0 = this.inset.t + (this.compact ? 8 : 22);
    const my1 = h - this.inset.b - (this.compact ? 8 : 22);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const corners = [[mx0, my0, 1, 1], [mx1, my0, -1, 1], [mx0, my1, 1, -1], [mx1, my1, -1, -1]];
    for (const [x, y, dx, dy] of corners) {
      ctx.moveTo(x + dx * len, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * len);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Artificial horizon ───────────────────────────────────────────────────
  _horizon(ctx, s, w, h) {
    const cam = s.camera;
    const cx = w / 2, cy = h / 2;
    const span = this.compact ? Math.min(w * 0.22, 190) : Math.min(w * 0.30, 300);
    const pitchPx = cam.scale;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-cam.roll);
    const off = Math.tan(cam.pitch) * pitchPx;
    ctx.translate(0, off);

    ctx.strokeStyle = 'rgba(150,230,255,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-span, 0); ctx.lineTo(-span * 0.24, 0);
    ctx.moveTo(span * 0.24, 0); ctx.lineTo(span, 0);
    ctx.stroke();

    // Pitch ladder. A line at elevation `deg` sits at screen
    // y = cy - tan(deg - pitch) * scale; the context is already translated by
    // `off` (the horizon offset), so subtract it back out here.
    ctx.font = '600 9px ' + MONO;
    ctx.textAlign = 'center';
    for (let deg = -60; deg <= 60; deg += 10) {
      if (deg === 0) continue;
      const yy = -Math.tan(deg * DEG - cam.pitch) * pitchPx - off;
      if (Math.abs(yy + off) > h * 0.42) continue;
      const wdt = deg % 20 === 0 ? span * 0.34 : span * 0.19;
      ctx.strokeStyle = 'rgba(190,220,240,0.34)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (deg > 0) {
        ctx.moveTo(-wdt, yy); ctx.lineTo(wdt, yy);
      } else {
        for (let seg = 0; seg < 5; seg++) {
          const x0 = -wdt + (seg * 2 * wdt) / 5;
          ctx.moveTo(x0, yy); ctx.lineTo(x0 + wdt / 5, yy);
        }
      }
      ctx.stroke();
      if (deg % 20 === 0) {
        ctx.fillStyle = 'rgba(200,224,240,0.5)';
        ctx.fillText(String(Math.abs(deg)), -wdt - 14, yy + 3);
        ctx.fillText(String(Math.abs(deg)), wdt + 14, yy + 3);
      }
    }
    ctx.restore();

    // Fixed aircraft reference
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255,214,120,0.92)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-26, 0); ctx.lineTo(-9, 0);
    ctx.moveTo(9, 0); ctx.lineTo(26, 0);
    ctx.moveTo(0, -5); ctx.lineTo(0, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2.4, 0, TAU);
    ctx.fillStyle = 'rgba(255,214,120,0.95)';
    ctx.fill();
    ctx.restore();

    // Roll arc
    const rr = span * 0.62;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, rr, -Math.PI * 0.72, -Math.PI * 0.28);
    ctx.stroke();
    for (const deg of [-30, -20, -10, 0, 10, 20, 30]) {
      const a = -Math.PI / 2 + deg * DEG;
      const l = deg === 0 ? 9 : deg % 30 === 0 ? 7 : 4;
      ctx.strokeStyle = deg === 0 ? 'rgba(255,255,255,0.6)' : 'rgba(200,224,240,0.36)';
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.lineTo(Math.cos(a) * (rr + l), Math.sin(a) * (rr + l));
      ctx.stroke();
    }
    const ra = -Math.PI / 2 - cam.roll;
    ctx.fillStyle = Math.abs(cam.roll) < 2 * DEG ? 'rgba(140,255,190,0.95)' : 'rgba(255,214,120,0.95)';
    ctx.beginPath();
    ctx.moveTo(Math.cos(ra) * (rr - 2), Math.sin(ra) * (rr - 2));
    ctx.lineTo(Math.cos(ra - 0.035) * (rr - 10), Math.sin(ra - 0.035) * (rr - 10));
    ctx.lineTo(Math.cos(ra + 0.035) * (rr - 10), Math.sin(ra + 0.035) * (rr - 10));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ── Compass ──────────────────────────────────────────────────────────────
  _compassTape(ctx, s, w, h) {
    const drone = s.drone, cam = s.camera;
    const cx = w / 2, y = this.inset.t + (this.compact ? 26 : 34);
    const tw = this.compact ? Math.min(230, w * 0.28) : Math.min(400, w * 0.42);
    const heading = ((cam.yaw / DEG) % 360 + 360) % 360;
    const pxPerDeg = tw / 90;

    ctx.save();
    panel(ctx, cx - tw / 2, y - 20, tw, 30, 6, 0.3);
    ctx.beginPath();
    ctx.rect(cx - tw / 2, y - 20, tw, 30);
    ctx.clip();

    ctx.textAlign = 'center';
    for (let d = -50; d <= 50; d += 5) {
      const deg = heading + d;
      const x = cx + d * pxPerDeg;
      const norm = ((deg % 360) + 360) % 360;
      const major = Math.abs(norm % 45) < 0.01 || Math.abs(norm % 45 - 45) < 0.01;
      const cardinal = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(norm / 45) % 8];
      const isCard = Math.abs(norm - Math.round(norm / 45) * 45) < 2.5;
      ctx.strokeStyle = isCard ? 'rgba(220,238,252,0.6)' : 'rgba(200,224,240,0.26)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 16);
      ctx.lineTo(x, y - (isCard ? 9 : 12));
      ctx.stroke();
      if (isCard) {
        ctx.font = '700 10px ' + SANS;
        ctx.fillStyle = cardinal === 'N' ? 'rgba(255,150,150,0.95)' : INK;
        ctx.fillText(cardinal, x, y - 0.5);
      }
    }

    // Bearing pips for gates and known landmarks.
    const marks = [];
    if (s.world.gates.length) {
      const g = s.world.gates[s.world.nextGate % s.world.gates.length];
      if (g && !g.passed) marks.push({ x: g.x, z: g.z, c: '#7fe4ff', t: 'GATE' });
    }
    marks.push({ x: s.world.spawn.x, z: s.world.spawn.z, c: '#ffd76a', t: 'HOME' });
    for (const m of marks) {
      const b = (Math.atan2(m.x - drone.pos.x, m.z - drone.pos.z) / DEG + 360) % 360;
      let d = b - heading;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      if (Math.abs(d) > 50) continue;
      const x = cx + d * pxPerDeg;
      ctx.fillStyle = m.c;
      ctx.beginPath();
      ctx.moveTo(x, y + 8);
      ctx.lineTo(x - 4, y + 2);
      ctx.lineTo(x + 4, y + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(140,230,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(cx, y - 21);
    ctx.lineTo(cx - 5, y - 28);
    ctx.lineTo(cx + 5, y - 28);
    ctx.closePath();
    ctx.fill();
    mono(ctx, String(Math.round(heading)).padStart(3, '0') + '°', cx, y + 22, 12, INK, 'center');
    ctx.restore();
  }

  // ── Tapes ────────────────────────────────────────────────────────────────
  _tape(ctx, x, y, hgt, value, step, unit, opts) {
    const side = opts.side || 'left';
    const wdt = 54;
    panel(ctx, x, y, wdt, hgt, 6, 0.3);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, wdt, hgt);
    ctx.clip();
    const cy = y + hgt / 2;
    const pxPer = hgt / (opts.range || 120);
    const first = Math.ceil((value - (opts.range || 120) / 2) / step) * step;
    ctx.font = '600 9px ' + MONO;
    for (let v = first; v < value + (opts.range || 120) / 2; v += step) {
      const yy = cy - (v - value) * pxPer;
      const major = v % (step * 5) === 0;
      ctx.strokeStyle = major ? 'rgba(200,224,240,0.5)' : 'rgba(200,224,240,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (side === 'left') {
        ctx.moveTo(x + wdt, yy);
        ctx.lineTo(x + wdt - (major ? 10 : 5), yy);
      } else {
        ctx.moveTo(x, yy);
        ctx.lineTo(x + (major ? 10 : 5), yy);
      }
      ctx.stroke();
      if (major) {
        ctx.fillStyle = DIM;
        ctx.textAlign = side === 'left' ? 'left' : 'right';
        ctx.fillText(String(Math.round(v)), side === 'left' ? x + 5 : x + wdt - 5, yy + 3);
      }
    }
    ctx.restore();

    // Current value readout
    const bh = 22;
    ctx.save();
    roundRect(ctx, x - (side === 'left' ? 6 : 0), y + hgt / 2 - bh / 2, wdt + 6, bh, 4);
    ctx.fillStyle = 'rgba(12,20,30,0.9)';
    ctx.fill();
    ctx.strokeStyle = opts.color || 'rgba(140,230,255,0.7)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    mono(ctx, opts.format ? opts.format(value) : String(Math.round(value)),
      x + wdt / 2, y + hgt / 2 + 4, 13, opts.color || INK, 'center');
    ctx.restore();

    ctx.textAlign = 'center';
    label(ctx, unit, x + wdt / 2 - 8, y - 6, 9, DIM);
  }

  _altitudeTape(ctx, s, x, h) {
    const d = s.drone;
    const hgt = Math.min(260, h * 0.42);
    const y = h / 2 - hgt / 2;
    this._tape(ctx, x, y, hgt, d.altitude, 10, 'ALT m', {
      side: 'left', range: 140, color: 'rgba(140,230,255,0.95)',
    });
    // AGL + vertical speed
    const vs = d.verticalSpeed;
    panel(ctx, x, y + hgt + 8, 54, 40, 6, 0.32);
    label(ctx, 'AGL', x + 6, y + hgt + 21, 8, DIM);
    mono(ctx, Math.round(d.agl) + 'm', x + 48, y + hgt + 21, 11, INK, 'right');
    label(ctx, 'V/S', x + 6, y + hgt + 36, 8, DIM);
    mono(ctx, (vs >= 0 ? '+' : '') + vs.toFixed(1), x + 48, y + hgt + 36, 11,
      Math.abs(vs) > 4 ? '#ffd76a' : INK, 'right');

    // Vertical-speed bug
    ctx.save();
    const cy = y + hgt / 2;
    const vy = clamp(-vs / 9, -1, 1) * (hgt / 2 - 12);
    ctx.fillStyle = 'rgba(140,255,190,0.8)';
    ctx.beginPath();
    ctx.moveTo(x + 54 + 3, cy + vy);
    ctx.lineTo(x + 54 + 10, cy + vy - 4);
    ctx.lineTo(x + 54 + 10, cy + vy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _speedTape(ctx, s, x, h) {
    const d = s.drone;
    const hgt = Math.min(260, h * 0.42);
    const y = h / 2 - hgt / 2;
    this._tape(ctx, x, y, hgt, d.speed, 5, 'GS m/s', {
      side: 'right', range: 46, color: 'rgba(140,230,255,0.95)',
    });

    // Wind readout
    const wind = d.wind;
    const ws = Math.hypot(wind.x, wind.z);
    panel(ctx, x, y + hgt + 8, 54, 40, 6, 0.32);
    label(ctx, 'WIND', x + 6, y + hgt + 21, 8, DIM);
    mono(ctx, ws.toFixed(1), x + 48, y + hgt + 21, 11, ws > 9 ? '#ffb45e' : INK, 'right');
    ctx.save();
    ctx.translate(x + 27, y + hgt + 32);
    ctx.rotate(Math.atan2(wind.x, wind.z) - s.camera.yaw + Math.PI);
    ctx.strokeStyle = ws > 9 ? '#ffb45e' : 'rgba(200,224,240,0.8)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(0, 6);
    ctx.moveTo(-3.5, 2.5); ctx.lineTo(0, 6); ctx.lineTo(3.5, 2.5);
    ctx.stroke();
    ctx.restore();
  }

  // ── Battery ──────────────────────────────────────────────────────────────
  _battery(ctx, s, x, y, bw, compact) {
    const d = s.drone;
    const bh = compact ? 24 : 54;
    panel(ctx, x, y, bw, bh, 6, 0.4);

    const pct = d.battery;
    const col = pct > 0.45 ? '#7de8a4' : pct > 0.2 ? '#ffd76a' : '#ff7a7a';
    const pulse = pct < 0.2 ? 0.6 + 0.4 * Math.sin(this.recPulse * 6) : 1;
    const secs = (d.battery * d.batterySeconds) /
      Math.max(0.4, d.mode.drain * (0.8 + d.rotorLoad));

    if (compact) {
      // Bar, percentage and remaining time on one line.
      const gx = x + 9, gy = y + 9, gw = bw * 0.34, gh = 7;
      ctx.save();
      ctx.globalAlpha = pulse;
      roundRect(ctx, gx, gy, gw, gh, 3.5);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      roundRect(ctx, gx, gy, Math.max(2, gw * pct), gh, 3.5);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.restore();
      mono(ctx, Math.round(pct * 100) + '%', gx + gw + 8, y + 16, 11, col);
      mono(ctx, formatTime(secs), x + bw - 9, y + 16, 10, DIM, 'right');
      return;
    }

    label(ctx, 'BATTERY', x + 12, y + 17, 9, DIM);
    mono(ctx, Math.round(pct * 100) + '%', x + bw - 12, y + 18, 13, col, 'right');

    const gx = x + 12, gy = y + 26, gw = bw - 24, gh = 8;
    ctx.save();
    ctx.globalAlpha = pulse;
    roundRect(ctx, gx, gy, gw, gh, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    roundRect(ctx, gx, gy, Math.max(2, gw * pct), gh, 4);
    ctx.fillStyle = col;
    ctx.fill();
    // Return-to-home reserve marker
    const need = clamp01(d.distanceHome / 1400);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx + gw * need, gy - 2);
    ctx.lineTo(gx + gw * need, gy + gh + 2);
    ctx.stroke();
    ctx.restore();

    label(ctx, formatTime(secs) + ' left', x + 12, y + 48, 9, DIM);
    ctx.textAlign = 'right';
    label(ctx, Math.round(d.distanceHome) + ' m home', x + bw - 12, y + 48, 9, DIM);
    ctx.textAlign = 'left';
  }

  // ── Camera strip ─────────────────────────────────────────────────────────
  _cameraStrip(ctx, s, x, y) {
    const cam = s.camera, d = s.drone, atm = s.atmosphere;
    const bw = 250, bh = 62;
    panel(ctx, x, y, bw, bh, 8, 0.36);

    label(ctx, 'CAMERA', x + 12, y + 16, 9, DIM);
    ctx.font = '700 13px ' + SANS;
    ctx.fillStyle = '#8fd7ff';
    ctx.fillText(CAMERA_LABELS[cam.mode], x + 66, y + 17);

    ctx.font = '700 13px ' + MONO;
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.fillText(cam.focal + 'mm', x + bw - 12, y + 17);
    ctx.textAlign = 'left';

    // Exposure triangle, derived from scene light — flavour, but consistent.
    const ev = atm.exposure * (1 - atm.night * 0.7);
    const iso = Math.round(clamp(100 / Math.max(0.12, ev), 100, 6400) / 50) * 50;
    const shutter = Math.round(clamp(160 * ev * (1 + d.speed / 14), 30, 2000));
    const cells = [
      ['ISO', String(iso)],
      ['SHUT', '1/' + shutter],
      ['GIMB', Math.round(d.gimbalPitch / DEG) + '°'],
      ['MODE', d.mode.label],
    ];
    let cx = x + 12;
    for (const [k, v] of cells) {
      label(ctx, k, cx, y + 36, 8, FAINT);
      ctx.font = '600 11px ' + MONO;
      ctx.fillStyle = INK;
      ctx.fillText(v, cx, y + 51);
      cx += 60;
    }
  }

  // ── Live composition meter ───────────────────────────────────────────────
  _compositionMeter(ctx, s, x, y, bw, bh) {
    const shot = s.shot;
    if (!shot) return;
    panel(ctx, x, y, bw, bh, 8, 0.4);
    const tight = bh < 62;

    const g = shot.grade;
    if (!tight) label(ctx, 'COMPOSITION', x + 12, y + 16, 9, DIM);
    ctx.font = '800 ' + (tight ? 13 : 15) + 'px ' + SANS;
    ctx.fillStyle = g.color;
    ctx.textAlign = tight ? 'left' : 'right';
    const head = g.grade + '  ' + shot.score;
    ctx.fillText(head, tight ? x + 10 : x + bw - 12, y + (tight ? 16 : 18));
    ctx.textAlign = 'left';
    if (tight) {
      // No room for a caption row, so the subject rides beside the score.
      const hw = ctx.measureText(head).width;
      ctx.font = '500 8px ' + SANS;
      ctx.fillStyle = DIM;
      const note = shot.subjectNote || '';
      const room = bw - hw - 26;
      const maxC = Math.max(4, Math.floor(room / 4.2));
      ctx.fillText(note.length > maxC ? note.slice(0, maxC - 1) + '…' : note,
        x + 14 + hw, y + 15);
    }

    const rows = breakdownRows(shot);
    const pad = tight ? 10 : 12;
    const gw = (bw - pad * 2) / rows.length - 4;
    const bhh = tight ? 15 : 22;
    const by = tight ? y + 21 : y + 26;
    let bx = x + pad;
    for (const r of rows) {
      const v = clamp01(r.value);
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fillRect(bx, by, gw, bhh);
      const col = v > 0.75 ? '#8affc1' : v > 0.5 ? '#7fd4ff' : v > 0.3 ? '#ffd76a' : '#ff8f8f';
      ctx.fillStyle = col;
      ctx.fillRect(bx, by + bhh * (1 - v), gw, bhh * v);
      if (!tight) {
        ctx.font = '600 7px ' + SANS;
        ctx.fillStyle = FAINT;
        ctx.fillText(r.label.slice(0, 5).toUpperCase(), bx, by + bhh + 8);
      }
      bx += gw + 4;
    }
    if (!tight) {
      ctx.font = '500 9px ' + SANS;
      ctx.fillStyle = DIM;
      const note = shot.subjectNote || '';
      ctx.fillText(note.length > 42 ? note.slice(0, 41) + '…' : note, x + pad, y + bh - 5);
    }
  }

  // ── Objectives ───────────────────────────────────────────────────────────
  _objectives(ctx, s, x, y) {
    const sess = s.session;
    if (!sess) return;
    const rows = sess.objectives;
    const bw = 268, bh = 30 + rows.length * 17;
    panel(ctx, x, y, bw, bh, 8, 0.34);
    ctx.font = '700 10px ' + SANS;
    ctx.fillStyle = INK;
    ctx.fillText(s.world.def.name.toUpperCase(), x + 12, y + 17);
    ctx.font = '600 9px ' + MONO;
    ctx.fillStyle = DIM;
    ctx.textAlign = 'right';
    ctx.fillText(formatTime(s.elapsed), x + bw - 12, y + 17);
    ctx.textAlign = 'left';

    let yy = y + 32;
    for (const o of rows) {
      ctx.font = '600 10px ' + SANS;
      ctx.fillStyle = o.done ? '#8affc1' : 'rgba(210,226,240,0.62)';
      ctx.fillText(o.done ? '✔' : '○', x + 12, yy + 8);
      ctx.fillStyle = o.done ? 'rgba(138,255,193,0.85)' : 'rgba(210,226,240,0.72)';
      let t = o.text;
      if (o.progressText) t += '  ' + o.progressText;
      ctx.fillText(t.length > 44 ? t.slice(0, 43) + '…' : t, x + 28, yy + 8);
      yy += 17;
    }
  }

  // ── Minimap ──────────────────────────────────────────────────────────────
  _minimap(ctx, s, x, y, size) {
    if (!this.minimap) return;
    const d = s.drone;
    const zoom = this.zoomLevels[this.zoomIndex];
    const meta = this.minimapMeta;

    ctx.save();
    roundRect(ctx, x, y, size, size, 10);
    ctx.fillStyle = 'rgba(6,10,16,0.72)';
    ctx.fill();
    ctx.save();
    roundRect(ctx, x, y, size, size, 10);
    ctx.clip();

    // Terrain crop
    const scale = size / zoom;
    const px = (d.pos.x + meta.span / 2) * (meta.size / meta.span);
    const pz = (d.pos.z + meta.span / 2) * (meta.size / meta.span);
    const srcSize = zoom * (meta.size / meta.span);
    ctx.globalAlpha = 0.92;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.minimap, px - srcSize / 2, pz - srcSize / 2, srcSize, srcSize,
      x, y, size, size);
    ctx.globalAlpha = 1;

    const toMap = (wx, wz) => ({
      x: x + size / 2 + (wx - d.pos.x) * scale,
      y: y + size / 2 + (wz - d.pos.z) * scale,
    });

    // View cone
    const cam = s.camera;
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate(cam.yaw - Math.PI / 2);
    const coneR = size * 0.42;
    const halfFov = cam.hfov / 2;
    const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, coneR);
    grd.addColorStop(0, 'rgba(140,220,255,0.35)');
    grd.addColorStop(1, 'rgba(140,220,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, coneR, -halfFov, halfFov);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Gates
    for (const g of s.world.gates) {
      const p = toMap(g.x, g.z);
      const next = s.world.nextGate === g.index;
      ctx.strokeStyle = g.passed ? 'rgba(120,220,160,0.75)' : next ? '#7fe4ff' : 'rgba(200,214,230,0.45)';
      ctx.lineWidth = next ? 2 : 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, next ? 6 : 4, 0, TAU);
      ctx.stroke();
      if (next) {
        ctx.font = '700 8px ' + MONO;
        ctx.fillStyle = '#7fe4ff';
        ctx.fillText(String(g.index + 1), p.x + 8, p.y + 3);
      }
    }

    // POIs
    for (const p of s.world.pois) {
      if (p.kind === 'pad') continue;
      if (p.kind === 'vista' && !p.discovered) continue;
      const dist = Math.hypot(p.x - d.pos.x, p.z - d.pos.z);
      if (dist > zoom * 0.75) continue;
      const m = toMap(p.x, p.z);
      const col = p.category === 'wildlife' ? '#ffc06a'
        : p.kind === 'vista' ? '#ffd76a'
          : p.category === 'nature' ? '#8affc1' : '#cfe3f5';
      ctx.globalAlpha = p.photographed ? 0.4 : 1;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(m.x, m.y, p.value > 200 ? 3 : 2.2, 0, TAU);
      ctx.fill();
      if (p.kind === 'vista') {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 6, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Home
    const home = toMap(s.world.spawn.x, s.world.spawn.z);
    ctx.fillStyle = '#ffd76a';
    ctx.font = '700 9px ' + MONO;
    ctx.fillText('H', home.x - 3, home.y + 3);

    // Drone
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate(d.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.4, 5);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();

    ctx.strokeStyle = 'rgba(160,196,232,0.2)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, size, size, 10);
    ctx.stroke();
    ctx.font = '600 8px ' + MONO;
    ctx.fillStyle = FAINT;
    ctx.fillText((zoom / 1000).toFixed(1) + ' km', x + 7, y + size - 6);
    ctx.restore();
  }

  // ── Notifications ────────────────────────────────────────────────────────
  _toasts(ctx, s, w, h) {
    let y = this.inset.t + (this.compact ? 82 : 92);
    for (const t of this.toasts) {
      const a = t.t < 0.25 ? t.t / 0.25 : clamp01((t.ttl - t.t) / 0.6);
      const tw = this.compact ? Math.min(268, w * 0.42) : 300;
      ctx.save();
      ctx.globalAlpha = a;
      panel(ctx, w / 2 - tw / 2, y, tw, t.sub ? 44 : 30, 8, 0.5);
      ctx.font = '700 12px ' + SANS;
      ctx.fillStyle = t.color;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, w / 2, y + 19);
      if (t.sub) {
        ctx.font = '500 10px ' + SANS;
        ctx.fillStyle = DIM;
        ctx.fillText(t.sub, w / 2, y + 35);
      }
      ctx.textAlign = 'left';
      ctx.restore();
      y += (t.sub ? 44 : 30) + 8;
    }
  }

  _photoCard(ctx, s, x, bottom) {
    const p = this.lastPhoto;
    if (!p || this.photoCardT > 5.5) return;
    const a = this.photoCardT < 0.3 ? this.photoCardT / 0.3
      : clamp01((5.5 - this.photoCardT) / 0.8);
    const cw = 216, ch = 212;
    const y = bottom - ch;
    ctx.save();
    ctx.globalAlpha = a;
    panel(ctx, x, y, cw, ch, 10, 0.62);
    if (p.thumb) {
      ctx.save();
      roundRect(ctx, x + 8, y + 8, cw - 16, (cw - 16) * 0.5625, 5);
      ctx.clip();
      ctx.drawImage(p.thumb, x + 8, y + 8, cw - 16, (cw - 16) * 0.5625);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      roundRect(ctx, x + 8, y + 8, cw - 16, (cw - 16) * 0.5625, 5);
      ctx.stroke();
    }
    const iy = y + 20 + (cw - 16) * 0.5625;
    ctx.font = '800 22px ' + SANS;
    ctx.fillStyle = p.grade.color;
    ctx.fillText(p.grade.grade, x + 12, iy + 14);
    ctx.font = '700 15px ' + MONO;
    ctx.fillStyle = INK;
    ctx.fillText('+' + p.score, x + 40, iy + 14);
    ctx.font = '500 9px ' + SANS;
    ctx.fillStyle = DIM;
    ctx.fillText((p.subjectNote || '').slice(0, 34), x + 12, iy + 30);
    let by = iy + 40;
    for (const r of p.rows.slice(0, 3)) {
      ctx.font = '500 8px ' + SANS;
      ctx.fillStyle = FAINT;
      ctx.fillText(r.label, x + 12, by);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x + 62, by - 6, 100, 5);
      ctx.fillStyle = r.value > 0.7 ? '#8affc1' : r.value > 0.45 ? '#7fd4ff' : '#ffd76a';
      ctx.fillRect(x + 62, by - 6, 100 * clamp01(r.value), 5);
      ctx.font = '600 8px ' + MONO;
      ctx.fillStyle = DIM;
      ctx.fillText(String(r.points), x + 170, by);
      by += 13;
    }
    ctx.restore();
  }

  _recBadge(ctx, s, w, h) {
    const rec = s.recorder;
    const dur = rec.liveDuration;
    const pulse = 0.55 + 0.45 * Math.sin(this.recPulse * 4);
    ctx.save();
    // Frame tint
    ctx.strokeStyle = 'rgba(255,70,70,' + (0.20 + pulse * 0.14).toFixed(3) + ')';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);

    const bw = this.compact ? 128 : 148;
    const x = w / 2 - bw / 2;
    const y = this.inset.t + (this.compact ? 50 : 62);
    panel(ctx, x, y, bw, 26, 6, 0.5);
    ctx.fillStyle = 'rgba(255,80,80,' + pulse.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(x + 16, y + 13, 5, 0, TAU);
    ctx.fill();
    ctx.font = '700 11px ' + SANS;
    ctx.fillStyle = '#ffd7d7';
    ctx.fillText('REC', x + 27, y + 17);
    mono(ctx, formatTime(dur), x + bw - 12, y + 17, 12, INK, 'right');
    // Live smoothness bar
    const sm = rec.liveSmooth;
    const sbw = this.compact ? 30 : 44;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 58, y + 9, sbw, 7);
    ctx.fillStyle = sm > 0.75 ? '#8affc1' : sm > 0.5 ? '#ffd76a' : '#ff8f8f';
    ctx.fillRect(x + 58, y + 9, sbw * clamp01(sm), 7);
    ctx.restore();
  }

  _warnings(ctx, s, w, h) {
    const d = s.drone;
    const msgs = [];
    if (d.battery < 0.15) msgs.push(['LOW BATTERY — RETURN HOME', '#ff7a7a']);
    else if (d.battery < 0.3) msgs.push(['BATTERY 30% — PLAN RETURN', '#ffd76a']);
    if (d.agl < 12 && d.armed) msgs.push(['TERRAIN PROXIMITY', '#ffb45e']);
    const ws = Math.hypot(d.wind.x, d.wind.z);
    if (ws > 12) msgs.push(['HIGH WIND ' + ws.toFixed(0) + ' M/S', '#ffb45e']);
    if (!msgs.length) return;
    const pulse = 0.6 + 0.4 * Math.sin(this.recPulse * 5);
    let y = h / 2 + (this.compact ? 60 : 96);
    ctx.save();
    ctx.textAlign = 'center';
    for (const [m, c] of msgs) {
      ctx.font = '700 11px ' + SANS;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = c;
      ctx.fillText(m, w / 2, y);
      y += 17;
    }
    ctx.restore();
    ctx.textAlign = 'left';
  }
}
