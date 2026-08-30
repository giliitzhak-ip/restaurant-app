/**
 * input.js — keyboard + mouse + gamepad, normalised into one control state.
 *
 * Keyboard axes are ramped rather than switched so that a keyboard pilot can
 * still fly smooth enough footage to score well; gamepad axes pass through
 * with a deadzone and a mild expo curve.
 */
'use strict';

import { clamp, approach, DEG } from './math.js';

const KEY_ACTIONS = {
  Space: 'photo',
  KeyR: 'record',
  KeyC: 'camera',
  KeyV: 'cameraBack',
  KeyQ: 'zoomOut',
  KeyE: 'zoomIn',
  Tab: 'minimap',
  KeyG: 'guides',
  KeyH: 'hud',
  KeyL: 'levelGimbal',
  KeyP: 'pause',
  Enter: 'endRun',
  KeyF: 'fps',
  Escape: 'pause',
  Digit1: 'cam1',
  Digit2: 'cam2',
  Digit3: 'cam3',
};

export class Input {
  constructor(target) {
    this.target = target;
    this.keys = new Set();
    this.actions = [];
    this.enabled = false;
    this.pointerLocked = false;
    this.dragging = false;
    this.gamepadIndex = null;
    this.usingGamepad = false;
    this.sensitivity = 1;
    this.invertY = false;

    this.state = {
      throttle: 0, pitch: 0, roll: 0, yaw: 0,
      gimbalPitch: -12 * DEG, gimbalYaw: 0,
      sport: false, cine: false,
    };
    this._targets = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onPointerLock = this._onPointerLock.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onBlur = this._onBlur.bind(this);
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
    this.target.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this._onPointerLock);
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadIndex = null;
      this.usingGamepad = false;
    });
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('blur', this._onBlur);
    this.target.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onPointerLock);
  }

  requestPointerLock() {
    if (this.target.requestPointerLock) this.target.requestPointerLock();
  }

  exitPointerLock() {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  _onPointerLock() {
    this.pointerLocked = document.pointerLockElement === this.target;
  }

  _onBlur() {
    this.keys.clear();
  }

  _onKeyDown(e) {
    // Never steal keystrokes from a form field (the pilot-name box).
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.repeat) {
      if (e.code === 'Tab') e.preventDefault();
      return;
    }
    if (e.code === 'Tab' || (e.code === 'Space' && this.enabled)) e.preventDefault();
    this.keys.add(e.code);
    this.usingGamepad = false;
    const action = KEY_ACTIONS[e.code];
    if (action) this.actions.push(action);
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
  }

  _onMouseDown(e) {
    if (e.button === 0 && this.enabled && !this.pointerLocked) this.dragging = true;
  }

  _onMouseUp() {
    this.dragging = false;
  }

  _onMouseMove(e) {
    if (!this.enabled) return;
    if (!this.pointerLocked && !this.dragging) return;
    const s = 0.0022 * this.sensitivity;
    const dy = this.invertY ? -e.movementY : e.movementY;
    this.state.gimbalPitch = clamp(this.state.gimbalPitch - dy * s, -100 * DEG, 32 * DEG);
    this.state.gimbalYaw = clamp(this.state.gimbalYaw + e.movementX * s * 0.85, -75 * DEG, 75 * DEG);
    this.usingGamepad = false;
  }

  _onWheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    this.actions.push(e.deltaY < 0 ? 'zoomIn' : 'zoomOut');
  }

  /** Pull and clear queued discrete actions. */
  consumeActions() {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  key(code) { return this.keys.has(code); }

  _pollGamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    let pad = this.gamepadIndex != null ? pads[this.gamepadIndex] : null;
    if (!pad) {
      for (const p of pads) if (p && p.connected) { pad = p; this.gamepadIndex = p.index; break; }
    }
    return pad || null;
  }

  _dz(v, dead = 0.12) {
    if (Math.abs(v) < dead) return 0;
    const s = Math.sign(v);
    const n = (Math.abs(v) - dead) / (1 - dead);
    return s * n * n * 0.65 + s * n * 0.35; // mild expo
  }

  update(dt) {
    const s = this.state;
    const t = this._targets;

    // ── Gamepad ────────────────────────────────────────────────────────────
    const pad = this._pollGamepad();
    let padActive = false;
    if (pad) {
      const lx = this._dz(pad.axes[0] || 0);
      const ly = this._dz(pad.axes[1] || 0);
      const rx = this._dz(pad.axes[2] || 0);
      const ry = this._dz(pad.axes[3] || 0);
      if (lx || ly || rx || ry) padActive = true;
      if (padActive) this.usingGamepad = true;
      if (this.usingGamepad) {
        t.yaw = lx;
        t.throttle = -ly;
        t.roll = rx;
        t.pitch = -ry;
        const lt = pad.buttons[6] ? pad.buttons[6].value : 0;
        const rt = pad.buttons[7] ? pad.buttons[7].value : 0;
        if (lt > 0.05 || rt > 0.05) {
          s.gimbalPitch = clamp(s.gimbalPitch + (lt - rt) * dt * 1.4, -100 * DEG, 32 * DEG);
        }
        s.sport = !!(pad.buttons[10] && pad.buttons[10].pressed);
        s.cine = !!(pad.buttons[11] && pad.buttons[11].pressed);
      }
      this._padButtons(pad);
    }

    if (!this.usingGamepad) {
      const k = (code) => (this.keys.has(code) ? 1 : 0);
      t.throttle = k('KeyW') - k('KeyS');
      t.yaw = k('KeyD') - k('KeyA');
      t.pitch = k('ArrowUp') - k('ArrowDown');
      t.roll = k('ArrowRight') - k('ArrowLeft');
      s.sport = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      s.cine = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
      // Fine gimbal trim without the mouse.
      if (this.keys.has('BracketLeft')) s.gimbalPitch = clamp(s.gimbalPitch + dt * 0.9, -100 * DEG, 32 * DEG);
      if (this.keys.has('BracketRight')) s.gimbalPitch = clamp(s.gimbalPitch - dt * 0.9, -100 * DEG, 32 * DEG);
    }

    if (!this.enabled) {
      t.throttle = t.pitch = t.roll = t.yaw = 0;
    }

    // Ramp toward the stick target so keyboard input still produces smooth arcs.
    const rate = this.usingGamepad ? 12 : 3.4;
    s.throttle = approach(s.throttle, t.throttle, rate * dt);
    s.pitch = approach(s.pitch, t.pitch, rate * dt);
    s.roll = approach(s.roll, t.roll, rate * dt);
    s.yaw = approach(s.yaw, t.yaw, rate * dt * 1.25);
    return s;
  }

  _padButtons(pad) {
    if (!this._prevButtons) this._prevButtons = [];
    const map = { 0: 'photo', 1: 'record', 2: 'camera', 3: 'guides', 4: 'zoomOut', 5: 'zoomIn', 9: 'pause', 8: 'minimap' };
    for (const i in map) {
      const b = pad.buttons[i];
      const pressed = !!(b && b.pressed);
      if (pressed && !this._prevButtons[i]) {
        this.actions.push(map[i]);
        this.usingGamepad = true;
      }
      this._prevButtons[i] = pressed;
    }
  }

  levelGimbal() {
    this.state.gimbalPitch = -12 * DEG;
    this.state.gimbalYaw = 0;
  }
}
