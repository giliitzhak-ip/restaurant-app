/**
 * drone.js — flight model.
 *
 * A camera drone, not a racing quad: attitude is self-levelling, the throttle
 * stick commands vertical speed against a barometric hold, and horizontal
 * acceleration comes from the tilt the stabiliser is holding. Wind acts on the
 * airframe through relative airspeed, so a gust both pushes you and forces the
 * stabiliser to lean into it.
 */
'use strict';

import {
  clamp, clamp01, lerp, damp, dampAngle, wrapAngle, smoothstep, DEG, TAU,
} from './math.js';
import { Noise } from './noise.js';

const G = 9.81;

export const FLIGHT_MODES = {
  cine: {
    id: 'cine', label: 'CINE', maxTilt: 13 * DEG, tiltLambda: 2.1,
    yawRate: 0.55, climbRate: 2.6, drag: 0.0125, drain: 0.72,
  },
  normal: {
    id: 'normal', label: 'NORM', maxTilt: 24 * DEG, tiltLambda: 3.4,
    yawRate: 1.15, climbRate: 5.0, drag: 0.0098, drain: 1.0,
  },
  sport: {
    id: 'sport', label: 'SPORT', maxTilt: 36 * DEG, tiltLambda: 5.2,
    yawRate: 2.0, climbRate: 8.0, drag: 0.0082, drain: 1.55,
  },
};

