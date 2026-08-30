/**
 * ui.js — all DOM chrome: hangar/map select, briefing, pause, results,
 * controls, settings and records. The game core talks to this through
 * callbacks and never touches the DOM itself.
 */
'use strict';

import { MAPS, WEATHER, TIMES } from './biomes.js';
import { loadRecords, clearRecords } from './storage.js';
import { POI_INFO } from './world.js';
import { formatTime, clamp01 } from './math.js';
import { QUALITY } from './renderer.js';
import { installInstructions } from './pwa.js';

const CONTROLS = [
  ['Flight', [
    ['W / S', 'Throttle — climb and descend'],
    ['A / D', 'Yaw — rotate the airframe'],
    ['↑ / ↓', 'Pitch — fly forward and back'],
    ['← / →', 'Roll — slide left and right'],
    ['Shift', 'Sport mode — faster, thirstier'],
    ['Ctrl', 'Cine mode — slow and glassy'],
  ]],
  ['Camera', [
    ['Mouse', 'Gimbal pitch and pan (click to lock)'],
    ['C', 'Cycle FPV → Chase → Gimbal'],
    ['1 / 2 / 3', 'Jump to a camera mode'],
    ['Q / E / Wheel', 'Lens: 14 mm → 120 mm'],
    ['L', 'Re-level the gimbal'],
    ['Space', 'Take the photograph'],
    ['R', 'Start / stop recording a clip'],
  ]],
  ['Display', [
    ['G', 'Composition guides'],
    ['H', 'Hide the HUD'],
    ['Tab', 'Minimap range'],
    ['P / Esc', 'Pause'],
  ]],
  ['Gamepad', [
    ['Left stick', 'Throttle / yaw'],
    ['Right stick', 'Pitch / roll'],
    ['Triggers', 'Gimbal pitch'],
    ['A / B / X', 'Photo / record / camera'],
    ['L3 / R3', 'Sport / cine mode'],
  ]],
];

const TOUCH_CONTROLS = [
  ['Sticks', [
    ['Left stick', 'Throttle up/down, yaw left/right'],
    ['Right stick', 'Pitch forward/back, roll left/right'],
    ['Drag screen', 'Gimbal pitch and pan'],
    ['MODE', 'Cycle cine → normal → sport'],
  ]],
  ['Camera', [
    ['Shutter', 'Take the photograph'],
    ['●', 'Start / stop recording a clip'],
    ['CAM', 'Cycle FPV → Chase → Gimbal'],
    ['＋ / －', 'Lens: 14 mm → 120 mm'],
    ['⊹', 'Re-level the gimbal'],
    ['◎', 'Minimap range'],
    ['❚❚', 'Pause'],
  ]],
  ['Tips', [
    ['Landscape', 'Rotate the device — the game needs the width'],
    ['Fullscreen', 'Launching goes fullscreen so the browser bars get out of the way'],
    ['Smooth', 'Small stick movements score far better than big ones'],
  ]],
];

