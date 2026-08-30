/**
 * main.js — application shell: state machine, fixed-order update loop, mission
 * lifecycle, capture handling and objective tracking.
 */
'use strict';

import { MAPS, WEATHER, TIMES, getMap } from './biomes.js';
import { World } from './world.js';
import { Atmosphere } from './atmosphere.js';
import { Drone } from './drone.js';
import { Camera, CAMERA_MODES, CAMERA_LABELS } from './camera.js';
import { Renderer, QUALITY } from './renderer.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { analyzeShot, breakdownRows, ClipRecorder, buildShowreel, gradeFor } from './scoring.js';
import { loadSettings, saveSettings, saveRecord } from './storage.js';
import { clamp, clamp01, formatTime, DEG } from './math.js';

const BATTERY_SECONDS = 300;

class Game {
  constructor() {
    this.sceneCanvas = document.getElementById('scene');
    this.hudCanvas = document.getElementById('hud');
    this.hudCtx = this.hudCanvas.getContext('2d');
    this.fpsEl = document.getElementById('fps');

    this.settings = loadSettings();
    this.renderer = new Renderer(this.sceneCanvas);
    this.renderer.setQuality(this.settings.quality);
    this.hud = new HUD();
    this.hud.guides = this.settings.guides;
    this.hud.show = this.settings.hud;
    this.camera = new Camera();
    this.input = new Input(this.sceneCanvas);
    this.input.sensitivity = this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;
    this.input.attach();
    this.recorder = new ClipRecorder();

    this.state = 'menu';
    this.world = null;
    this.drone = null;
    this.atmosphere = null;
    this.session = null;
    this.shot = null;
    this.elapsed = 0;
    this.shotTimer = 0;
    this.photoCooldown = 0;
    this.showFps = false;
    this.fpsAvg = 60;
    this.autoQualityChecked = false;

    this.ui = new UI({
      settings: this.settings,
      onLaunch: (map, weather, time) => {
        this.pending = { map, weather, time };
        this.ui.renderBrief(map, weather, time);
      },
      onBriefLaunch: () => this.startMission(),
      onResume: () => this.resume(),
      onEnd: () => this.endMission('Flight ended by pilot'),
      onAbort: (silent) => this.abort(silent),
      onSetting: (k, v) => this.applySetting(k, v),
    });

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => {
      if (this.state === 'flying' && !document.pointerLockElement && !this.ui.modalOpen) {
        this.pause();
      }
    });
    this.sceneCanvas.addEventListener('click', () => {
      if (this.state === 'flying') this.input.requestPointerLock();
    });

    // Debug hook: `__skyline` exposes live game state in the console.
    window.__skyline = this;

