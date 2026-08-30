/**
 * touch.js — on-screen flight controls for phones and tablets.
 *
 * Two floating analogue sticks (the standard Mode 2 drone layout: left is
 * throttle/yaw, right is pitch/roll), a column of camera actions down each
 * edge, and the whole remaining surface acts as a gimbal trackpad. Everything
 * is DOM so hit-testing, safe-area insets and pointer capture come for free.
 */
'use strict';

import { clamp, DEG } from './math.js';

const STICK_RADIUS = 46;

export class TouchControls {
  constructor(root, input, handlers) {
    this.root = root;
    this.input = input;
    this.h = handlers || {};
    this.visible = false;
    this.available = false;

    this.left = { id: null, x: 0, y: 0, vx: 0, vy: 0 };
    this.right = { id: null, x: 0, y: 0, vx: 0, vy: 0 };
    this.gimbal = { id: null, x: 0, y: 0, moved: 0 };

    this.el = {
      layer: root,
      pad: root.querySelector('#touch-pad'),
      zoneL: root.querySelector('#tzone-l'),
      zoneR: root.querySelector('#tzone-r'),
      baseL: root.querySelector('#tbase-l'),
      baseR: root.querySelector('#tbase-r'),
      knobL: root.querySelector('#tbase-l .knob'),
      knobR: root.querySelector('#tbase-r .knob'),
      rec: root.querySelector('[data-touch="record"]'),
    };

    this._bindStick(this.el.zoneL, this.el.baseL, this.el.knobL, this.left);
    this._bindStick(this.el.zoneR, this.el.baseR, this.el.knobR, this.right);
    this._bindPad();
    this._bindButtons();
  }

  /** True when this device is driven by touch rather than a mouse. */
  static isTouchDevice() {
    if (typeof window === 'undefined') return false;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return coarse || (navigator.maxTouchPoints || 0) > 0;
  }

  setVisible(on) {
    this.visible = on;
    this.root.hidden = !on;
    if (!on) this.releaseAll();
  }

  releaseAll() {
    for (const s of [this.left, this.right]) {
      s.id = null; s.vx = 0; s.vy = 0;
    }
    this.gimbal.id = null;
    this.el.baseL.classList.remove('on');
    this.el.baseR.classList.remove('on');
    this.el.knobL.style.transform = 'translate(-50%,-50%)';
    this.el.knobR.style.transform = 'translate(-50%,-50%)';
  }

  _bindStick(zone, base, knob, state) {
    const place = (e) => {
      const r = zone.getBoundingClientRect();
      base.style.left = (e.clientX - r.left) + 'px';
      base.style.top = (e.clientY - r.top) + 'px';
    };
    zone.addEventListener('pointerdown', (e) => {
      if (state.id !== null) return;
      e.preventDefault();
      state.id = e.pointerId;
      state.x = e.clientX;
      state.y = e.clientY;
      place(e);
      base.classList.add('on');
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (state.id !== e.pointerId) return;
      e.preventDefault();
      let dx = e.clientX - state.x;
      let dy = e.clientY - state.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx = (dx / len) * STICK_RADIUS;
        dy = (dy / len) * STICK_RADIUS;
        // Drag the origin along so the stick never feels stuck at the rail.
        state.x = e.clientX - dx;
        state.y = e.clientY - dy;
        place({ clientX: state.x, clientY: state.y });
      }
      state.vx = dx / STICK_RADIUS;
      state.vy = dy / STICK_RADIUS;
      knob.style.transform = 'translate(calc(-50% + ' + dx.toFixed(1) + 'px), calc(-50% + ' +
        dy.toFixed(1) + 'px))';
    });
    const end = (e) => {
      if (state.id !== e.pointerId) return;
      state.id = null;
      state.vx = 0; state.vy = 0;
      base.classList.remove('on');
      knob.style.transform = 'translate(-50%,-50%)';
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  _bindPad() {
    const pad = this.el.pad;
    const g = this.gimbal;
    pad.addEventListener('pointerdown', (e) => {
      if (g.id !== null) return;
      g.id = e.pointerId;
      g.x = e.clientX; g.y = e.clientY; g.moved = 0;
      pad.setPointerCapture(e.pointerId);
    });
    pad.addEventListener('pointermove', (e) => {
      if (g.id !== e.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      g.x = e.clientX; g.y = e.clientY;
      g.moved += Math.abs(dx) + Math.abs(dy);
      this.input.applyGimbalDelta(dx, dy, 1.6);
    });
    const end = (e) => {
      if (g.id !== e.pointerId) return;
      g.id = null;
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }

  _bindButtons() {
    for (const btn of this.root.querySelectorAll('[data-touch]')) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('down');
      });
      const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove('down');
        const a = btn.dataset.touch;
        if (a === 'pause' && this.h.onPause) this.h.onPause();
        else this.input.actions.push(a);
      };
      btn.addEventListener('pointerup', fire);
      btn.addEventListener('pointercancel', () => btn.classList.remove('down'));
    }
  }

  /** Reflect recording state on the record button. */
  syncRecording(on) {
    if (this.el.rec) this.el.rec.classList.toggle('active', !!on);
  }

  /** Feed the stick positions into the shared control state. */
  apply(state) {
    state.throttle = -this.left.vy;
    state.yaw = this.left.vx;
    state.pitch = -this.right.vy;
    state.roll = this.right.vx;
  }

  get engaged() {
    return this.left.id !== null || this.right.id !== null || this.gimbal.id !== null;
  }
}
