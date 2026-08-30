/**
 * camera.js — the three shooting modes and the projection basis the renderer
 * and HUD both use.
 *
 *   FPV     raw, rolls with the airframe, wide lens, visceral.
 *   CHASE   spring-damped cinematic follow; the aircraft is in shot.
 *   GIMBAL  horizon-locked 3-axis head; the mode you actually shoot stills in.
 */
'use strict';

import {
  clamp, lerp, damp, dampAngle, wrapAngle, DEG, v3, vnorm, vcross, vsub, vdot,
} from './math.js';

export const CAMERA_MODES = ['fpv', 'chase', 'gimbal'];
export const CAMERA_LABELS = { fpv: 'FPV', chase: 'CHASE', gimbal: 'GIMBAL' };

/** Cinema-style prime lenses, in millimetres (full-frame equivalent). */
export const LENSES = [14, 18, 24, 35, 50, 85, 120];

export class Camera {
  constructor() {
    this.pos = v3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.mode = 'gimbal';
    this.lensIndex = 2;
    this.focal = LENSES[this.lensIndex];
    this.vfov = 0;

    // Orthonormal basis, rebuilt every frame.
    this.right = v3(1, 0, 0);
    this.up = v3(0, 1, 0);
    this.fwd = v3(0, 0, 1);

    this.width = 1; this.height = 1;
    this.cx = 0; this.cy = 0;
    this.scale = 1;
    this.near = 0.35;

    this._chasePos = v3();
    this._chaseInit = false;
    this._shake = 0;
    this._shakeT = 0;
    this._lookAt = v3();
    this._tmp = v3();
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'chase') this._chaseInit = false;
  }

  cycleMode(dir = 1) {
    const i = CAMERA_MODES.indexOf(this.mode);
    this.setMode(CAMERA_MODES[(i + dir + CAMERA_MODES.length) % CAMERA_MODES.length]);
    return this.mode;
  }

  zoom(dir) {
    this.lensIndex = clamp(this.lensIndex + dir, 0, LENSES.length - 1);
    this.focal = LENSES[this.lensIndex];
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.cx = w / 2;
    this.cy = h / 2;
  }

  /** Field of view in radians for the current lens on a 36×24 sensor. */
  computeFov() {
    const aspect = this.width / Math.max(1, this.height);
    const hfov = 2 * Math.atan(18 / this.focal);
    this.hfov = hfov;
    this.vfov = 2 * Math.atan(Math.tan(hfov / 2) / Math.max(0.6, aspect));
    return this.vfov;
  }

  update(dt, drone, terrain) {
    const d = drone;

    // Airframe buzz: rotor load plus gust loading, mode-dependent.
    const buzzTarget = this.mode === 'gimbal'
      ? 0.06 * d.rotorLoad
      : (this.mode === 'fpv' ? 0.55 : 0.22) * (0.35 + d.rotorLoad) * (1 + d.jitter);
    this._shake = damp(this._shake, buzzTarget, 4, dt);
    this._shakeT += dt * 17;
    const sh = this._shake * (d.crashed ? 0 : 1);
    const shakeP = Math.sin(this._shakeT * 1.7) * 0.0016 * sh * 60;
    const shakeR = Math.sin(this._shakeT * 1.1 + 2.1) * 0.0014 * sh * 60;

    if (this.mode === 'fpv') {
      const fwdX = Math.sin(d.yaw), fwdZ = Math.cos(d.yaw);
      this.pos.x = d.pos.x + fwdX * 0.5;
      this.pos.y = d.pos.y + 0.18;
      this.pos.z = d.pos.z + fwdZ * 0.5;
      this.yaw = d.yaw;
      this.pitch = d.pitch * 0.85 + d.gimbalPitch * 0.5 + shakeP;
      this.roll = d.roll * 0.9 + shakeR;
    } else if (this.mode === 'chase') {
      const speed = d.speed;
      const back = lerp(7.5, 14, clamp(speed / 22, 0, 1));
      const high = lerp(2.6, 4.4, clamp(speed / 22, 0, 1));
      const fwdX = Math.sin(d.yaw), fwdZ = Math.cos(d.yaw);
      const tx = d.pos.x - fwdX * back;
      const tz = d.pos.z - fwdZ * back;
      const ty = d.pos.y + high;
      if (!this._chaseInit) {
        this._chasePos.x = tx; this._chasePos.y = ty; this._chasePos.z = tz;
        this._chaseInit = true;
      }
      this._chasePos.x = damp(this._chasePos.x, tx, 2.6, dt);
      this._chasePos.y = damp(this._chasePos.y, ty, 2.2, dt);
      this._chasePos.z = damp(this._chasePos.z, tz, 2.6, dt);

      // Never let the follow cam drag through the ground.
      const minY = terrain.surface(this._chasePos.x, this._chasePos.z) + 2.6;
      if (this._chasePos.y < minY) this._chasePos.y = minY;

      this.pos.x = this._chasePos.x;
      this.pos.y = this._chasePos.y;
      this.pos.z = this._chasePos.z;

      // Aim slightly ahead of the aircraft so it sits off-centre in frame.
      const lead = 0.55;
      const lx = d.pos.x + d.vel.x * lead;
      const ly = d.pos.y + d.vel.y * lead * 0.6;
      const lz = d.pos.z + d.vel.z * lead;
      const dx = lx - this.pos.x, dy = ly - this.pos.y, dz = lz - this.pos.z;
      const targetYaw = Math.atan2(dx, dz);
      const targetPitch = Math.atan2(dy, Math.hypot(dx, dz)) + d.gimbalPitch * 0.35;
      this.yaw = dampAngle(this.yaw, targetYaw, 6, dt);
      this.pitch = damp(this.pitch, targetPitch, 5, dt);
      this.roll = damp(this.roll, d.roll * 0.35 + shakeR, 3.2, dt);
    } else {
      // GIMBAL — horizon locked, independent pan.
      this.pos.x = d.pos.x;
      this.pos.y = d.pos.y - 0.12;
      this.pos.z = d.pos.z;
      this.yaw = wrapAngle(d.yaw + d.gimbalYaw);
      this.pitch = d.gimbalPitch + shakeP * 0.25;
      this.roll = damp(this.roll, shakeR * 0.2, 6, dt);
    }

    this.buildBasis();
  }

  /** Rebuild the orthonormal camera basis from yaw/pitch/roll. */
  buildBasis() {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cr = Math.cos(this.roll), sr = Math.sin(this.roll);

    // Forward (yaw about +Y, then pitch about the local right axis).
    this.fwd.x = sy * cp;
    this.fwd.y = sp;
    this.fwd.z = cy * cp;

    // Un-rolled right/up.
    const rx = cy, ry = 0, rz = -sy;
    const ux = -sy * sp, uy = cp, uz = -cy * sp;

    this.right.x = rx * cr + ux * sr;
    this.right.y = ry * cr + uy * sr;
    this.right.z = rz * cr + uz * sr;
    this.up.x = -rx * sr + ux * cr;
    this.up.y = -ry * sr + uy * cr;
    this.up.z = -rz * sr + uz * cr;

    this.computeFov();
    this.scale = (this.height / 2) / Math.tan(this.vfov / 2);
  }

  /**
   * Project a world point. Returns false when behind the near plane.
   * Writes {x, y, z} (screen x/y, view-space depth) into `out`.
   */
  project(px, py, pz, out) {
    const dx = px - this.pos.x, dy = py - this.pos.y, dz = pz - this.pos.z;
    const z = dx * this.fwd.x + dy * this.fwd.y + dz * this.fwd.z;
    if (z <= this.near) { out.z = z; return false; }
    const x = dx * this.right.x + dy * this.right.y + dz * this.right.z;
    const y = dx * this.up.x + dy * this.up.y + dz * this.up.z;
    const inv = this.scale / z;
    out.x = this.cx + x * inv;
    out.y = this.cy - y * inv;
    out.z = z;
    return true;
  }

  /** View-space coordinates without the perspective divide. */
  toView(px, py, pz, out) {
    const dx = px - this.pos.x, dy = py - this.pos.y, dz = pz - this.pos.z;
    out.x = dx * this.right.x + dy * this.right.y + dz * this.right.z;
    out.y = dx * this.up.x + dy * this.up.y + dz * this.up.z;
    out.z = dx * this.fwd.x + dy * this.fwd.y + dz * this.fwd.z;
    return out;
  }

  /** Horizontal half-angle used for cheap frustum rejection. */
  cullCos() {
    return Math.cos(Math.min(1.5, this.hfov * 0.5 + 0.45));
  }
}
