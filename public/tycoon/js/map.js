/**
 * MERIDIAN FIELD OPS — Interactive operations map.
 * Canvas rendering of territories, depot, live field units and open service
 * calls, with pan/zoom, hover read-out and click selection.
 */
(function (FST) {
  'use strict';

  var C = FST.Config, U = FST.Utils, S = FST.State, J = FST.Jobs, Charts = FST.Charts;
  var T = FST.I18n;

  var Map = U.emitter();
  var canvas = null, ctx = null;
  var view = { scale: 1, x: 0, y: 0, minScale: 0.4, maxScale: 3.2 };
  var size = { w: 0, h: 0, dpr: 1 };
  var pointer = { x: 0, y: 0, inside: false, dragging: false, moved: false, lastX: 0, lastY: 0 };
  var hover = null;
  var selection = { jobId: null, unitId: null };
  var state = null;

  var STATUS_COLOR = {
    idle: '#38bdf8', enroute: '#facc15', onsite: '#4ade80',
    returning: '#a78bfa', offshift: '#64748b', shop: '#fb7185'
  };

  Map.init = function (el, tooltipEl) {
    canvas = el;
    ctx = canvas.getContext('2d');
    Map.tooltip = tooltipEl;

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('dblclick', function () { Map.fit(); });

    resize();
    window.addEventListener('resize', U.throttle(resize, 120));
    if (window.ResizeObserver) new ResizeObserver(U.throttle(resize, 120)).observe(canvas.parentNode);
    return Map;
  };

  Map.setState = function (s) { state = s; };
  Map.select = function (sel) { selection = Object.assign({ jobId: null, unitId: null }, sel || {}); };
  Map.selection = function () { return selection; };

  function resize() {
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    size.dpr = window.devicePixelRatio || 1;
    size.w = Math.max(1, Math.floor(rect.width));
    size.h = Math.max(1, Math.floor(rect.height));
    canvas.width = size.w * size.dpr;
    canvas.height = size.h * size.dpr;
    Map.fit();
  }

  Map.fit = function () {
    if (!size.w) return;
    var scale = Math.min(size.w / C.WORLD.w, size.h / C.WORLD.h) * 0.98;
    view.minScale = scale * 0.85;
    view.scale = scale;
    view.x = (size.w - C.WORLD.w * scale) / 2;
    view.y = (size.h - C.WORLD.h * scale) / 2;
  };

  Map.focus = function (wx, wy, scale) {
    view.scale = U.clamp(scale || Math.max(view.scale, 1.1), view.minScale, view.maxScale);
    view.x = size.w / 2 - wx * view.scale;
    view.y = size.h / 2 - wy * view.scale;
    clampView();
  };

  function clampView() {
    var w = C.WORLD.w * view.scale, h = C.WORLD.h * view.scale;
    var marginX = Math.min(size.w * 0.5, w * 0.5);
    var marginY = Math.min(size.h * 0.5, h * 0.5);
    view.x = U.clamp(view.x, size.w - w - marginX, marginX);
    view.y = U.clamp(view.y, size.h - h - marginY, marginY);
  }

  function toWorld(sx, sy) {
    return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale };
  }
  function toScreen(wx, wy) {
    return { x: wx * view.scale + view.x, y: wy * view.scale + view.y };
  }

  /* ── Interaction ───────────────────────────────────────────────────────── */

  function onMove(e) {
    var rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.inside = true;

    if (pointer.dragging) {
      view.x += pointer.x - pointer.lastX;
      view.y += pointer.y - pointer.lastY;
      pointer.lastX = pointer.x;
      pointer.lastY = pointer.y;
      pointer.moved = true;
      clampView();
      canvas.style.cursor = 'grabbing';
      return;
    }
    hover = hitTest(pointer.x, pointer.y);
    canvas.style.cursor = hover ? 'pointer' : 'grab';
    updateTooltip();
  }

  function onLeave() {
    pointer.inside = false;
    hover = null;
    updateTooltip();
  }

  function onDown(e) {
    pointer.dragging = true;
    pointer.moved = false;
    var rect = canvas.getBoundingClientRect();
    pointer.lastX = e.clientX - rect.left;
    pointer.lastY = e.clientY - rect.top;
  }

  function onUp() {
    pointer.dragging = false;
    if (canvas) canvas.style.cursor = hover ? 'pointer' : 'grab';
  }

  function onWheel(e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var before = toWorld(mx, my);
    var factor = Math.exp(-e.deltaY * 0.0016);
    view.scale = U.clamp(view.scale * factor, view.minScale, view.maxScale);
    var after = toWorld(mx, my);
    view.x += (after.x - before.x) * view.scale;
    view.y += (after.y - before.y) * view.scale;
    clampView();
  }

  function onClick() {
    if (pointer.moved) return;              // a drag is not a click
    var hit = hitTest(pointer.x, pointer.y);
    if (!hit) { Map.emit('select', null); return; }
    Map.emit('select', hit);
  }

  function hitTest(sx, sy) {
    if (!state) return null;
    var world = toWorld(sx, sy);
    var best = null, bestDist = Infinity;
    var radius = 16 / view.scale;

    state.jobs.forEach(function (job) {
      if (job.status !== 'pending' && job.status !== 'assigned' && job.status !== 'active') return;
      var d = U.dist(world.x, world.y, job.x, job.y);
      if (d < radius && d < bestDist) { bestDist = d; best = { type: 'job', id: job.id, job: job }; }
    });
    state.fleet.forEach(function (unit) {
      var pos = Map.unitScreenPos(unit);
      var d = U.dist(world.x, world.y, pos.x, pos.y);
      if (d < radius && d < bestDist) { bestDist = d; best = { type: 'unit', id: unit.id, unit: unit }; }
    });
    return best;
  }

  function updateTooltip() {
    var el = Map.tooltip;
    if (!el) return;
    if (!hover || !pointer.inside) { el.classList.add('hidden'); return; }

    var html = '';
    if (hover.type === 'job') {
      var job = hover.job;
      var prio = C.PRIORITIES[job.priority];
      var left = job.deadline - state.time.minutes;
      html = '<div class="font-semibold text-slate-100">' + U.escape(J.jobLabel(job)) + '</div>' +
        '<div class="text-slate-400">' + U.escape(job.client) + '</div>' +
        '<div class="mt-1 flex items-center gap-2"><span style="color:' + prio.color + '">' +
          U.escape(J.priorityLabel(job.priority)) + '</span>' +
        '<span class="text-emerald-300">' + U.money(job.value) + '</span></div>' +
        '<div class="text-slate-400">' + U.escape(job.status === 'pending'
          ? (left > 0 ? T.t('map.tip.slaIn', { time: U.duration(left) }) : T.t('map.tip.slaExpired'))
          : T.t('map.tip.progress', { status: J.statusLabel(job.status === 'active' ? 'onsite' : 'enroute'),
              pct: Math.round((job.progress || 0) * 100) })) + '</div>' +
        '<div class="text-slate-500">' + U.escape(T.t('map.tip.needs', { caps: job.caps.map(J.capLabel).join(', ') })) + '</div>';
    } else {
      var unit = hover.unit;
      var spec = S.vehicle(unit.vehicle);
      html = '<div class="font-semibold text-slate-100">' + U.escape(unit.callsign) + ' · ' + U.escape(T.f(spec, 'name')) + '</div>' +
        '<div class="text-slate-400">' + U.escape(T.t('map.tip.crew',
          { status: J.statusLabel(unit.status), a: unit.crew.length, b: spec.crew })) + '</div>' +
        '<div class="text-slate-400">' + U.escape(T.t('map.tip.fuelCond',
          { fuel: Math.round(unit.fuel / spec.fuelCap * 100), cond: Math.round(unit.condition) })) + '</div>';
    }
    el.innerHTML = html;
    el.classList.remove('hidden');
    var ox = pointer.x + 16, oy = pointer.y + 16;
    if (ox + el.offsetWidth > size.w) ox = pointer.x - el.offsetWidth - 12;
    if (oy + el.offsetHeight > size.h) oy = pointer.y - el.offsetHeight - 12;
    el.style.transform = 'translate(' + Math.max(4, ox) + 'px,' + Math.max(4, oy) + 'px)';
  }

  /* ── Rendering ─────────────────────────────────────────────────────────── */

  Map.draw = function (now) {
    if (!ctx || !state) return;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    var t = (now || 0) / 1000;
    drawBackdrop();

    ctx.save();
    ctx.setTransform(size.dpr * view.scale, 0, 0, size.dpr * view.scale, view.x * size.dpr, view.y * size.dpr);

    drawRoads();
    drawTerritories(t);
    drawRoutes();
    drawJobs(t);
    drawDepot(t);
    drawUnits(t);

    ctx.restore();
    updateTooltip();
  };

  function drawBackdrop() {
    var grad = ctx.createLinearGradient(0, 0, 0, size.h);
    grad.addColorStop(0, '#070c16');
    grad.addColorStop(1, '#0b1220');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size.w, size.h);
  }

  function drawRoads() {
    ctx.save();
    ctx.strokeStyle = 'rgba(56,189,248,0.055)';
    ctx.lineWidth = 1 / view.scale;
    var step = 80, i;
    ctx.beginPath();
    for (i = 0; i <= C.WORLD.w; i += step) { ctx.moveTo(i, 0); ctx.lineTo(i, C.WORLD.h); }
    for (i = 0; i <= C.WORLD.h; i += step) { ctx.moveTo(0, i); ctx.lineTo(C.WORLD.w, i); }
    ctx.stroke();

    // Arterials the routing actually favours.
    ctx.strokeStyle = 'rgba(148,163,184,0.11)';
    ctx.lineWidth = 3 / view.scale;
    ctx.beginPath();
    for (i = 0; i <= C.WORLD.w; i += step * 4) { ctx.moveTo(i, 0); ctx.lineTo(i, C.WORLD.h); }
    for (i = 0; i <= C.WORLD.h; i += step * 4) { ctx.moveTo(0, i); ctx.lineTo(C.WORLD.w, i); }
    ctx.stroke();
    ctx.restore();
  }

  function drawTerritories(t) {
    C.TERRITORIES.forEach(function (terr) {
      var owned = state.territories.indexOf(terr.id) !== -1;
      var unlocked = S.isUnlocked(state, terr.unlock);
      ctx.save();

      var grad = ctx.createRadialGradient(terr.x, terr.y, terr.r * 0.15, terr.x, terr.y, terr.r);
      if (owned) {
        grad.addColorStop(0, 'rgba(34,211,238,0.13)');
        grad.addColorStop(1, 'rgba(34,211,238,0)');
      } else {
        grad.addColorStop(0, unlocked ? 'rgba(148,163,184,0.09)' : 'rgba(100,116,139,0.045)');
        grad.addColorStop(1, 'rgba(100,116,139,0)');
      }
      ctx.beginPath();
      ctx.arc(terr.x, terr.y, terr.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.setLineDash(owned ? [] : [10 / view.scale, 8 / view.scale]);
      ctx.strokeStyle = owned ? 'rgba(34,211,238,0.42)' : 'rgba(148,163,184,0.24)';
      ctx.lineWidth = (owned ? 1.6 : 1.1) / view.scale;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = owned ? 'rgba(165,243,252,0.82)' : 'rgba(148,163,184,0.6)';
      ctx.font = (owned ? '600 ' : '') + (13 / view.scale) + 'px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(T.f(terr, 'name').toUpperCase(), terr.x, terr.y - terr.r + 22 / view.scale);
      if (!owned) {
        ctx.fillStyle = 'rgba(148,163,184,0.5)';
        ctx.font = (11 / view.scale) + 'px ui-monospace, monospace';
        ctx.fillText(unlocked ? T.t('map.licence', { price: U.money(terr.price) }) : T.t('map.locked'),
          terr.x, terr.y - terr.r + 38 / view.scale);
      }
      ctx.restore();
    });
  }

  function drawRoutes() {
    ctx.save();
    state.fleet.forEach(function (unit) {
      if (!unit.path || unit.pathIndex >= unit.path.length) return;
      var active = unit.status === 'enroute';
      ctx.beginPath();
      ctx.moveTo(unit.x, unit.y);
      for (var i = unit.pathIndex; i < unit.path.length; i++) ctx.lineTo(unit.path[i].x, unit.path[i].y);
      ctx.strokeStyle = active ? 'rgba(250,204,21,0.5)' : 'rgba(167,139,250,0.3)';
      ctx.lineWidth = 1.6 / view.scale;
      ctx.setLineDash([6 / view.scale, 6 / view.scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    ctx.restore();
  }

  function drawJobs(t) {
    var open = state.jobs.filter(function (j) {
      return j.status === 'pending' || j.status === 'assigned' || j.status === 'active';
    });

    open.forEach(function (job) {
      var prio = C.PRIORITIES[job.priority];
      var selected = selection.jobId === job.id;
      var r = (job.priority === 'emergency' ? 8 : job.priority === 'urgent' ? 7 : 6) / view.scale;
      ctx.save();

      // Urgency ring: fills as the SLA window burns down.
      if (job.status === 'pending') {
        var total = Math.max(1, job.deadline - job.createdAt);
        var left = U.clamp((job.deadline - state.time.minutes) / total, 0, 1);
        ctx.beginPath();
        ctx.arc(job.x, job.y, r + 5 / view.scale, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
        ctx.strokeStyle = left > 0.5 ? 'rgba(74,222,128,0.75)' : left > 0.25 ? 'rgba(250,204,21,0.85)' : 'rgba(244,63,94,0.9)';
        ctx.lineWidth = 2.2 / view.scale;
        ctx.stroke();
      } else if (job.status === 'active') {
        ctx.beginPath();
        ctx.arc(job.x, job.y, r + 5 / view.scale, -Math.PI / 2, -Math.PI / 2 + (job.progress || 0) * Math.PI * 2);
        ctx.strokeStyle = 'rgba(56,189,248,0.9)';
        ctx.lineWidth = 2.4 / view.scale;
        ctx.stroke();
      }

      if (job.priority === 'emergency' && job.status === 'pending') {
        var pulse = (Math.sin(t * 4) + 1) / 2;
        ctx.beginPath();
        ctx.arc(job.x, job.y, (r + 6 + pulse * 9) / view.scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244,63,94,' + (0.16 * (1 - pulse)) + ')';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(job.x, job.y, r, 0, Math.PI * 2);
      ctx.fillStyle = job.status === 'pending' ? prio.color : 'rgba(15,23,42,0.9)';
      ctx.fill();
      ctx.strokeStyle = selected ? '#e2e8f0' : Charts.alpha(prio.color, 0.9);
      ctx.lineWidth = (selected ? 2.4 : 1.4) / view.scale;
      ctx.stroke();

      if (view.scale > 0.75 || selected) {
        ctx.fillStyle = 'rgba(226,232,240,0.78)';
        ctx.font = (10 / view.scale) + 'px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(U.moneyShort(job.value), job.x, job.y - (r + 9) / view.scale);
      }
      ctx.restore();
    });

    // When a call is selected, show which units could take it.
    if (selection.jobId) {
      var job = S.jobById(state, selection.jobId);
      if (job && job.status === 'pending') {
        var evals = J.evaluate(state, job).filter(function (e) { return e.eligible; }).slice(0, 3);
        ctx.save();
        evals.forEach(function (ev, i) {
          ctx.beginPath();
          ctx.moveTo(ev.unit.x, ev.unit.y);
          ctx.lineTo(job.x, job.y);
          ctx.strokeStyle = i === 0 ? 'rgba(74,222,128,0.55)' : 'rgba(148,163,184,0.22)';
          ctx.lineWidth = (i === 0 ? 2 : 1.1) / view.scale;
          ctx.setLineDash([4 / view.scale, 5 / view.scale]);
          ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }

  function drawDepot(t) {
    ctx.save();
    var r = 13 / view.scale;
    ctx.beginPath();
    ctx.arc(C.HQ.x, C.HQ.y, r + 7 / view.scale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34,211,238,0.10)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(C.HQ.x, C.HQ.y - r);
    ctx.lineTo(C.HQ.x + r, C.HQ.y);
    ctx.lineTo(C.HQ.x, C.HQ.y + r);
    ctx.lineTo(C.HQ.x - r, C.HQ.y);
    ctx.closePath();
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2 / view.scale;
    ctx.stroke();

    ctx.fillStyle = 'rgba(165,243,252,0.9)';
    ctx.font = '600 ' + (11 / view.scale) + 'px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(T.t('map.depot'), C.HQ.x, C.HQ.y + r + 14 / view.scale);
    ctx.restore();
  }

  function drawUnits(t) {
    // Units sitting at the depot are fanned out so each stays clickable.
    var parked = state.fleet.filter(function (u) {
      return U.dist(u.x, u.y, C.HQ.x, C.HQ.y) < 1;
    });
    var parkOffset = {};
    parked.forEach(function (u, i) {
      var a = (i / Math.max(1, parked.length)) * Math.PI * 2 - Math.PI / 2;
      parkOffset[u.id] = { x: Math.cos(a) * 30, y: Math.sin(a) * 30 };
    });

    state.fleet.forEach(function (unit) {
      var off = parkOffset[unit.id] || { x: 0, y: 0 };
      var px = unit.x + off.x, py = unit.y + off.y;
      var selected = selection.unitId === unit.id;
      var color = STATUS_COLOR[unit.status] || '#94a3b8';
      var r = 9 / view.scale;
      ctx.save();

      if (unit.status === 'onsite') {
        var pulse = (Math.sin(t * 3 + unit.x) + 1) / 2;
        ctx.beginPath();
        ctx.arc(px, py, r + (4 + pulse * 6) / view.scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(74,222,128,' + (0.12 * (1 - pulse)) + ')';
        ctx.fill();
      }

      // Chevron pointing along the current heading.
      var heading = 0;
      if (unit.path && unit.pathIndex < unit.path.length) {
        var tgt = unit.path[unit.pathIndex];
        heading = Math.atan2(tgt.y - unit.y, tgt.x - unit.x);
      }
      ctx.translate(px, py);
      ctx.rotate(heading);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.72, -r * 0.72);
      ctx.lineTo(-r * 0.3, 0);
      ctx.lineTo(-r * 0.72, r * 0.72);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = selected ? '#f8fafc' : 'rgba(2,6,23,0.85)';
      ctx.lineWidth = (selected ? 2.2 : 1.2) / view.scale;
      ctx.stroke();
      ctx.rotate(-heading);

      if (view.scale > 0.6 || selected) {
        ctx.fillStyle = 'rgba(226,232,240,0.9)';
        ctx.font = '600 ' + (10 / view.scale) + 'px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(unit.callsign, 0, -(r + 8) / view.scale);
      }
      ctx.restore();
    });
  }

  /** Drawn position of a unit, accounting for depot fan-out. */
  Map.unitScreenPos = function (unit) {
    if (U.dist(unit.x, unit.y, C.HQ.x, C.HQ.y) >= 1) return { x: unit.x, y: unit.y };
    var parked = state.fleet.filter(function (u) { return U.dist(u.x, u.y, C.HQ.x, C.HQ.y) < 1; });
    var i = parked.map(function (u) { return u.id; }).indexOf(unit.id);
    if (i < 0) return { x: unit.x, y: unit.y };
    var a = (i / Math.max(1, parked.length)) * Math.PI * 2 - Math.PI / 2;
    return { x: unit.x + Math.cos(a) * 30, y: unit.y + Math.sin(a) * 30 };
  };

  Map.zoomBy = function (factor) {
    var before = toWorld(size.w / 2, size.h / 2);
    view.scale = U.clamp(view.scale * factor, view.minScale, view.maxScale);
    var after = toWorld(size.w / 2, size.h / 2);
    view.x += (after.x - before.x) * view.scale;
    view.y += (after.y - before.y) * view.scale;
    clampView();
  };

  FST.Map = Map;
})(window.FST = window.FST || {});