const TIPS = [
  'Golden hour and blue hour multiply every score. Midday is the hard mode.',
  'Put your subject on a third, keep the horizon off centre, and hold the roll level.',
  'Depth wins points: something near, something far, and a slice of sky.',
  'A clip is graded on smoothness — fly it in Cine mode and let the drone drift.',
  'First capture of a landmark is worth 25% more. Repeats decay fast.',
  'Battery burns faster climbing and into wind. Watch the home marker.',
];

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.selectedMap = MAPS[0];
    this.weather = this.selectedMap.defaultWeather;
    this.time = this.selectedMap.defaultTime;
    this.settings = handlers.settings;
    this.screens = {};
    for (const el of document.querySelectorAll('.screen')) {
      this.screens[el.id.replace('screen-', '')] = el;
    }
    this.modals = {};
    for (const el of document.querySelectorAll('.modal')) {
      this.modals[el.id.replace('modal-', '')] = el;
    }
    this.current = 'boot';
    if (this.h.isTouch) {
      const hint = document.querySelector('#screen-boot .hint');
      if (hint) {
        hint.textContent =
          'Touch controls · Rotate to landscape · Launching goes fullscreen';
      }
    }
    this._bind();
    this.renderHangar();
  }

  _bind() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      switch (a) {
        case 'boot-start': this.show('hangar'); break;
        case 'open-controls': this.openModal('controls'); break;
        case 'open-settings': this.openModal('settings'); break;
        case 'open-records': this.openModal('records'); break;
        case 'close-modal': this.closeModals(); break;
        case 'clear-records': clearRecords(); this.renderRecords(); this.renderHangar(); break;
        case 'fullscreen': this.h.onFullscreen(); break;
        case 'install': this.h.onInstall(); break;
        case 'launch': this.h.onLaunch(this.selectedMap, this.weather, this.time); break;
        case 'brief-launch': this.h.onBriefLaunch(); break;
        case 'brief-back': this.show('hangar'); break;
        case 'resume': this.h.onResume(); break;
        case 'end-run': this.h.onEnd(); break;
        case 'abort': this.h.onAbort(); break;
        case 'again': this.h.onLaunch(this.selectedMap, this.weather, this.time); break;
        case 'to-hangar': this.show('hangar'); this.h.onAbort(true); break;
        default: break;
      }
    });
    for (const m of Object.values(this.modals)) {
      m.addEventListener('click', (e) => { if (e.target === m) this.closeModals(); });
    }
  }

  show(name) {
    for (const k in this.screens) this.screens[k].classList.toggle('active', k === name);
    this.current = name;
    if (name === 'hangar') this.renderHangar();
    this.closeModals();
  }

  hideAll() {
    for (const k in this.screens) this.screens[k].classList.remove('active');
    this.current = 'flying';
  }

  openModal(name) {
    if (name === 'controls') this.renderControls();
    if (name === 'settings') this.renderSettings();
    if (name === 'records') this.renderRecords();
    if (name === 'install') this.renderInstall();
    for (const k in this.modals) this.modals[k].classList.toggle('open', k === name);
  }

  closeModals() {
    for (const k in this.modals) this.modals[k].classList.remove('open');
  }

  get modalOpen() {
    return Object.values(this.modals).some((m) => m.classList.contains('open'));
  }

  // ── Hangar ───────────────────────────────────────────────────────────────
  renderHangar() {
    const list = document.getElementById('map-list');
    const records = loadRecords();
    list.innerHTML = '';
    for (const m of MAPS) {
      const best = (records[m.id] || [])[0];
      const card = document.createElement('button');
      card.className = 'map-card' + (m.id === this.selectedMap.id ? ' selected' : '');
      card.style.setProperty('--card-accent', m.accent);
      card.innerHTML =
        '<h3>' + m.name + '</h3>' +
        '<div class="sub">' + m.subtitle + '</div>' +
        '<div class="meta">' +
        '<span class="dots">' + '●'.repeat(m.difficulty) + '○'.repeat(5 - m.difficulty) + '</span>' +
        '<span>' + m.landmarks.length + ' landmark types</span>' +
        '<span>' + (best ? 'BEST ' + best.total.toLocaleString() : 'no record') + '</span>' +
        '</div>';
      card.addEventListener('click', () => {
        this.selectedMap = m;
        this.weather = m.defaultWeather;
        this.time = m.defaultTime;
        this.renderHangar();
      });
      list.appendChild(card);
    }
    this.renderDetail();
  }

  renderDetail() {
    const m = this.selectedMap;
    const el = document.getElementById('map-detail');
    const records = loadRecords()[m.id] || [];
    const best = records[0];
    const w = WEATHER[this.weather], t = TIMES[this.time];

    el.innerHTML =
      '<div class="sub">' + m.subtitle + '</div>' +
      '<h2>' + m.name + '</h2>' +
      '<p class="brief">' + m.brief + '</p>' +

      '<div class="field"><label>Conditions</label><div class="chips" id="chips-weather"></div>' +
      '<div class="cond-note" id="note-weather"></div></div>' +

      '<div class="field"><label>Time of day</label><div class="chips" id="chips-time"></div>' +
      '<div class="cond-note" id="note-time"></div></div>' +

      '<div class="stat-row">' +
      '<div class="stat"><div class="k">Difficulty</div><div class="v">' +
      '●'.repeat(m.difficulty) + '<span style="opacity:.25">' + '●'.repeat(5 - m.difficulty) + '</span></div></div>' +
      '<div class="stat"><div class="k">Objectives</div><div class="v">' + m.objectives.length + '</div></div>' +
      '<div class="stat"><div class="k">Your best</div><div class="v">' +
      (best ? best.total.toLocaleString() : '—') + '</div></div>' +
      '</div>' +

      '<div class="field"><label>What is out there</label>' +
      '<div class="lm-list">' +
      m.landmarks.map((l) => {
        const info = POI_INFO[l.kind] || { label: l.kind, icon: '•' };
        return '<span class="lm">' + info.icon + ' <b>' + info.label + '</b>' +
          '<span class="n">×' + l.count + '</span></span>';
      }).join('') +
      '<span class="lm">★ <b>Hidden Vista</b><span class="n">×5</span></span>' +
      '</div></div>' +

      '<div class="launch">' +
      '<button class="btn primary big" data-action="launch">Mission briefing →</button>' +
      '</div>';

    const wc = el.querySelector('#chips-weather');
    for (const id of m.weather) {
      const wd = WEATHER[id];
      const c = document.createElement('button');
      c.className = 'chip' + (id === this.weather ? ' on' : '');
      c.innerHTML = '<span class="ic">' + wd.icon + '</span>' + wd.name;
      c.addEventListener('click', () => { this.weather = id; this.renderDetail(); });
      wc.appendChild(c);
    }
    const tc = el.querySelector('#chips-time');
    for (const id of m.times) {
      const td = TIMES[id];
      const c = document.createElement('button');
      c.className = 'chip' + (id === this.time ? ' on' : '');
      c.innerHTML = '<span class="ic">' + td.icon + '</span>' + td.name;
      c.addEventListener('click', () => { this.time = id; this.renderDetail(); });
      tc.appendChild(c);
    }
    el.querySelector('#note-weather').textContent =
      w.blurb + '  ·  Score ×' + w.scoreBonus.toFixed(2) +
      '  ·  Wind ' + w.windBase.toFixed(1) + ' m/s  ·  Visibility ' + (w.visibility / 1000).toFixed(1) + ' km';
    el.querySelector('#note-time').textContent =
      t.blurb + '  ·  Light ×' + t.lightBonus.toFixed(2) + '  ·  Sun ' + t.elev + '°';
  }

  // ── Briefing ─────────────────────────────────────────────────────────────
  renderBrief(map, weatherId, timeId) {
    const w = WEATHER[weatherId], t = TIMES[timeId];
    const el = document.getElementById('brief-card');
    const tip = TIPS[(Math.random() * TIPS.length) | 0];
    el.innerHTML =
      '<div class="brief-head"><div>' +
      '<div class="sub" style="color:var(--dim);font-size:11px;letter-spacing:.18em;text-transform:uppercase">Mission briefing</div>' +
      '<h2>' + map.name + '</h2></div>' +
      '<div class="brief-cond">' +
      '<span class="pill">' + w.icon + ' ' + w.name + '</span>' +
      '<span class="pill">' + t.icon + ' ' + t.name + '</span>' +
      '<span class="pill">⚡ 5:00 battery</span>' +
      '</div></div>' +
      '<p class="brief" style="color:var(--dim);line-height:1.75;font-size:13.5px">' + map.brief + '</p>' +
      '<ul class="obj-list">' +
      map.objectives.map((o, i) =>
        '<li><span class="idx">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span>' + o.text + '</span><span class="pts">+' + o.points + '</span></li>').join('') +
      '<li><span class="idx">··</span><span>Fly the ring course and find the hidden vistas</span>' +
      '<span class="pts">+220 / +180 ea</span></li>' +
      '<li><span class="idx">··</span><span>Land back on the pad with battery in reserve</span>' +
      '<span class="pts">up to +600</span></li>' +
      '</ul>' +
      '<div class="brief-tips"><h4>Field note</h4><ul><li>' + tip + '</li>' +
      '<li>Your six best stills and three best clips make the showreel — quality over volume.</li></ul></div>' +
      '<div class="row" style="margin-top:26px">' +
      '<button class="btn primary big" data-action="brief-launch">Launch ▸</button>' +
      '<button class="btn ghost" data-action="brief-back">Back</button>' +
      '<button class="btn ghost" data-action="open-controls">Controls</button>' +
      '</div>';
    this.show('brief');
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  showLoading(title, sub) {
    document.getElementById('loading-title').textContent = title;
    document.getElementById('loading-sub').textContent = sub || '';
    this.show('loading');
  }

  // ── Pause ────────────────────────────────────────────────────────────────
  showPause(session) {
    const sub = document.getElementById('pause-sub');
    sub.textContent = session
      ? session.photos.length + ' stills · ' + session.clips.length + ' clips · ' +
        formatTime(session.elapsed) + ' airborne · ' +
        Math.round(session.batteryLeft * 100) + '% battery'
      : '';
    this.show('pause');
  }

  // ── Results ──────────────────────────────────────────────────────────────
  renderResults(reel, session, map, record) {
    const el = document.getElementById('results-body');
    const g = reel.grade;
    const gallery = reel.photos.length
      ? '<div class="gallery">' + reel.photos.map(() => '<div class="shot"></div>').join('') + '</div>'
      : '<div class="empty">No stills were banked on this flight.</div>';

    el.innerHTML =
      '<div class="res-head">' +
      '<div><h2>' + map.name + ' · Showreel</h2>' +
      '<div class="res-total">' + reel.total.toLocaleString() + '</div>' +
      '<div class="res-sub">' + formatTime(session.elapsed) + ' airborne · ' +
      session.photos.length + ' stills · ' + session.clips.length + ' clips · ' +
      (session.crashed ? 'airframe lost' : 'recovered') + '</div></div>' +
      '<div style="text-align:right">' +
      '<div class="res-grade" style="color:' + g.color + '">' + g.grade + '</div>' +
      '<div class="res-sub">' + g.label + '</div>' +
      (record && record.isBest ? '<div style="margin-top:10px"><span class="newbest">NEW PERSONAL BEST</span></div>'
        : record ? '<div class="res-sub" style="margin-top:8px">Rank #' + record.rank + ' on this map</div>' : '') +
      '</div></div>' +

      '<div class="res-cols">' +
      '<div class="res-panel"><h3>Selected stills</h3>' + gallery + '</div>' +
      '<div class="res-panel"><h3>Score breakdown</h3>' +
      reel.lines.map((l) =>
        '<div class="score-line"><span class="lbl">' + l.label +
        '<div class="det">' + l.detail + '</div></span>' +
        '<span class="val" style="color:' + (l.value < 0 ? 'var(--bad)' : 'inherit') + '">' +
        (l.value > 0 ? '+' : '') + l.value.toLocaleString() + '</span></div>').join('') +
      '<h3 style="margin-top:22px">Clips</h3>' +
      (reel.clips.length ? reel.clips.map((c) =>
        '<div class="clip-line"><span style="font-weight:700;color:' + c.grade.color + '">' +
        c.grade.grade + '</span><span style="font-family:var(--mono)">' +
        c.duration.toFixed(1) + 's</span>' +
        '<span class="bar"><span style="width:' + Math.round(clamp01(c.smoothness) * 100) + '%"></span></span>' +
        '<span style="font-family:var(--mono)">' + c.score + '</span></div>').join('')
        : '<div class="empty">No clips recorded — press R next time.</div>') +
      '</div></div>' +

      '<div class="res-actions">' +
      '<button class="btn primary big" data-action="again">Fly it again</button>' +
      '<button class="btn" data-action="to-hangar">Back to hangar</button>' +
      '<button class="btn ghost" data-action="open-records">Records</button>' +
      '</div>';

    // Attach the real thumbnail canvases.
    const shots = el.querySelectorAll('.shot');
    reel.photos.forEach((p, i) => {
      const holder = shots[i];
      if (!holder) return;
      if (p.thumb) holder.appendChild(p.thumb);
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.innerHTML = '<span class="g" style="color:' + p.grade.color + '">' + p.grade.grade + '</span>' +
        '<span class="s">' + p.score + '</span>' +
        '<span class="n">' + (p.subjectNote || '') + '</span>';
      holder.appendChild(cap);
    });

    this.show('results');
  }

  // ── Modals ───────────────────────────────────────────────────────────────
  renderControls() {
    const el = document.getElementById('controls-grid');
    const set = this.h.isTouch ? TOUCH_CONTROLS.concat(CONTROLS.slice(0, 2)) : CONTROLS;
    el.innerHTML = set.map(([title, rows]) =>
      '<div><h4>' + title + '</h4><dl>' +
      rows.map(([k, v]) => '<div class="kv"><kbd>' + k + '</kbd><span>' + v + '</span></div>').join('') +
      '</dl></div>').join('');
  }

  renderSettings() {
    const el = document.getElementById('settings-body');
    const s = this.settings;
    const seg = (key, options, current) =>
      '<div class="seg" data-set="' + key + '">' +
      options.map(([v, lab]) =>
        '<button data-val="' + v + '" class="' + (String(current) === String(v) ? 'on' : '') + '">' +
        lab + '</button>').join('') + '</div>';

    el.innerHTML =
      '<div class="set-row"><div><div class="k">Render quality</div>' +
      '<div class="d">Terrain detail, draw distance and vegetation density</div></div>' +
      seg('quality', Object.keys(QUALITY).map((q) => [q, QUALITY[q].label]), s.quality) + '</div>' +

      '<div class="set-row"><div><div class="k">On-screen controls</div>' +
      '<div class="d">Virtual sticks and camera buttons for touchscreens</div></div>' +
      seg('touchControls', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']],
        s.touchControls || 'auto') + '</div>' +

      '<div class="set-row"><div><div class="k">Gimbal sensitivity</div>' +
      '<div class="d">Mouse travel per degree of gimbal movement</div></div>' +
      '<input type="range" min="0.3" max="2.5" step="0.1" value="' + s.sensitivity + '" data-set="sensitivity"></div>' +

      '<div class="set-row"><div><div class="k">Invert gimbal Y</div>' +
      '<div class="d">Push the mouse forward to look up</div></div>' +
      seg('invertY', [[false, 'Off'], [true, 'On']], s.invertY) + '</div>' +

      '<div class="set-row"><div><div class="k">Composition guides</div>' +
      '<div class="d">Rule-of-thirds grid and safe-area brackets</div></div>' +
      seg('guides', [[true, 'On'], [false, 'Off']], s.guides) + '</div>' +

      '<div class="set-row"><div><div class="k">Film grain</div>' +
      '<div class="d">Adds sensor noise to the image</div></div>' +
      seg('grain', [[true, 'On'], [false, 'Off']], s.grain) + '</div>' +

      '<div class="set-row"><div><div class="k">Pilot name</div>' +
      '<div class="d">Shown on the records table</div></div>' +
      '<input type="text" maxlength="12" value="' + (s.pilot || 'PILOT') + '" data-set="pilot" ' +
      'style="background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:8px;' +
      'padding:8px 12px;color:var(--ink);font:600 12px var(--mono);width:130px"></div>';

    el.querySelectorAll('.seg').forEach((seg2) => {
      seg2.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        let v = b.dataset.val;
        if (v === 'true') v = true; else if (v === 'false') v = false;
        this.h.onSetting(seg2.dataset.set, v);
        this.renderSettings();
      });
    });
    el.querySelectorAll('input[type=range]').forEach((inp) => {
      inp.addEventListener('input', () => this.h.onSetting(inp.dataset.set, parseFloat(inp.value)));
    });
    el.querySelectorAll('input[type=text]').forEach((inp) => {
      inp.addEventListener('change', () => this.h.onSetting(inp.dataset.set, inp.value.toUpperCase()));
    });
  }

  renderInstall() {
    const el = document.getElementById('install-body');
    const i = installInstructions();
    el.innerHTML =
      '<p class="hint" style="margin:0 0 14px">' + i.title + '</p>' +
      '<ol class="install-steps">' +
      i.steps.map((t) => '<li><span>' + t + '</span></li>').join('') +
      '</ol>' +
      '<div class="install-note">' + i.note + '</div>';
  }

  renderRecords() {
    const el = document.getElementById('records-body');
    const all = loadRecords();
    const blocks = [];
    for (const m of MAPS) {
      const list = all[m.id];
      if (!list || !list.length) continue;
      blocks.push(
        '<div class="rec-block"><div class="rec-map" style="color:' + m.accent + '">' + m.name + '</div>' +
        '<table class="rec-table"><thead><tr><th>#</th><th>Pilot</th><th>Score</th><th>Grade</th>' +
        '<th>Conditions</th><th>Stills</th><th>Clips</th><th>Date</th></tr></thead><tbody>' +
        list.map((r, i) =>
          '<tr><td class="num">' + (i + 1) + '</td><td>' + (r.pilot || 'PILOT') + '</td>' +
          '<td class="num">' + r.total.toLocaleString() + '</td>' +
          '<td style="color:' + r.gradeColor + ';font-weight:700">' + r.grade + '</td>' +
          '<td>' + r.weather + ' · ' + r.time + '</td>' +
          '<td class="num">' + r.photos + '</td><td class="num">' + r.clips + '</td>' +
          '<td class="num">' + r.date + '</td></tr>').join('') +
        '</tbody></table></div>');
    }
    el.innerHTML = blocks.length ? blocks.join('')
      : '<div class="empty">No flights logged yet. Go shoot something.</div>';
  }
}