    this.resize();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ── Settings ─────────────────────────────────────────────────────────────
  applySetting(key, value) {
    this.settings[key] = value;
    saveSettings(this.settings);
    if (key === 'quality') { this.renderer.setQuality(value); this.resize(); }
    if (key === 'sensitivity') this.input.sensitivity = value;
    if (key === 'invertY') this.input.invertY = value;
    if (key === 'guides') this.hud.guides = value;
    if (key === 'grain') this.grain = value;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.renderer.quality.maxDpr);
    this.renderer.resize(w, h, dpr);
    this.hudCanvas.width = Math.round(w * dpr);
    this.hudCanvas.height = Math.round(h * dpr);
    this.hudCanvas.style.width = w + 'px';
    this.hudCanvas.style.height = h + 'px';
    this.hudDpr = dpr;
    this.camera.resize(w, h);
    this.camera.buildBasis();
    this.viewW = w; this.viewH = h;
  }

  // ── Mission lifecycle ────────────────────────────────────────────────────
  startMission() {
    const { map, weather, time } = this.pending;
    this.ui.showLoading('Generating ' + map.name + '…',
      'Carving ridgelines, placing landmarks and baking the map');
    // Let the loading screen paint before the synchronous world build.
    setTimeout(() => this.buildMission(map, weather, time), 60);
  }

  buildMission(map, weatherId, timeId) {
    const weather = WEATHER[weatherId];
    const time = TIMES[timeId];
    const t0 = performance.now();

    this.world = new World(map, weather);
    this.world.nextGate = 0;
    this.atmosphere = new Atmosphere(time, weather);
    this.drone = new Drone(this.world, { batterySeconds: BATTERY_SECONDS });
    this.camera.setMode('gimbal');
    this.camera.lensIndex = 2;
    this.camera.focal = 24;
    this.recorder.reset();
    this.input.levelGimbal();
    this.hud.buildMinimap(this.world);
    this.hud.toasts.length = 0;
    this.hud.lastPhoto = null;

    this.session = {
      map, weatherId, timeId,
      objectives: map.objectives.map((o) => ({ ...o, done: false, progress: 0, progressText: '' })),
      photos: [],
      clips: [],
      gatesPassed: 0,
      vistasFound: 0,
      elapsed: 0,
      crashed: false,
      crashReason: '',
      batteryLeft: 1,
    };
    this.elapsed = 0;
    this.shot = null;
    this.photoCooldown = 0;
    this._deadEnd = false;
    this._emergency = false;
    this._homePrompt = false;

    this.ui.hideAll();
    this.state = 'flying';
    this.input.enabled = true;
    this.input.requestPointerLock();
    this.hud.toast('Cleared for takeoff', 'Hold W to lift off · click for mouse control', '#8affc1', 5);
    this.hud.toast(map.name + ' · ' + weather.name + ' · ' + time.name, null, '#7fd4ff', 4.4);
    // eslint-disable-next-line no-console
    console.info('[skyline] world built in ' + Math.round(performance.now() - t0) + ' ms');
  }

  pause() {
    if (this.state !== 'flying') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.exitPointerLock();
    this.session.elapsed = this.elapsed;
    this.session.batteryLeft = this.drone.battery;
    this.ui.showPause(this.session);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'flying';
    this.input.enabled = true;
    this.ui.hideAll();
    this.input.requestPointerLock();
  }

  abort(silent) {
    this.state = 'menu';
    this.input.enabled = false;
    this.input.exitPointerLock();
    this.recorder.reset();
    if (!silent) this.ui.show('hangar');
  }

  endMission(reason) {
    if (this.state === 'results' || !this.session) return;
    if (this.recorder.recording) {
      const clip = this.recorder.stop({ elapsed: this.elapsed, drone: this.drone, camera: this.camera });
      if (clip) this.session.clips.push(clip);
    }
    this.state = 'results';
    this.input.enabled = false;
    this.input.exitPointerLock();

    const s = this.session;
    s.elapsed = this.elapsed;
    s.batteryLeft = this.drone.battery;
    s.crashed = this.drone.crashed;
    s.crashReason = this.drone.crashReason || reason;

    const reel = buildShowreel(s);
    const record = saveRecord(s.map.id, {
      pilot: this.settings.pilot || 'PILOT',
      total: reel.total,
      grade: reel.grade.grade,
      gradeColor: reel.grade.color,
      weather: WEATHER[s.weatherId].name,
      time: TIMES[s.timeId].name,
      photos: s.photos.length,
      clips: s.clips.length,
      date: new Date().toISOString().slice(0, 10),
    });
    this.ui.renderResults(reel, s, s.map, record);
  }

  // ── Capture ──────────────────────────────────────────────────────────────
  capturePhoto() {
    if (this.photoCooldown > 0 || !this.drone.armed) {
      if (!this.drone.armed) this.hud.toast('Take off first', 'Hold W to lift off', '#ffd76a', 2);
      return;
    }
    this.photoCooldown = 0.55;

    const shot = analyzeShot(this.buildState(), true);
    const thumb = document.createElement('canvas');
    thumb.width = 320; thumb.height = 180;
    const tctx = thumb.getContext('2d');
    tctx.drawImage(this.sceneCanvas, 0, 0, this.sceneCanvas.width, this.sceneCanvas.height,
      0, 0, 320, 180);

    const photo = {
      score: shot.score,
      grade: shot.grade,
      rows: breakdownRows(shot),
      subjectNote: shot.subjectNote,
      parts: shot.parts,
      mults: shot.mults,
      thumb,
      alt: this.drone.altitude,
      agl: this.drone.agl,
      t: this.elapsed,
      kind: shot.primary ? shot.primary.poi.kind : null,
      poi: shot.primary ? shot.primary.poi : null,
    };
    this.session.photos.push(photo);

    if (shot.primary) {
      const p = shot.primary.poi;
      p.shotCount = (p.shotCount || 0) + 1;
      p.photographed = true;
      p.bestShot = Math.max(p.bestShot || 0, shot.score);
      if (p.kind === 'vista' && !p.counted) {
        p.counted = true;
        this.session.vistasFound++;
      }
    }

    this.hud.showPhoto(photo);
    const bonus = shot.mults.length ? shot.mults.map((m) => m.label).join(' · ') : null;
    this.hud.toast(photo.grade.grade + ' · ' + photo.score + ' pts', bonus, photo.grade.color, 2.6);
    this.checkObjectives({ photo });
  }

  toggleRecord() {
    if (this.recorder.recording) {
      const clip = this.recorder.stop(this.buildState());
      if (clip) {
        this.session.clips.push(clip);
        this.hud.toast('Clip banked · ' + clip.score + ' pts',
          clip.duration.toFixed(1) + 's · smoothness ' + Math.round(clip.smoothness * 100) + '%',
          clip.grade.color, 3.2);
        this.checkObjectives({ clip });
      } else {
        this.hud.toast('Clip discarded', 'Takes under 3 s are not usable', '#ffd76a', 2.2);
      }
    } else {
      if (!this.drone.armed) {
        this.hud.toast('Take off first', null, '#ffd76a', 2);
        return;
      }
      this.recorder.start(this.buildState());
      this.hud.toast('Recording', 'Fly it smooth — jerk costs points', '#ff9a9a', 2.2);
    }
  }

  // ── Objectives ───────────────────────────────────────────────────────────
  checkObjectives(ev) {
    const s = this.session;
    for (const o of s.objectives) {
      if (o.done) continue;
      if (o.type === 'photoOf' && ev.photo) {
        if (ev.photo.kind === o.kind && (!o.minAlt || ev.photo.alt >= o.minAlt)) this.completeObjective(o);
      } else if (o.type === 'photoAlt' && ev.photo) {
        const ok = (!o.minAlt || ev.photo.alt >= o.minAlt) && (!o.maxAlt || ev.photo.alt <= o.maxAlt);
        if (ok) {
          o.progress++;
          o.progressText = '(' + Math.min(o.progress, o.count) + '/' + o.count + ')';
          if (o.progress >= o.count) this.completeObjective(o);
        }
      } else if (o.type === 'photoGrade' && ev.photo) {
        if (ev.photo.score >= o.minScore) {
          o.progress++;
          o.progressText = '(' + Math.min(o.progress, o.count) + '/' + o.count + ')';
          if (o.progress >= o.count) this.completeObjective(o);
        }
      } else if (o.type === 'clip' && ev.clip) {
        if (ev.clip.duration >= o.minDuration) this.completeObjective(o);
      }
    }
  }

  completeObjective(o) {
    o.done = true;
    o.progressText = '';
    this.hud.toast('Objective complete  +' + o.points, o.text, '#8affc1', 3.4);
  }

  // ── Loop ─────────────────────────────────────────────────────────────────
  buildState() {
    return {
      camera: this.camera,
      world: this.world,
      drone: this.drone,
      atmosphere: this.atmosphere,
      session: this.session,
      recorder: this.recorder,
      shot: this.shot,
      elapsed: this.elapsed,
      width: this.viewW,
      height: this.viewH,
      grain: this.settings.grain,
    };
  }

  handleActions() {
    for (const a of this.input.consumeActions()) {
      if (a === 'fps') { this.showFps = !this.showFps; this.fpsEl.classList.toggle('on', this.showFps); }
      if (this.state === 'paused' && a === 'pause') { this.resume(); continue; }
      if (this.state !== 'flying') continue;
      switch (a) {
        case 'photo': this.capturePhoto(); break;
        case 'record': this.toggleRecord(); break;
        case 'camera': this.hud.toast('Camera · ' + CAMERA_LABELS[this.camera.cycleMode(1)], null, '#7fd4ff', 1.6); break;
        case 'cameraBack': this.camera.cycleMode(-1); break;
        case 'cam1': this.camera.setMode('fpv'); break;
        case 'cam2': this.camera.setMode('chase'); break;
        case 'cam3': this.camera.setMode('gimbal'); break;
        case 'zoomIn': this.camera.zoom(1); break;
        case 'zoomOut': this.camera.zoom(-1); break;
        case 'minimap': this.hud.cycleZoom(); break;
        case 'guides': this.hud.guides = !this.hud.guides; this.applySetting('guides', this.hud.guides); break;
        case 'hud': this.hud.show = !this.hud.show; this.applySetting('hud', this.hud.show); break;
        case 'levelGimbal': this.input.levelGimbal(); break;
        case 'pause': this.pause(); break;
        case 'endRun':
          if (this.drone.landed && this.drone.distanceHome < 30) this.endMission('Landed at home');
          break;
        default: break;
      }
    }
  }

  update(dt) {
    const input = this.input.update(dt);
    this.handleActions();
    if (this.state !== 'flying') return;

    this.elapsed += dt;
    this.photoCooldown = Math.max(0, this.photoCooldown - dt);

    // Dead battery: the aircraft descends on its own.
    let ctl = input;
    if (this.drone.battery <= 0.0001) {
      ctl = { ...input, throttle: -0.5, pitch: 0, roll: 0, yaw: 0, sport: false, cine: true };
      if (!this._emergency) {
        this._emergency = true;
        this.hud.toast('BATTERY EMPTY', 'Autoland engaged — find flat ground', '#ff7a7a', 6);
      }
    } else {
      this._emergency = false;
    }

    this.drone.update(dt, ctl);
    this.world.update(dt, this.drone);
    this.camera.update(dt, this.drone, this.world.terrain);

    // Gate course
    const gates = this.world.gates;
    if (gates.length) {
      const g = gates[this.world.nextGate % gates.length];
      if (g && !g.passed) {
        const d = Math.hypot(this.drone.pos.x - g.x, this.drone.pos.y - g.y, this.drone.pos.z - g.z);
        if (d < g.radius) {
          g.passed = true;
          this.session.gatesPassed++;
          this.world.nextGate++;
          const left = gates.length - this.session.gatesPassed;
          this.hud.toast('Gate ' + (g.index + 1) + ' · +220',
            left ? left + ' gates remaining' : 'Course complete', '#7fe4ff', 2.6);
        }
      }
    }

    // Newly discovered vistas
    for (const v of this.world.vistas) {
      if (v.justFound) {
        v.justFound = false;
        this.hud.toast('Hidden vista found', 'Photograph it for a 1.3× bonus', '#ffd76a', 4);
      }
    }

    // Composition analysis at ~12 Hz drives the live meter and clip sampling.
    this.shotTimer += dt;
    if (this.shotTimer > 0.085) {
      this.shotTimer = 0;
      this.shot = analyzeShot(this.buildState(), false);
    }
    this.recorder.update(dt, this.buildState(), this.shot);
    this.hud.update(dt);

    this.session.elapsed = this.elapsed;
    this.session.batteryLeft = this.drone.battery;

    if (this.drone.crashed) {
      this.hud.toast('SIGNAL LOST', this.drone.crashReason, '#ff7a7a', 4);
      setTimeout(() => this.endMission(this.drone.crashReason), 1200);
      this.state = 'crashing';
      this.input.enabled = false;
      return;
    }

    // A dead battery ends the run once the aircraft is down.
    if (this.drone.battery <= 0.0001 && this.drone.landed && !this._deadEnd) {
      this._deadEnd = true;
      this.hud.toast('Battery exhausted', 'Grading the showreel…', '#ffd76a', 3);
      setTimeout(() => this.endMission('Battery exhausted'), 1600);
      return;
    }

    if (this.drone.landed && this.drone.armed === false && this.elapsed > 6 &&
        this.drone.distanceHome < 30 && !this._homePrompt) {
      this._homePrompt = true;
      this.hud.toast('Home pad — press ENTER to grade the showreel', null, '#8affc1', 6);
    }
    if (this.drone.distanceHome > 40) this._homePrompt = false;
  }

  frame(now) {
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.05, Math.max(0.0005, rawDt));
    this.fpsAvg = this.fpsAvg * 0.92 + (1 / Math.max(rawDt, 0.001)) * 0.08;

    if (this.state === 'flying' || this.state === 'crashing') {
      this.update(dt);
    } else if (this.state === 'paused' && this.world) {
      this.input.update(dt);
      this.handleActions();
    } else if (this.state === 'menu' || this.state === 'results') {
      this.input.update(dt);
      this.handleActions();
    }

    if (this.world && this.state !== 'menu') {
      this.renderer.render(this.buildState());
      const hctx = this.hudCtx;
      hctx.setTransform(this.hudDpr, 0, 0, this.hudDpr, 0, 0);
      if (this.state === 'flying' || this.state === 'crashing') {
        this.hud.draw(hctx, this.buildState());
      } else {
        hctx.clearRect(0, 0, this.viewW, this.viewH);
      }
    }

    if (this.showFps) {
      const r = this.renderer.stats;
      this.fpsEl.textContent = Math.round(this.fpsAvg) + ' fps · ' + r.quads +
        ' quads · ' + r.items + ' items · ' + this.renderer.quality.label;
    }

    // One-shot automatic quality drop on struggling hardware.
    if (!this.autoQualityChecked && this.state === 'flying' && this.elapsed > 6) {
      this.autoQualityChecked = true;
      if (this.fpsAvg < 32 && this.settings.quality !== 'low') {
        const next = this.settings.quality === 'high' ? 'medium' : 'low';
        this.applySetting('quality', next);
        this.hud.toast('Quality lowered to ' + QUALITY[next].label,
          'Change it back in Settings', '#ffd76a', 4);
      }
    }

    requestAnimationFrame((t) => this.frame(t));
  }
}

window.addEventListener('error', (e) => {
  // eslint-disable-next-line no-console
  console.error('[skyline]', e.message, e.filename + ':' + e.lineno);
});

new Game();