export class Drone {
  constructor(world, opts = {}) {
    this.world = world;
    this.terrain = world.terrain;
    this.weather = world.weather;
    this.noise = new Noise(world.def.seed + 4242);

    this.pos = { x: world.spawn.x, y: world.spawn.y + 1.4, z: world.spawn.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.accel = { x: 0, y: 0, z: 0 };
    this.prevAccel = { x: 0, y: 0, z: 0 };

    this.yaw = world.homePad ? world.homePad.rot : 0;
    this.pitch = 0;
    this.roll = 0;
    this.yawRate = 0;

    this.gimbalPitch = -12 * DEG;
    this.gimbalYaw = 0;

    this.mode = FLIGHT_MODES.normal;
    this.batterySeconds = opts.batterySeconds || 300;
    this.battery = 1;
    this.armed = false;
    this.crashed = false;
    this.landed = true;
    this.crashReason = '';
    this.flightTime = 0;

    // Wind state
    this.windDir = (world.rand ? world.rand() : 0.3) * TAU;
    this.wind = { x: 0, y: 0, z: 0 };
    this.gustPhase = 0;

    // Smoothness telemetry (drives the cinematography score)
    this.jitter = 0;
    this.stability = 1;
    this.smoothScore = 1;
    this.rotorLoad = 0.4;
  }

  get altitude() { return this.pos.y - this.terrain.waterLevel; }
  get groundHeight() { return this.terrain.surface(this.pos.x, this.pos.z); }
  get agl() { return this.pos.y - this.groundHeight; }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get verticalSpeed() { return this.vel.y; }
  get heading() { return (this.yaw / DEG + 360) % 360; }
  get distanceHome() {
    return Math.hypot(this.pos.x - this.world.spawn.x, this.pos.z - this.world.spawn.z);
  }

  /** Wind vector at a point, including gusts and orographic lift. */
  windAt(x, y, z, t) {
    const w = this.weather;
    const gust = this.noise.fbm(x * 0.002 + t * 0.14, z * 0.002 - t * 0.09, 3, 2.0, 0.5, 9) * 2 - 1;
    const swirl = this.noise.signed(x * 0.0045 - t * 0.2, z * 0.0045 + t * 0.15, 12);
    const strength = w.windBase + gust * w.windGust;
    const dir = this.windDir + swirl * 0.55;
    const out = this.wind;
    out.x = Math.sin(dir) * strength;
    out.z = Math.cos(dir) * strength;

    // Air forced up over rising terrain, sinking on the lee side.
    const probe = 26;
    const hHere = this.terrain.surface(x, z);
    const hUp = this.terrain.surface(x + out.x * 2.2, z + out.z * 2.2);
    const gradient = (hUp - hHere) / probe;
    const agl = Math.max(1, y - hHere);
    const lift = gradient * strength * 0.9 * Math.exp(-agl / 190);
    out.y = clamp(lift, -6, 8) + gust * w.windGust * 0.12;
    return out;
  }

  /** Reset attitude/battery for a fresh run without regenerating the world. */
  reset() {
    this.pos = { x: this.world.spawn.x, y: this.world.spawn.y + 1.4, z: this.world.spawn.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.pitch = this.roll = 0;
    this.battery = 1;
    this.crashed = false;
    this.landed = true;
    this.armed = false;
    this.flightTime = 0;
  }

  update(dt, input) {
    if (this.crashed) return;

    // Flight mode from modifier keys.
    this.mode = input.sport ? FLIGHT_MODES.sport
      : input.cine ? FLIGHT_MODES.cine
        : FLIGHT_MODES.normal;
    const m = this.mode;

    if (!this.armed) {
      // Sitting on the pad until the pilot asks for lift.
      if (input.throttle > 0.05) { this.armed = true; this.landed = false; }
      else {
        this.pos.y = this.groundHeight + 0.6;
        this.vel.x = this.vel.y = this.vel.z = 0;
        this.pitch = damp(this.pitch, 0, 6, dt);
        this.roll = damp(this.roll, 0, 6, dt);
        this._updateGimbal(dt, input);
        return;
      }
    }

    this.flightTime += dt;
    this.gustPhase += dt;
    const wind = this.windAt(this.pos.x, this.pos.y, this.pos.z, this.gustPhase);

    // ── Attitude ───────────────────────────────────────────────────────────
    const targetPitch = -input.pitch * m.maxTilt;
    const targetRoll = input.roll * m.maxTilt;
    this.pitch = damp(this.pitch, targetPitch, m.tiltLambda, dt);
    this.roll = damp(this.roll, targetRoll, m.tiltLambda, dt);

    const yawTarget = input.yaw * m.yawRate;
    this.yawRate = damp(this.yawRate, yawTarget, 5.5, dt);
    this.yaw = wrapAngle(this.yaw + this.yawRate * dt);

    // ── Translation ────────────────────────────────────────────────────────
    const fwdX = Math.sin(this.yaw), fwdZ = Math.cos(this.yaw);
    const rgtX = Math.cos(this.yaw), rgtZ = -Math.sin(this.yaw);

    // Horizontal acceleration is what the held tilt buys us: a = g·tan(tilt).
    const axBody = Math.tan(this.roll) * G;
    const azBody = Math.tan(-this.pitch) * G;
    let ax = fwdX * azBody + rgtX * axBody;
    let az = fwdZ * azBody + rgtZ * axBody;

    // Airspeed drag (relative to the moving air mass).
    const rx = this.vel.x - wind.x;
    const rz = this.vel.z - wind.z;
    const ry = this.vel.y - wind.y;
    const rSpeed = Math.hypot(rx, ry, rz);
    const dragK = m.drag * (1 + this.weather.windBase * 0.012);
    ax -= rx * rSpeed * dragK;
    az -= rz * rSpeed * dragK;

    // Vertical: altitude-hold controller tracking the commanded climb rate.
    const targetVy = input.throttle * m.climbRate;
    const vyErr = targetVy - (this.vel.y - wind.y * 0.55);
    let ay = clamp(vyErr * 3.2, -14, 16) - ry * Math.abs(ry) * dragK * 0.8;

    this.prevAccel.x = this.accel.x;
    this.prevAccel.y = this.accel.y;
    this.prevAccel.z = this.accel.z;
    this.accel.x = ax; this.accel.y = ay; this.accel.z = az;

    this.vel.x += ax * dt;
    this.vel.y += ay * dt;
    this.vel.z += az * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // ── Battery ────────────────────────────────────────────────────────────
    const climbLoad = Math.max(0, this.vel.y) * 0.09;
    const speedLoad = this.speed * 0.028;
    const windLoad = Math.hypot(rx, rz) * 0.02;
    this.rotorLoad = clamp01(0.42 + climbLoad + speedLoad * 0.6 + windLoad * 0.5);
    const drain = (0.78 + climbLoad + speedLoad + windLoad) * m.drain;
    this.battery = clamp01(this.battery - (drain * dt) / this.batterySeconds);

    // ── Smoothness telemetry ───────────────────────────────────────────────
    const jerk = Math.hypot(
      this.accel.x - this.prevAccel.x,
      this.accel.y - this.prevAccel.y,
      this.accel.z - this.prevAccel.z,
    ) / Math.max(dt, 1e-3);
    const angRate = Math.abs(this.yawRate) + Math.abs(input.pitch) * 0.4 + Math.abs(input.roll) * 0.4;
    const instant = clamp01(jerk / 55) * 0.7 + clamp01(angRate / 1.8) * 0.3;
    this.jitter = damp(this.jitter, instant, 3.0, dt);
    this.stability = clamp01(1 - this.jitter);
    this.smoothScore = damp(this.smoothScore, this.stability, 0.8, dt);

    this._updateGimbal(dt, input);
    this._checkGround(dt);
  }

  _updateGimbal(dt, input) {
    const targetPitch = clamp(input.gimbalPitch, -100 * DEG, 32 * DEG);
    // The gimbal is mechanically damped — it never snaps.
    this.gimbalPitch = damp(this.gimbalPitch, targetPitch, 9, dt);
    this.gimbalYaw = damp(this.gimbalYaw, clamp(input.gimbalYaw, -75 * DEG, 75 * DEG), 8, dt);
  }

  _checkGround(dt) {
    // Climbing away from the surface is never a landing.
    if (this.vel.y > 0.12) return;
    const ground = this.terrain.height(this.pos.x, this.pos.z);
    const water = this.terrain.waterLevel;
    const surface = Math.max(ground, water);
    const clearance = this.pos.y - surface;
    if (clearance > 1.0) return;

    const overWater = ground < water - 0.5;
    const descent = -this.vel.y;
    const gentle = descent < 2.2 && this.speed < 3.4 &&
      Math.abs(this.pitch) < 12 * DEG && Math.abs(this.roll) < 12 * DEG;

    if (overWater) {
      this.crashed = true;
      this.crashReason = 'Water landing — airframe lost';
      return;
    }
    if (gentle) {
      this.pos.y = surface + 0.6;
      this.vel.x = this.vel.y = this.vel.z = 0;
      this.landed = true;
      this.armed = false;
      return;
    }
    this.crashed = true;
    this.crashReason = descent > 6 || this.speed > 12
      ? 'Terrain impact — airframe lost'
      : 'Hard landing — gimbal destroyed';
  }
}
