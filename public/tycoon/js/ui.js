/**
 * MERIDIAN FIELD OPS — Presentation layer.
 * Renders the executive dashboard, management panels and modals, and turns
 * user intent into calls on the simulation modules.
 */
(function (FST) {
  'use strict';

  var C = FST.Config, U = FST.Utils, S = FST.State, E = FST.Economy,
      J = FST.Jobs, Units = FST.Units, Charts = FST.Charts, Notify = FST.Notify, Map = FST.Map;

  var UI = U.emitter();
  var state = null;
  var els = {};
  var activeTab = 'dispatch';
  var dispatchOpenFor = null;
  var selection = { jobId: null, unitId: null };
  var lastCash = null;

  var TABS = [
    { id: 'dispatch', label: 'Dispatch', badge: function (s) {
        return s.jobs.filter(function (j) { return j.status === 'pending'; }).length; } },
    { id: 'fleet', label: 'Fleet', badge: function (s) { return s.fleet.length; } },
    { id: 'crew', label: 'Crew', badge: function (s) { return s.staff.length; } },
    { id: 'equipment', label: 'Equip', badge: function (s) { return s.tools.length; } },
    { id: 'contracts', label: 'Contracts', badge: function (s) { return s.offers.contracts.length || null; } },
    { id: 'finance', label: 'Finance' },
    { id: 'growth', label: 'Growth', badge: function (s) {
        return C.MILESTONES.length - s.milestones.length; } }
  ];

  /* ── Small view helpers ────────────────────────────────────────────────── */

  function meter(value, max, color, height) {
    var pct = U.clamp(value / (max || 1), 0, 1) * 100;
    return '<div class="meter" style="height:' + (height || 4) + 'px"><span style="width:' + pct.toFixed(1) + '%;background:' + color + '"></span></div>';
  }

  function chip(text, cls, style) {
    return '<span class="chip ' + (cls || 'bg-slate-800 text-slate-400') + '"' +
      (style ? ' style="' + style + '"' : '') + '>' + U.escape(text) + '</span>';
  }

  function sectorChip(sectorId) {
    var sec = C.SECTORS[sectorId];
    if (!sec) return '';
    return '<span class="chip" style="background:' + Charts.alpha(sec.color, 0.16) + ';color:' + sec.color + '">' + sec.label + '</span>';
  }

  function priorityChip(priority) {
    var p = C.PRIORITIES[priority];
    var cls = priority === 'emergency' ? 'bg-rose-500/15 text-rose-300'
      : priority === 'urgent' ? 'bg-amber-400/15 text-amber-300' : 'bg-slate-700/60 text-slate-400';
    return '<span class="chip ' + cls + (priority === 'emergency' ? ' pulse-emergency' : '') + '">' + p.label + '</span>';
  }

  function healthColor(pct) {
    return pct > 0.6 ? '#34d399' : pct > 0.3 ? '#fbbf24' : '#fb7185';
  }

  function empty(msg) {
    return '<div class="px-4 py-10 text-center text-[11.5px] text-slate-600">' + U.escape(msg) + '</div>';
  }

  function sectionHead(title, right) {
    return '<div class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-ink-900/95 px-3 py-1.5 backdrop-blur">' +
      '<h3 class="panel-title">' + U.escape(title) + '</h3>' +
      '<div class="flex items-center gap-2 text-[10px] text-slate-500">' + (right || '') + '</div></div>';
  }

  function money(n) { return U.money(n); }

  /* ── Boot ──────────────────────────────────────────────────────────────── */

  UI.init = function (gameState) {
    state = gameState;
    ['hud-company', 'hud-cash', 'hud-net', 'hud-tax', 'hud-csat', 'hud-networth',
     'hud-clock', 'hud-date', 'kpi-row', 'tabs', 'panel', 'map-summary', 'modal-root']
      .forEach(function (id) { els[id] = document.getElementById(id); });

    renderTabs();

    els.tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-tab]');
      if (!btn) return;
      activeTab = btn.dataset.tab;
      dispatchOpenFor = null;
      renderTabs();
      renderPanel();
    });

    els.panel.addEventListener('click', onAction);
    els.panel.addEventListener('change', onChange);
    els['modal-root'].addEventListener('click', onAction);

    document.querySelectorAll('[data-speed]').forEach(function (btn) {
      btn.addEventListener('click', function () { UI.emit('speed', parseInt(btn.dataset.speed, 10)); });
    });

    document.getElementById('map-zoom-in').addEventListener('click', function () { Map.zoomBy(1.25); });
    document.getElementById('map-zoom-out').addEventListener('click', function () { Map.zoomBy(0.8); });
    document.getElementById('map-fit').addEventListener('click', function () { Map.fit(); });
    document.getElementById('log-clear').addEventListener('click', function () { Notify.clearLog(); });
    document.getElementById('btn-save').addEventListener('click', function () { UI.emit('save'); });
    document.getElementById('btn-menu').addEventListener('click', function () { UI.showMenu(); });

    return UI;
  };

  UI.setState = function (s) {
    state = s;
    selection = { jobId: null, unitId: null };
    dispatchOpenFor = null;
    lastCash = null;
    UI.render(true);
  };

  UI.select = function (sel) {
    selection = sel || { jobId: null, unitId: null };
    Map.select(selection);
    if (selection.jobId) {
      activeTab = 'dispatch';
      dispatchOpenFor = selection.jobId;
    } else if (selection.unitId) {
      activeTab = 'fleet';
    }
    renderTabs();
    renderPanel();
  };

  /* ── Render orchestration ──────────────────────────────────────────────── */

  var renderPanelThrottled = U.throttle(function () { renderPanel(); }, 500);

  UI.render = function (force) {
    if (!state) return;
    renderHud();
    renderKpis();
    renderMapSummary();
    renderTabBadges();
    if (force) renderPanel(); else renderPanelThrottled();
  };

  function renderHud() {
    var cal = U.calendar(state.time.minutes);
    els['hud-company'].textContent = state.company.name;
    els['hud-clock'].textContent = U.clock(state.time.minutes);
    els['hud-date'].textContent = cal.label + (Units.onShift(state) ? '' : ' · OFF SHIFT');

    var cash = state.finance.cash;
    els['hud-cash'].textContent = U.money(cash);
    els['hud-cash'].className = 'font-mono text-[15px] font-bold ' +
      (cash < 0 ? 'text-rose-400' : cash < 25000 ? 'text-amber-300' : 'text-emerald-300');
    if (lastCash !== null && Math.abs(cash - lastCash) > 1) {
      els['hud-cash'].classList.remove('flash');
      void els['hud-cash'].offsetWidth;
      els['hud-cash'].classList.add('flash');
    }
    lastCash = cash;

    var today = state.finance.today;
    var net = E.sum(today.revenue) - E.sum(today.expense);
    els['hud-net'].textContent = (net >= 0 ? '+' : '') + U.money(net);
    els['hud-net'].className = 'font-mono text-[15px] font-bold ' + (net >= 0 ? 'text-emerald-300' : 'text-rose-400');

    els['hud-tax'].textContent = U.money(state.finance.taxAccrued);
    els['hud-csat'].textContent = state.ops.csat.toFixed(1);
    els['hud-csat'].className = 'font-mono text-[15px] font-bold ' +
      (state.ops.csat >= 75 ? 'text-emerald-300' : state.ops.csat >= 50 ? 'text-sky-300' : 'text-rose-400');
    els['hud-networth'].textContent = U.moneyShort(S.netWorth(state));

    document.querySelectorAll('[data-speed]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(parseInt(btn.dataset.speed, 10) === speedIndex()));
    });
  }

  function speedIndex() {
    return C.TIME.SPEEDS.indexOf(state.time.speed);
  }

  function renderKpis() {
    var history = state.finance.history;
    var last7 = E.window(state, 7);
    var pending = state.jobs.filter(function (j) { return j.status === 'pending'; });
    var active = state.jobs.filter(function (j) { return j.status === 'active' || j.status === 'assigned'; });
    var available = state.fleet.filter(function (u) { return S.isAvailable(state, u); }).length;
    var demand = J.demandPerDay(state), capacity = J.capacityPerDay(state);

    var tiles = [
      {
        label: '7-day net', value: U.moneyShort(last7.profit),
        tone: last7.profit >= 0 ? 'text-emerald-300' : 'text-rose-400',
        sub: 'rev ' + U.moneyShort(last7.revenue) + ' · exp ' + U.moneyShort(last7.expense),
        spark: history.slice(-14).map(function (d) { return d.profit; }),
        sparkColor: last7.profit >= 0 ? '#4ade80' : '#fb7185'
      },
      {
        label: 'Open calls', value: String(pending.length),
        tone: pending.length > state.fleet.length * 2 ? 'text-amber-300' : 'text-slate-100',
        sub: active.length + ' in progress · ' + available + '/' + state.fleet.length + ' units free',
        bar: { value: available, max: Math.max(1, state.fleet.length), color: '#38bdf8' }
      },
      {
        label: 'Load factor', value: (demand / Math.max(0.1, capacity) * 100).toFixed(0) + '%',
        tone: demand > capacity * 1.15 ? 'text-rose-400' : demand > capacity * 0.85 ? 'text-amber-300' : 'text-emerald-300',
        sub: demand.toFixed(1) + ' calls/day vs ' + capacity.toFixed(1) + ' capacity',
        bar: { value: demand, max: Math.max(demand, capacity), color: demand > capacity ? '#fb7185' : '#34d399' }
      },
      {
        label: 'Reputation', value: state.ops.csat.toFixed(0),
        tone: state.ops.csat >= 75 ? 'text-emerald-300' : state.ops.csat >= 50 ? 'text-sky-300' : 'text-rose-400',
        sub: state.stats.jobsDone + ' closed · ' + state.stats.jobsExpired + ' lost · streak ' + state.ops.streak,
        bar: { value: state.ops.csat, max: 100, color: healthColor(state.ops.csat / 100) }
      }
    ];

    els['kpi-row'].innerHTML = tiles.map(function (t, i) {
      return '<div class="panel px-3 py-2">' +
        '<p class="font-mono text-[9px] uppercase tracking-wider text-slate-500">' + t.label + '</p>' +
        '<p class="mt-0.5 font-mono text-lg font-bold leading-none ' + t.tone + '">' + t.value + '</p>' +
        (t.spark ? '<canvas class="mt-1.5 h-5 w-full" data-spark="' + i + '"></canvas>'
                 : '<div class="mt-2">' + meter(t.bar.value, t.bar.max, t.bar.color) + '</div>') +
        '<p class="mt-1.5 truncate font-mono text-[9.5px] text-slate-500">' + U.escape(t.sub) + '</p>' +
        '</div>';
    }).join('');

    tiles.forEach(function (t, i) {
      if (!t.spark) return;
      var cv = els['kpi-row'].querySelector('[data-spark="' + i + '"]');
      if (cv) Charts.spark(cv, t.spark, t.sparkColor);
    });
  }

  function renderMapSummary() {
    var pending = state.jobs.filter(function (j) { return j.status === 'pending'; }).length;
    var moving = state.fleet.filter(function (u) { return u.status === 'enroute' || u.status === 'returning'; }).length;
    var onsite = state.fleet.filter(function (u) { return u.status === 'onsite'; }).length;
    els['map-summary'].textContent = state.territories.length + ' territories · ' + pending + ' open · ' +
      moving + ' moving · ' + onsite + ' on site';
  }

  function renderTabs() {
    els.tabs.innerHTML = TABS.map(function (t) {
      return '<button class="tab" role="tab" data-tab="' + t.id + '" aria-selected="' + (t.id === activeTab) + '">' +
        t.label + '<span class="tab-badge" data-badge="' + t.id + '"></span></button>';
    }).join('');
    renderTabBadges();
  }

  function renderTabBadges() {
    TABS.forEach(function (t) {
      var el = els.tabs.querySelector('[data-badge="' + t.id + '"]');
      if (!el) return;
      var value = t.badge ? t.badge(state) : null;
      if (!value) { el.textContent = ''; el.className = 'tab-badge'; return; }
      el.textContent = value;
      var urgent = t.id === 'dispatch' && state.jobs.some(function (j) {
        return j.status === 'pending' && j.priority === 'emergency';
      });
      el.className = 'tab-badge ' + (urgent ? 'bg-rose-500/25 text-rose-300' : 'bg-slate-700/70 text-slate-400');
    });
  }

  function renderPanel() {
    if (!state || !els.panel) return;
    // Never yank the DOM out from under an open dropdown or a focused field.
    var focused = document.activeElement;
    if (focused && els.panel.contains(focused) && /SELECT|INPUT/.test(focused.tagName)) return;

    var html = (PANELS[activeTab] || PANELS.dispatch)();
    els.panel.innerHTML = html;
    if (activeTab === 'finance') drawFinanceCharts();
  }
  UI.renderPanel = renderPanel;

  /* ── Panel: Dispatch ───────────────────────────────────────────────────── */

  var PANELS = {};

  PANELS.dispatch = function () {
    var pending = state.jobs.filter(function (j) { return j.status === 'pending'; })
      .sort(function (a, b) {
        var w = { emergency: 0, urgent: 1, routine: 2 };
        if (w[a.priority] !== w[b.priority]) return w[a.priority] - w[b.priority];
        return a.deadline - b.deadline;
      });
    var live = state.jobs.filter(function (j) { return j.status === 'assigned' || j.status === 'active'; });

    var head = '<div class="flex items-center justify-between border-b border-slate-800 px-3 py-2">' +
      '<div><h3 class="panel-title">Service board</h3>' +
      '<p class="mt-0.5 font-mono text-[10px] text-slate-500">' + pending.length + ' awaiting dispatch · ' + live.length + ' in flight</p></div>' +
      '<button class="btn ' + (state.ops.autoDispatch ? 'btn-ok' : 'btn-ghost') + '" data-act="toggle-auto">' +
      (state.ops.autoDispatch ? '● Auto-dispatch on' : '○ Auto-dispatch off') + '</button></div>';

    var liveHtml = live.length ? sectionHead('In progress', live.length + ' active') +
      '<div class="space-y-1.5 p-2">' + live.map(liveCard).join('') + '</div>' : '';

    var pendingHtml = pending.length
      ? '<div class="space-y-1.5 p-2">' + pending.map(pendingCard).join('') + '</div>'
      : empty('No open service calls. Crews are clear.');

    return head + sectionHead('Awaiting dispatch') + pendingHtml + liveHtml;
  };

  function pendingCard(job) {
    var left = job.deadline - state.time.minutes;
    var total = Math.max(1, job.deadline - job.createdAt);
    var frac = U.clamp(left / total, 0, 1);
    var open = dispatchOpenFor === job.id;
    var evals = open ? J.evaluate(state, job) : null;
    var best = J.evaluate(state, job).filter(function (e) { return e.eligible; })[0];

    return '<div class="card p-2.5' + (selection.jobId === job.id ? ' is-selected' : '') + '" data-job="' + job.id + '">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="min-w-0">' +
          '<p class="truncate text-[12.5px] font-semibold text-slate-100">' + U.escape(job.label) + '</p>' +
          '<p class="truncate text-[11px] text-slate-500">' + U.escape(job.client) +
            (job.contractId ? ' · <span class="text-cyan-400">contract</span>' : '') + '</p>' +
        '</div>' +
        '<div class="shrink-0 text-right">' +
          '<p class="font-mono text-[13px] font-bold text-emerald-300">' + U.money(job.value) + '</p>' +
          '<p class="font-mono text-[9.5px] ' + (frac > 0.4 ? 'text-slate-500' : 'text-rose-400') + '">SLA ' + U.duration(left) + '</p>' +
        '</div>' +
      '</div>' +

      '<div class="mt-1.5 flex flex-wrap items-center gap-1">' +
        priorityChip(job.priority) + sectorChip(job.sector) +
        job.caps.map(function (c) {
          var have = J.capFielded(state, c);
          return chip((C.CAPABILITIES[c] || {}).icon + ' ' + J.capLabel(c),
            have ? 'bg-slate-800 text-slate-400' : 'bg-rose-500/15 text-rose-300');
        }).join('') +
        chip('skill ' + job.skill, 'bg-slate-800 text-slate-400') +
        chip(U.duration(job.duration), 'bg-slate-800 text-slate-400') +
      '</div>' +

      '<div class="mt-2">' + meter(frac, 1, frac > 0.5 ? '#34d399' : frac > 0.25 ? '#fbbf24' : '#fb7185') + '</div>' +

      '<div class="mt-2 flex items-center justify-between gap-2">' +
        '<p class="truncate font-mono text-[10px] text-slate-500">' +
          (best ? 'Best: ' + best.unit.callsign + ' · ETA ' + U.duration(best.eta) +
            (best.onTime ? '' : ' <span class="text-rose-400">(late)</span>')
            : '<span class="text-rose-400">No eligible unit</span>') + '</p>' +
        '<div class="flex gap-1">' +
          '<button class="btn btn-ghost" data-act="focus-job" data-id="' + job.id + '">Locate</button>' +
          '<button class="btn btn-primary" data-act="dispatch-open" data-id="' + job.id + '">' + (open ? 'Close' : 'Dispatch') + '</button>' +
        '</div>' +
      '</div>' +

      (open ? dispatchList(job, evals) : '') +
    '</div>';
  }

  function dispatchList(job, evals) {
    if (!evals.length) return '<p class="mt-2 text-[11px] text-slate-500">No units in the fleet.</p>';
    return '<div class="mt-2 space-y-1 border-t border-slate-800 pt-2">' +
      '<p class="font-mono text-[9px] uppercase tracking-wider text-slate-500">Recommended assignment</p>' +
      evals.map(function (ev, i) {
        var u = ev.unit;
        return '<div class="flex items-center gap-2 rounded-md px-1.5 py-1 ' +
            (ev.eligible ? 'bg-slate-800/40' : 'opacity-55') + '">' +
          '<span class="w-4 shrink-0 text-center font-mono text-[10px] ' + (i === 0 && ev.eligible ? 'text-emerald-400' : 'text-slate-600') + '">' + (i + 1) + '</span>' +
          '<div class="min-w-0 flex-1">' +
            '<p class="truncate text-[11.5px] font-semibold text-slate-200">' + U.escape(u.callsign) +
              ' <span class="font-normal text-slate-500">' + U.escape(S.vehicle(u.vehicle).name) + '</span></p>' +
            '<p class="truncate font-mono text-[9.5px] ' + (ev.eligible ? 'text-slate-500' : 'text-rose-400') + '">' +
              (ev.eligible
                ? 'ETA ' + U.duration(ev.eta) + ' · ' + Math.round(ev.distance) + 'km · skill ' + Math.round(ev.skill) +
                  ' (' + (ev.skillMargin >= 0 ? '+' : '') + Math.round(ev.skillMargin) + ') · ' + ev.fuelNeeded.toFixed(0) + 'L' +
                  (ev.overtime ? ' · overtime' : '')
                : ev.blockers.join(' · ')) + '</p>' +
          '</div>' +
          '<span class="shrink-0 font-mono text-[10px] ' +
            (!ev.eligible ? 'text-slate-700' : ev.onTime ? 'text-slate-400' : 'text-amber-400') + '" title="Dispatch score">' +
            (ev.eligible ? ev.score : '—') + '</span>' +
          '<button class="btn btn-primary shrink-0" data-act="dispatch-unit" data-id="' + job.id + '" data-unit="' + u.id + '"' +
            (ev.eligible ? '' : ' disabled') + '>Send</button>' +
        '</div>';
      }).join('') + '</div>';
  }

  function liveCard(job) {
    var unit = job.unitId ? S.unitById(state, job.unitId) : null;
    var eta = unit ? Units.etaComplete(state, unit) : 0;
    var late = state.time.minutes + eta > job.deadline;
    return '<div class="card p-2.5">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="min-w-0">' +
          '<p class="truncate text-[12px] font-semibold text-slate-100">' + U.escape(job.label) + '</p>' +
          '<p class="truncate text-[10.5px] text-slate-500">' + U.escape(job.client) + ' · ' +
            (unit ? U.escape(unit.callsign) + ' · ' + J.statusLabel(unit.status) : 'unassigned') + '</p>' +
        '</div>' +
        '<div class="shrink-0 text-right">' +
          '<p class="font-mono text-[12px] font-bold text-emerald-300">' + U.money(job.value) + '</p>' +
          '<p class="font-mono text-[9.5px] ' + (late ? 'text-rose-400' : 'text-slate-500') + '">done in ' + U.duration(eta) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="mt-2 flex items-center gap-2">' +
        '<div class="flex-1">' + meter(job.progress || 0, 1, '#38bdf8') + '</div>' +
        '<span class="font-mono text-[10px] text-slate-500">' + Math.round((job.progress || 0) * 100) + '%</span>' +
        '<button class="btn btn-ghost" data-act="recall" data-unit="' + (unit ? unit.id : '') + '"' + (unit ? '' : ' disabled') + '>Recall</button>' +
      '</div>' +
      (job.complication ? '<p class="mt-1.5 font-mono text-[9.5px] text-amber-400">Scope change: +' +
        U.duration(job.complication.extra) + ' · ' + U.money(job.complication.parts) + ' parts</p>' : '') +
    '</div>';
  }

  /* ── Panel: Fleet ──────────────────────────────────────────────────────── */

  PANELS.fleet = function () {
    var cards = state.fleet.map(unitCard).join('');
    var catalog = C.VEHICLES.map(vehicleRow).join('');
    return sectionHead('Field units', state.fleet.length + ' in service') +
      (state.fleet.length ? '<div class="space-y-1.5 p-2">' + cards + '</div>' : empty('No vehicles. Acquire one below.')) +
      sectionHead('Acquire vehicles', 'cash ' + U.moneyShort(state.finance.cash)) +
      '<div class="space-y-1.5 p-2">' + catalog + '</div>';
  };

  function unitCard(unit) {
    var spec = S.vehicle(unit.vehicle);
    var crew = S.crewOf(state, unit);
    var tools = S.toolsOf(state, unit);
    var job = unit.jobId ? S.jobById(state, unit.jobId) : null;
    var fuelPct = unit.fuel / spec.fuelCap;
    var statusTone = {
      idle: 'bg-sky-500/15 text-sky-300', enroute: 'bg-amber-400/15 text-amber-300',
      onsite: 'bg-emerald-500/15 text-emerald-300', returning: 'bg-violet-500/15 text-violet-300',
      offshift: 'bg-slate-700/60 text-slate-400', shop: 'bg-rose-500/15 text-rose-300'
    }[unit.status];

    return '<div class="card p-2.5' + (selection.unitId === unit.id ? ' is-selected' : '') + '">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="min-w-0">' +
          '<p class="truncate text-[12.5px] font-semibold text-slate-100">' + U.escape(unit.callsign) +
            ' <span class="ml-1 font-normal text-slate-500">' + U.escape(spec.name) + '</span></p>' +
          '<p class="truncate text-[10.5px] text-slate-500">' +
            (job ? U.escape(job.label) + ' · ' + U.escape(job.client) : Math.round(unit.odometer) + ' km lifetime · ' + unit.jobsDone + ' jobs') + '</p>' +
        '</div>' +
        '<span class="chip ' + statusTone + '">' + J.statusLabel(unit.status) + '</span>' +
      '</div>' +

      '<div class="mt-2 grid grid-cols-3 gap-2">' +
        gauge('Fuel', Math.round(fuelPct * 100) + '%', fuelPct, healthColor(fuelPct)) +
        gauge('Condition', Math.round(unit.condition) + '%', unit.condition / 100, healthColor(unit.condition / 100)) +
        gauge('Crew skill', String(Math.round(S.crewSkill(state, unit))), U.clamp(S.crewSkill(state, unit) / 100, 0, 1), '#38bdf8') +
      '</div>' +

      '<div class="mt-2 flex flex-wrap items-center gap-1">' +
        chip('crew ' + crew.length + '/' + spec.crew, crew.length ? 'bg-slate-800 text-slate-400' : 'bg-rose-500/15 text-rose-300') +
        chip('bays ' + tools.length + '/' + spec.slots, 'bg-slate-800 text-slate-400') +
        S.unitCaps(state, unit).map(function (c) {
          return chip((C.CAPABILITIES[c] || {}).icon + ' ' + J.capLabel(c), 'bg-cyan-500/10 text-cyan-300');
        }).join('') +
      '</div>' +

      (crew.length ? '<p class="mt-1.5 truncate font-mono text-[9.5px] text-slate-500">' +
        crew.map(function (p) { return U.escape(p.name) + ' (' + Math.round(p.skill) + ')'; }).join(' · ') + '</p>' : '') +

      '<div class="mt-2 flex flex-wrap gap-1">' +
        '<button class="btn btn-ghost" data-act="focus-unit" data-unit="' + unit.id + '">Locate</button>' +
        '<button class="btn btn-ghost" data-act="refuel" data-unit="' + unit.id + '"' + (fuelPct > 0.99 ? ' disabled' : '') + '>Refuel ' +
          U.moneyShort((spec.fuelCap - unit.fuel) * E.fuelPrice(state)) + '</button>' +
        '<button class="btn btn-ghost" data-act="service" data-unit="' + unit.id + '"' + (unit.condition > 99 ? ' disabled' : '') + '>Service ' +
          U.moneyShort((100 - unit.condition) * C.ECONOMY.REPAIR_COST_PER_POINT * (0.7 + spec.tier * 0.35)) + '</button>' +
        (job ? '<button class="btn btn-danger" data-act="recall" data-unit="' + unit.id + '">Recall</button>' : '') +
        '<button class="btn btn-danger" data-act="sell-unit" data-unit="' + unit.id + '">Sell</button>' +
      '</div>' +
    '</div>';
  }

  function gauge(label, value, frac, color) {
    return '<div>' +
      '<div class="flex items-baseline justify-between"><span class="font-mono text-[9px] uppercase tracking-wider text-slate-500">' + label + '</span>' +
      '<span class="font-mono text-[10.5px] font-semibold text-slate-300">' + value + '</span></div>' +
      '<div class="mt-1">' + meter(frac, 1, color) + '</div></div>';
  }

  function vehicleRow(spec) {
    var locked = !S.isUnlocked(state, spec.unlock);
    var affordable = E.canAfford(state, spec.price);
    return '<div class="card p-2.5' + (locked ? ' opacity-55' : '') + '">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="min-w-0">' +
          '<p class="truncate text-[12px] font-semibold text-slate-100">' + U.escape(spec.name) + '</p>' +
          '<p class="text-[10.5px] leading-snug text-slate-500">' + U.escape(spec.blurb) + '</p>' +
        '</div>' +
        '<p class="shrink-0 font-mono text-[12.5px] font-bold ' + (affordable && !locked ? 'text-emerald-300' : 'text-slate-500') + '">' + U.money(spec.price) + '</p>' +
      '</div>' +
      '<div class="mt-1.5 flex flex-wrap items-center gap-1">' +
        chip('tier ' + spec.tier, 'bg-slate-800 text-slate-400') +
        chip('speed ' + spec.speed, 'bg-slate-800 text-slate-400') +
        chip('crew ' + spec.crew, 'bg-slate-800 text-slate-400') +
        chip('bays ' + spec.slots, 'bg-slate-800 text-slate-400') +
        chip(spec.fuelCap + 'L', 'bg-slate-800 text-slate-400') +
        chip(U.money(spec.upkeep) + '/day', 'bg-slate-800 text-slate-400') +
        spec.caps.map(function (c) { return chip((C.CAPABILITIES[c] || {}).icon + ' ' + J.capLabel(c), 'bg-cyan-500/10 text-cyan-300'); }).join('') +
      '</div>' +
      '<div class="mt-2 flex items-center justify-between">' +
        '<span class="font-mono text-[9.5px] text-slate-500">' + (locked ? 'Locked · ' + milestoneName(spec.unlock) : '') + '</span>' +
        '<button class="btn btn-primary" data-act="buy-vehicle" data-id="' + spec.id + '"' + (locked || !affordable ? ' disabled' : '') + '>Purchase</button>' +
      '</div>' +
    '</div>';
  }

  function milestoneName(id) {
    var m = S.milestone(id);
    return m ? 'requires ' + m.name : 'locked';
  }

  /* ── Panel: Crew ───────────────────────────────────────────────────────── */

  PANELS.crew = function () {
    var cap = S.staffCap(state);
    var payroll = S.dailyPayroll(state);
    var roster = state.staff.map(personCard).join('');
    var market = state.offers.candidates.map(candidateCard).join('');

    return sectionHead('Roster', state.staff.length + '/' + cap + ' · payroll ' + U.moneyShort(payroll) + '/day') +
      (state.staff.length ? '<div class="space-y-1.5 p-2">' + roster + '</div>' : empty('No personnel on the books.')) +
      sectionHead('Labour market', 'refreshes every 2 days') +
      (market ? '<div class="space-y-1.5 p-2">' + market + '</div>' : empty('No candidates available today.'));
  };

  function unitOptions(selectedId, forPerson) {
    var opts = '<option value="">— unassigned —</option>';
    state.fleet.forEach(function (u) {
      var spec = S.vehicle(u.vehicle);
      var full = u.crew.length >= spec.crew && u.id !== selectedId;
      opts += '<option value="' + u.id + '"' + (u.id === selectedId ? ' selected' : '') +
        (full ? ' disabled' : '') + '>' + U.escape(u.callsign) + ' (' + u.crew.length + '/' + spec.crew + ')</option>';
    });
    return opts;
  }

  function personCard(person) {
    var unit = person.unitId ? S.unitById(state, person.unitId) : null;
    var busy = unit && ['enroute', 'onsite'].indexOf(unit.status) !== -1;
    var trainCost = trainingQuote(person);

    return '<div class="card p-2.5">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="min-w-0">' +
          '<p class="truncate text-[12.5px] font-semibold text-slate-100">' + U.escape(person.name) + '</p>' +
          '<p class="truncate text-[10.5px] text-slate-500">' + U.escape(person.roleLabel) + ' · ' +
            U.money(person.wage) + '/day · ' + person.jobsDone + ' jobs</p>' +
        '</div>' +
        (person.training
          ? '<span class="chip bg-violet-500/15 text-violet-300">training ' + person.training.remaining + 'd</span>'
          : unit ? '<span class="chip bg-cyan-500/10 text-cyan-300">' + U.escape(unit.callsign) + '</span>'
                 : '<span class="chip bg-slate-700/60 text-slate-400">bench</span>') +
      '</div>' +

      '<div class="mt-2 grid grid-cols-3 gap-2">' +
        gauge('Skill', String(Math.round(person.skill)), person.skill / 100, '#38bdf8') +
        gauge('Fatigue', Math.round(person.fatigue) + '%', person.fatigue / 100, healthColor(1 - person.fatigue / 100)) +
        gauge('Morale', Math.round(person.morale) + '%', person.morale / 100, healthColor(person.morale / 100)) +
      '</div>' +

      '<div class="mt-2 flex flex-wrap items-center gap-1.5">' +
        '<select class="field flex-1 min-w-[7rem]" data-change="assign-crew" data-id="' + person.id + '"' +
          (busy || person.training ? ' disabled' : '') + '>' + unitOptions(person.unitId, person) + '</select>' +
        '<button class="btn btn-ghost" data-act="train" data-id="' + person.id + '"' +
          (person.training || busy || !E.canAfford(state, trainCost.cost) ? ' disabled' : '') + '>Train +' + trainCost.gain + ' · ' + U.moneyShort(trainCost.cost) + '</button>' +
        '<button class="btn btn-danger" data-act="fire" data-id="' + person.id + '"' + (busy ? ' disabled' : '') + '>Dismiss</button>' +
      '</div>' +
    '</div>';
  }

  function trainingQuote(person) {
    var days = 3;
    var gain = Math.round(days * U.lerp(4.2, 1.3, U.clamp(person.skill / 100, 0, 1)));
    return { days: days, gain: gain, cost: Math.round(gain * C.ECONOMY.TRAINING_COST_PER_POINT) };
  }

  function candidateCard(person) {
    var full = state.staff.length >= S.staffCap(state);
    var affordable = E.canAfford(state, person.hireFee);
    return '<div class="card p-2.5">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="min-w-0">' +
          '<p class="truncate text-[12px] font-semibold text-slate-100">' + U.escape(person.name) + '</p>' +
          '<p class="truncate text-[10.5px] text-slate-500">' + U.escape(person.roleLabel) + ' · skill ' +
            Math.round(person.skill) + ' · morale ' + Math.round(person.morale) + '</p>' +
        '</div>' +
        '<div class="shrink-0 text-right">' +
          '<p class="font-mono text-[12px] font-bold text-slate-200">' + U.money(person.wage) + '<span class="text-[9px] text-slate-500">/day</span></p>' +
          '<p class="font-mono text-[9.5px] text-slate-500">fee ' + U.moneyShort(person.hireFee) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="mt-1.5">' + meter(person.skill, 100, '#38bdf8') + '</div>' +
      '<div class="mt-2 flex items-center justify-between">' +
        '<span class="font-mono text-[9.5px] ' + (full ? 'text-amber-400' : 'text-slate-500') + '">' +
          (full ? 'Headcount cap reached' : 'Slots ' + state.staff.length + '/' + S.staffCap(state)) + '</span>' +
        '<button class="btn btn-primary" data-act="hire" data-id="' + person.id + '"' + (full || !affordable ? ' disabled' : '') + '>Hire</button>' +
      '</div>' +
    '</div>';
  }

  /* ── Panel: Equipment ──────────────────────────────────────────────────── */

  PANELS.equipment = function () {
    var coverage = Object.keys(C.CAPABILITIES).map(function (capId) {
      var fielded = J.capFielded(state, capId);
      var available = J.capAvailable(state, capId);
      var demand = state.jobs.filter(function (j) {
        return j.status === 'pending' && j.caps.indexOf(capId) !== -1;
      }).length;
      return '<div class="flex items-center gap-1.5 rounded-md border px-1.5 py-1 ' +
        (fielded ? 'border-cyan-500/25 bg-cyan-500/5' : available ? 'border-slate-700 bg-slate-800/30' : 'border-slate-800 opacity-45') + '">' +
        '<span class="text-[11px] ' + (fielded ? 'text-cyan-300' : 'text-slate-500') + '">' + C.CAPABILITIES[capId].icon + '</span>' +
        '<span class="min-w-0 flex-1 truncate text-[10px] ' + (fielded ? 'text-slate-300' : 'text-slate-500') + '">' + C.CAPABILITIES[capId].label + '</span>' +
        (demand ? '<span class="chip bg-amber-400/15 text-amber-300">' + demand + '</span>' : '') +
        '</div>';
    }).join('');

    var owned = state.tools.map(toolCard).join('');
    var catalog = C.TOOLS.map(toolRow).join('');

    return sectionHead('Capability coverage', 'open calls needing each') +
      '<div class="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3">' + coverage + '</div>' +
      sectionHead('Owned equipment', state.tools.length + ' items') +
      (state.tools.length ? '<div class="space-y-1.5 p-2">' + owned + '</div>' : empty('No equipment owned.')) +
      sectionHead('Equipment catalogue', 'cash ' + U.moneyShort(state.finance.cash)) +
      '<div class="space-y-1.5 p-2">' + catalog + '</div>';
  };

  function toolCard(tool) {
    var spec = S.tool(tool.type);
    var unit = tool.unitId ? S.unitById(state, tool.unitId) : null;
    var busy = unit && ['enroute', 'onsite'].indexOf(unit.status) !== -1;
    var opts = '<option value="">— depot —</option>';
    state.fleet.forEach(function (u) {
      var full = S.toolsOf(state, u).length >= S.vehicle(u.vehicle).slots && u.id !== tool.unitId;
      opts += '<option value="' + u.id + '"' + (u.id === tool.unitId ? ' selected' : '') + (full ? ' disabled' : '') + '>' +
        U.escape(u.callsign) + ' (' + S.toolsOf(state, u).length + '/' + S.vehicle(u.vehicle).slots + ')</option>';
    });

    return '<div class="card flex items-center gap-2 p-2">' +
      '<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-500/10 text-[13px] text-cyan-300">' +
        C.CAPABILITIES[spec.id].icon + '</span>' +
      '<div class="min-w-0 flex-1">' +
        '<p class="truncate text-[11.5px] font-semibold text-slate-200">' + U.escape(spec.name) + '</p>' +
        '<p class="truncate font-mono text-[9.5px] text-slate-500">upkeep ' + U.money(spec.upkeep) + '/day · quality +' + U.pct(spec.quality) + '</p>' +
      '</div>' +
      '<select class="field w-28 shrink-0" data-change="assign-tool" data-id="' + tool.id + '"' + (busy ? ' disabled' : '') + '>' + opts + '</select>' +
      '<button class="btn btn-danger shrink-0" data-act="sell-tool" data-id="' + tool.id + '"' + (busy ? ' disabled' : '') + '>Sell</button>' +
    '</div>';
  }

  function toolRow(spec) {
    var locked = !S.isUnlocked(state, spec.unlock);
    var affordable = E.canAfford(state, spec.price);
    var owned = state.tools.filter(function (t) { return t.type === spec.id; }).length;
    return '<div class="card flex items-center gap-2 p-2' + (locked ? ' opacity-55' : '') + '">' +
      '<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-800 text-[13px] text-slate-400">' +
        C.CAPABILITIES[spec.id].icon + '</span>' +
      '<div class="min-w-0 flex-1">' +
        '<p class="truncate text-[11.5px] font-semibold text-slate-200">' + U.escape(spec.name) +
          (owned ? ' <span class="font-mono text-[9.5px] text-cyan-400">×' + owned + '</span>' : '') + '</p>' +
        '<p class="truncate font-mono text-[9.5px] text-slate-500">' +
          (locked ? milestoneName(spec.unlock) : 'tier ' + spec.tier + ' · upkeep ' + U.money(spec.upkeep) + '/day') + '</p>' +
      '</div>' +
      '<span class="shrink-0 font-mono text-[11.5px] font-bold ' + (affordable && !locked ? 'text-emerald-300' : 'text-slate-500') + '">' + U.money(spec.price) + '</span>' +
      '<button class="btn btn-primary shrink-0" data-act="buy-tool" data-id="' + spec.id + '"' + (locked || !affordable ? ' disabled' : '') + '>Buy</button>' +
    '</div>';
  }

  /* ── Panel: Contracts ──────────────────────────────────────────────────── */

  PANELS.contracts = function () {
    var committed = state.contracts.reduce(function (t, c) { return t + (c.active ? c.volume : 0); }, 0);
    var capacity = J.capacityPerDay(state);
    var retainers = state.contracts.reduce(function (t, c) { return t + (c.active ? c.retainer : 0); }, 0);

    var warn = committed > capacity * 0.8
      ? '<div class="mx-2 mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10.5px] text-amber-300">' +
        'Committed volume is ' + committed.toFixed(1) + ' calls/day against ' + capacity.toFixed(1) +
        ' of capacity. Missed contract calls are charged as SLA breaches.</div>'
      : '';

    var active = state.contracts.map(contractCard).join('');
    var offers = state.offers.contracts.map(offerCard).join('');

    return sectionHead('Active agreements', U.moneyShort(retainers) + '/day retainers') +
      warn +
      (state.contracts.length ? '<div class="space-y-1.5 p-2">' + active + '</div>' : empty('No contracts signed. Work is all ad-hoc.')) +
      sectionHead('Offers on the table', state.offers.contracts.length + ' open') +
      (state.offers.contracts.length ? '<div class="space-y-1.5 p-2">' + offers + '</div>' : empty('No offers right now. Reputation attracts them.'));
  };

  function contractCard(c) {
    var elapsed = state.time.day - c.startedOn;
    return '<div class="card p-2.5">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="min-w-0">' +
          '<p class="truncate text-[12.5px] font-semibold text-slate-100">' + U.escape(c.client) + '</p>' +
          '<p class="truncate text-[10.5px] text-slate-500">' + U.escape(c.label) + ' · ' + U.escape(S.territory(c.territory).name) + '</p>' +
        '</div>' +
        '<div class="shrink-0 text-right">' +
          '<p class="font-mono text-[12.5px] font-bold text-emerald-300">' + U.money(c.retainer) + '<span class="text-[9px] text-slate-500">/day</span></p>' +
          '<p class="font-mono text-[9.5px] text-slate-500">earned ' + U.moneyShort(c.earned) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="mt-1.5 flex flex-wrap gap-1">' +
        sectorChip(c.sector) +
        chip(c.volume.toFixed(1) + ' calls/day', 'bg-slate-800 text-slate-400') +
        chip('value ×' + c.mult.toFixed(2), 'bg-emerald-500/10 text-emerald-300') +
        chip('SLA ×' + c.sla.toFixed(2), 'bg-slate-800 text-slate-400') +
        chip(c.breaches + ' breaches', c.breaches >= 3 ? 'bg-rose-500/15 text-rose-300' : 'bg-slate-800 text-slate-400') +
      '</div>' +
      '<div class="mt-2 flex items-center gap-2">' +
        '<div class="flex-1">' + meter(elapsed, c.term, '#22d3ee') + '</div>' +
        '<span class="font-mono text-[9.5px] text-slate-500">day ' + elapsed + '/' + c.term + '</span>' +
        '<button class="btn btn-danger" data-act="cancel-contract" data-id="' + c.id + '">Terminate</button>' +
      '</div>' +
    '</div>';
  }

  function offerCard(c) {
    var eligible = state.ops.csat >= c.minCsat;
    var daysLeft = c.expiresOn - state.time.day;
    return '<div class="card p-2.5">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="min-w-0">' +
          '<p class="truncate text-[12.5px] font-semibold text-slate-100">' + U.escape(c.client) + '</p>' +
          '<p class="truncate text-[10.5px] text-slate-500">' + U.escape(c.label) + ' · ' + c.term + ' days · ' + U.escape(S.territory(c.territory).name) + '</p>' +
        '</div>' +
        '<div class="shrink-0 text-right">' +
          '<p class="font-mono text-[12.5px] font-bold text-emerald-300">' + U.money(c.retainer) + '<span class="text-[9px] text-slate-500">/day</span></p>' +
          '<p class="font-mono text-[9.5px] text-slate-500">expires in ' + daysLeft + 'd</p>' +
        '</div>' +
      '</div>' +
      '<div class="mt-1.5 flex flex-wrap gap-1">' +
        sectorChip(c.sector) +
        chip(c.volume.toFixed(1) + ' calls/day', 'bg-slate-800 text-slate-400') +
        chip('value ×' + c.mult.toFixed(2), 'bg-emerald-500/10 text-emerald-300') +
        chip('SLA ×' + c.sla.toFixed(2), c.sla < 1 ? 'bg-amber-400/15 text-amber-300' : 'bg-slate-800 text-slate-400') +
        chip('breach ' + U.moneyShort(c.penalty), 'bg-rose-500/10 text-rose-300') +
        (c.minCsat ? chip('needs CSAT ' + c.minCsat, eligible ? 'bg-slate-800 text-slate-400' : 'bg-rose-500/15 text-rose-300') : '') +
      '</div>' +
      '<p class="mt-1.5 font-mono text-[9.5px] text-slate-500">Term value ≈ ' + U.moneyShort(c.retainer * c.term) + ' in retainers alone</p>' +
      '<div class="mt-2 flex justify-end gap-1">' +
        '<button class="btn btn-ghost" data-act="decline-contract" data-id="' + c.id + '">Decline</button>' +
        '<button class="btn btn-primary" data-act="sign-contract" data-id="' + c.id + '"' + (eligible ? '' : ' disabled') + '>Sign</button>' +
      '</div>' +
    '</div>';
  }

  /* ── Panel: Finance ────────────────────────────────────────────────────── */

  PANELS.finance = function () {
    var f = state.finance;
    var w30 = E.window(state, 30);
    var credit = S.creditLimit(state);
    var room = Math.max(0, credit - f.debt);

    return sectionHead('Cash position', 'last 30 days') +
      '<div class="p-2">' +
        '<div class="grid grid-cols-2 gap-2">' +
          statTile('Cash on hand', U.money(f.cash), f.cash < 0 ? 'text-rose-400' : 'text-emerald-300') +
          statTile('Net worth', U.money(S.netWorth(state)), 'text-slate-100') +
          statTile('Tax accrued', U.money(f.taxAccrued), 'text-amber-300') +
          statTile('Debt drawn', U.money(f.debt), f.debt > 0 ? 'text-rose-300' : 'text-slate-400') +
        '</div>' +

        '<div class="mt-2 rounded-lg border border-slate-800 bg-ink-850/60 p-2">' +
          '<div class="flex items-center justify-between"><span class="panel-title">Cash &amp; net worth</span>' +
          '<span class="flex gap-2 font-mono text-[9.5px]"><span class="text-sky-300">■ cash</span>' +
          '<span class="text-violet-300">■ net worth</span></span></div>' +
          '<canvas id="chart-cash" class="mt-1.5 h-32 w-full"></canvas>' +
        '</div>' +

        '<div class="mt-2 rounded-lg border border-slate-800 bg-ink-850/60 p-2">' +
          '<div class="flex items-center justify-between"><span class="panel-title">Revenue vs expenses</span>' +
          '<span class="flex gap-2 font-mono text-[9.5px]"><span class="text-cyan-300">■ revenue</span><span class="text-rose-300">■ expense</span></span></div>' +
          '<canvas id="chart-flow" class="mt-1.5 h-28 w-full"></canvas>' +
        '</div>' +

        '<div class="mt-2 grid grid-cols-2 gap-2">' +
          '<div class="rounded-lg border border-slate-800 bg-ink-850/60 p-2">' +
            '<span class="panel-title">Cost mix (30d)</span>' +
            '<canvas id="chart-mix" class="mt-1 h-28 w-full"></canvas>' +
          '</div>' +
          '<div class="rounded-lg border border-slate-800 bg-ink-850/60 p-2">' +
            '<span class="panel-title">Breakdown</span>' +
            '<div id="mix-legend" class="mt-1 space-y-0.5"></div>' +
          '</div>' +
        '</div>' +

        '<div class="mt-2 rounded-lg border border-slate-800 bg-ink-850/60 p-2.5">' +
          '<div class="flex items-center justify-between"><span class="panel-title">Credit line</span>' +
          '<span class="font-mono text-[9.5px] text-slate-500">' + U.money(room) + ' available of ' + U.money(credit) + '</span></div>' +
          '<div class="mt-1.5">' + meter(f.debt, credit, f.debt / credit > 0.7 ? '#fb7185' : '#fbbf24') + '</div>' +
          '<div class="mt-2 flex items-center gap-1.5">' +
            '<input class="field w-28" type="number" id="credit-amount" min="1000" step="1000" value="25000">' +
            '<button class="btn btn-ghost" data-act="borrow">Draw</button>' +
            '<button class="btn btn-ghost" data-act="repay"' + (f.debt <= 0 ? ' disabled' : '') + '>Repay</button>' +
            '<span class="ml-auto font-mono text-[9.5px] text-slate-500">' + U.pct(C.ECONOMY.INTEREST_DAILY * 365, 1) + ' APR</span>' +
          '</div>' +
        '</div>' +

        '<div class="mt-2 rounded-lg border border-slate-800 bg-ink-850/60 px-2.5 py-1.5">' +
          statRow('Lifetime revenue', U.money(state.stats.revenue)) +
          statRow('Lifetime expenses', U.money(state.stats.expense)) +
          statRow('Tax remitted', U.money(state.stats.taxPaid)) +
          statRow('Daily payroll', U.money(S.dailyPayroll(state))) +
          statRow('Fleet asset value', U.money(S.assetValue(state))) +
          statRow('Fuel price', '$' + E.fuelPrice(state).toFixed(2) + '/L') +
          statRow('Jobs closed / failed / lost', state.stats.jobsDone + ' / ' + state.stats.jobsFailed + ' / ' + state.stats.jobsExpired) +
          statRow('Distance driven', Math.round(state.stats.distance).toLocaleString('en-US') + ' km') +
        '</div>' +
      '</div>';
  };

  function statTile(label, value, tone) {
    return '<div class="rounded-lg border border-slate-800 bg-ink-850/60 px-2.5 py-2">' +
      '<p class="font-mono text-[9px] uppercase tracking-wider text-slate-500">' + label + '</p>' +
      '<p class="mt-0.5 font-mono text-[15px] font-bold ' + tone + '">' + value + '</p></div>';
  }

  function statRow(label, value) {
    return '<div class="stat-row"><span class="text-[11px] text-slate-500">' + label + '</span>' +
      '<span class="font-mono text-[11px] font-semibold text-slate-200">' + value + '</span></div>';
  }

  var COST_COLORS = {
    payroll: '#38bdf8', fuel: '#fbbf24', maintenance: '#a78bfa', overhead: '#64748b',
    insurance: '#2dd4bf', penalties: '#fb7185', interest: '#f472b6', capex: '#4ade80',
    training: '#c084fc', tax: '#f59e0b'
  };

  function drawFinanceCharts() {
    var history = state.finance.history.slice(-45);
    var cashCanvas = document.getElementById('chart-cash');
    if (cashCanvas) {
      Charts.line(cashCanvas, [
        { key: 'networth', color: '#a78bfa', values: history.map(function (d) { return d.netWorth || d.cash; }) },
        { key: 'cash', color: Charts.PALETTE.cash, area: true, values: history.map(function (d) { return d.cash; }) }
      ], {
        zeroBase: false,
        labels: history.length ? ['D' + (history[0].day + 1), 'D' + (history[history.length - 1].day + 1)] : [],
        empty: 'Close a day of trading to chart cash'
      });
    }

    var flowCanvas = document.getElementById('chart-flow');
    if (flowCanvas) {
      Charts.bars(flowCanvas, history.slice(-30).map(function (d) {
        return { label: 'D' + (d.day + 1), bars: [
          { color: Charts.PALETTE.revenue, value: d.revenue },
          { color: Charts.PALETTE.expense, value: d.expense }
        ] };
      }), { empty: 'No trading days yet' });
    }

    var totals = {};
    history.forEach(function (d) {
      Object.keys(d.breakdown.expense).forEach(function (k) {
        totals[k] = (totals[k] || 0) + d.breakdown.expense[k];
      });
    });
    var slices = Object.keys(totals)
      .filter(function (k) { return totals[k] > 0; })
      .sort(function (a, b) { return totals[b] - totals[a]; })
      .map(function (k) { return { label: U.titleCase(k), value: totals[k], color: COST_COLORS[k] || '#94a3b8' }; });

    var mixCanvas = document.getElementById('chart-mix');
    if (mixCanvas) {
      var total = slices.reduce(function (t, s) { return t + s.value; }, 0);
      Charts.donut(mixCanvas, slices, { centerLabel: U.moneyShort(total), centerSub: '30d spend' });
    }

    var legend = document.getElementById('mix-legend');
    if (legend) {
      var grand = slices.reduce(function (t, s) { return t + s.value; }, 0) || 1;
      legend.innerHTML = slices.length ? slices.slice(0, 8).map(function (s) {
        return '<div class="flex items-center gap-1.5 text-[10px]">' +
          '<i class="dot" style="background:' + s.color + '"></i>' +
          '<span class="min-w-0 flex-1 truncate text-slate-400">' + s.label + '</span>' +
          '<span class="font-mono text-slate-300">' + U.moneyShort(s.value) + '</span>' +
          '<span class="w-9 text-right font-mono text-slate-600">' + U.pct(s.value / grand) + '</span></div>';
      }).join('') : '<p class="text-[10px] text-slate-600">No spend recorded yet.</p>';
    }
  }

  /* ── Panel: Growth ─────────────────────────────────────────────────────── */

  PANELS.growth = function () {
    var milestones = C.MILESTONES.map(function (m) {
      var done = state.milestones.indexOf(m.id) !== -1;
      var g = m.goal(state);
      var frac = U.clamp(g.have / g.need, 0, 1);
      return '<div class="card p-2.5' + (done ? ' border-emerald-500/30 bg-emerald-500/5' : '') + '">' +
        '<div class="flex items-start justify-between gap-2">' +
          '<div class="min-w-0">' +
            '<p class="truncate text-[12px] font-semibold ' + (done ? 'text-emerald-300' : 'text-slate-100') + '">' +
              (done ? '✓ ' : '') + U.escape(m.name) + '</p>' +
            '<p class="text-[10.5px] leading-snug text-slate-500">' + U.escape(m.desc) + '</p>' +
          '</div>' +
          '<span class="chip ' + (done ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400') + '">' +
            (done ? 'unlocked' : U.pct(frac)) + '</span>' +
        '</div>' +
        (done ? '' : '<div class="mt-2">' + meter(frac, 1, '#22d3ee') + '</div>') +
        '<p class="mt-1.5 font-mono text-[9.5px] ' + (done ? 'text-emerald-400/70' : 'text-cyan-400/70') + '">' + U.escape(m.reward) + '</p>' +
      '</div>';
    }).join('');

    var territories = C.TERRITORIES.map(function (t) {
      var owned = state.territories.indexOf(t.id) !== -1;
      var unlocked = S.isUnlocked(state, t.unlock);
      var affordable = E.canAfford(state, t.price);
      return '<div class="card p-2.5' + (owned ? ' border-cyan-500/30 bg-cyan-500/5' : unlocked ? '' : ' opacity-55') + '">' +
        '<div class="flex items-start justify-between gap-2">' +
          '<div class="min-w-0">' +
            '<p class="truncate text-[12px] font-semibold ' + (owned ? 'text-cyan-300' : 'text-slate-100') + '">' + U.escape(t.name) + '</p>' +
            '<p class="text-[10.5px] leading-snug text-slate-500">' + U.escape(t.blurb) + '</p>' +
          '</div>' +
          (owned ? '<span class="chip bg-cyan-500/15 text-cyan-300">licensed</span>'
                 : '<p class="shrink-0 font-mono text-[12px] font-bold ' + (affordable && unlocked ? 'text-emerald-300' : 'text-slate-500') + '">' + U.money(t.price) + '</p>') +
        '</div>' +
        '<div class="mt-1.5 flex flex-wrap gap-1">' +
          chip('demand ×' + t.demand.toFixed(2), 'bg-slate-800 text-slate-400') +
          Object.keys(t.mix).filter(function (k) { return t.mix[k] > 0; })
            .sort(function (a, b) { return t.mix[b] - t.mix[a]; }).slice(0, 3)
            .map(function (k) { return sectorChip(k); }).join('') +
        '</div>' +
        (owned ? '' : '<div class="mt-2 flex items-center justify-between">' +
          '<span class="font-mono text-[9.5px] text-slate-500">' + (unlocked ? 'Available now' : milestoneName(t.unlock)) + '</span>' +
          '<button class="btn btn-primary" data-act="buy-territory" data-id="' + t.id + '"' + (!unlocked || !affordable ? ' disabled' : '') + '>Licence</button>' +
        '</div>') +
      '</div>';
    }).join('');

    var sectors = Object.keys(C.SECTORS).map(function (k) {
      var sec = C.SECTORS[k];
      var open = S.isUnlocked(state, sec.unlock);
      return '<div class="flex items-center gap-2 rounded-md border px-2 py-1.5 ' +
        (open ? 'border-slate-700 bg-slate-800/30' : 'border-slate-800 opacity-50') + '">' +
        '<i class="dot" style="background:' + sec.color + '"></i>' +
        '<span class="flex-1 truncate text-[11px] ' + (open ? 'text-slate-200' : 'text-slate-500') + '">' + sec.label + '</span>' +
        '<span class="font-mono text-[9px] uppercase ' + (open ? 'text-emerald-400' : 'text-slate-600') + '">' +
          (open ? 'active' : 'locked') + '</span></div>';
    }).join('');

    return sectionHead('Sectors', S.activeSectors(state).length + '/' + Object.keys(C.SECTORS).length) +
      '<div class="grid grid-cols-2 gap-1.5 p-2">' + sectors + '</div>' +
      sectionHead('Territories', state.territories.length + ' licensed') +
      '<div class="space-y-1.5 p-2">' + territories + '</div>' +
      sectionHead('Milestones', state.milestones.length + '/' + C.MILESTONES.length) +
      '<div class="space-y-1.5 p-2">' + milestones + '</div>';
  };

  /* ── Actions ───────────────────────────────────────────────────────────── */

  function toast(kind, title, msg) { Notify.toast({ kind: kind, title: title, msg: msg }); }

  function result(res, okMsg) {
    if (res && res.ok) { toast('ok', 'Done', okMsg); return true; }
    toast('warn', 'Not possible', (res && res.reason) || 'Action unavailable');
    return false;
  }

  function onAction(e) {
    var btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    var act = btn.dataset.act;
    var id = btn.dataset.id;
    var unitId = btn.dataset.unit;

    switch (act) {
      case 'toggle-auto':
        state.ops.autoDispatch = !state.ops.autoDispatch;
        toast('info', 'Auto-dispatch', state.ops.autoDispatch
          ? 'The dispatcher will assign calls automatically.'
          : 'Manual dispatch restored.');
        break;

      case 'dispatch-open':
        dispatchOpenFor = dispatchOpenFor === id ? null : id;
        selection.jobId = dispatchOpenFor;
        Map.select(selection);
        break;

      case 'dispatch-unit': {
        var res = J.dispatch(state, id, unitId);
        if (res.ok) {
          var unit = S.unitById(state, unitId);
          var job = S.jobById(state, id);
          toast('ok', 'Unit dispatched', unit.callsign + ' → ' + job.label + ' · ETA ' + U.duration(res.eval.eta));
          Notify.log({ kind: 'info', msg: 'DISPATCH · ' + unit.callsign + ' → ' + job.label + ' (' + job.client + ')' });
          dispatchOpenFor = null;
          selection.jobId = null;
          Map.select(selection);
        } else {
          toast('warn', 'Dispatch refused', res.reason);
        }
        break;
      }

      case 'focus-job': {
        var fjob = S.jobById(state, id);
        if (fjob) { Map.focus(fjob.x, fjob.y, 1.4); selection = { jobId: id, unitId: null }; Map.select(selection); }
        break;
      }

      case 'focus-unit': {
        var funit = S.unitById(state, unitId);
        if (funit) { Map.focus(funit.x, funit.y, 1.4); selection = { jobId: null, unitId: unitId }; Map.select(selection); }
        break;
      }

      case 'recall':
        if (J.recall(state, unitId).ok) {
          var ru = S.unitById(state, unitId);
          toast('warn', 'Unit recalled', ru.callsign + ' is returning to the depot.');
        }
        break;

      case 'refuel': {
        var rf = E.refuel(state, unitId);
        result(rf, rf.ok ? 'Refuelled ' + rf.litres.toFixed(0) + 'L for ' + money(rf.cost) : '');
        break;
      }

      case 'service': {
        var sv = E.serviceUnit(state, unitId);
        result(sv, sv.ok ? 'Workshop booked for ' + money(sv.cost) + '. Back tomorrow.' : '');
        break;
      }

      case 'sell-unit': {
        var su = S.unitById(state, unitId);
        if (!su) break;
        confirmModal('Sell ' + su.callsign + '?',
          'You will recover roughly ' + money(S.vehicle(su.vehicle).price * 0.48 * (su.condition / 100)) +
          '. Crew and equipment return to the depot.', function () {
            var r = E.sellVehicle(state, unitId);
            result(r, r.ok ? su.callsign + ' sold for ' + money(r.value) : '');
            UI.render(true);
          });
        return;
      }

      case 'buy-vehicle': {
        var bv = E.buyVehicle(state, id);
        result(bv, bv.ok ? bv.unit.callsign + ' joins the fleet. Assign crew to put it to work.' : '');
        break;
      }

      case 'buy-tool': {
        var bt = E.buyTool(state, id);
        if (bt.ok) {
          // Drop it straight into the first vehicle with a free bay.
          var host = state.fleet.filter(function (u) {
            return S.toolsOf(state, u).length < S.vehicle(u.vehicle).slots;
          })[0];
          if (host) S.assignTool(state, bt.tool.id, host.id);
          toast('ok', 'Equipment purchased', S.tool(id).name + (host ? ' loaded onto ' + host.callsign : ' held at the depot'));
        } else {
          toast('warn', 'Not possible', bt.reason);
        }
        break;
      }

      case 'sell-tool': {
        var st = E.sellTool(state, id);
        result(st, st.ok ? 'Equipment sold for ' + money(st.value) : '');
        break;
      }

      case 'hire': {
        var h = E.hire(state, id);
        result(h, h.ok ? h.person.name + ' hired. Assign them to a unit.' : '');
        break;
      }

      case 'fire': {
        var person = S.personById(state, id);
        if (!person) break;
        confirmModal('Dismiss ' + person.name + '?',
          'Severance of ' + money(person.wage * 6) + ' is payable and the remaining crew will take it badly.',
          function () {
            var r = E.fire(state, id);
            result(r, r.ok ? person.name + ' left the company. Severance ' + money(r.severance) : '');
            UI.render(true);
          });
        return;
      }

      case 'train': {
        var tr = E.train(state, id, 3);
        result(tr, tr.ok ? 'Training booked: +' + tr.gain + ' skill over ' + tr.days + ' days for ' + money(tr.cost) : '');
        break;
      }

      case 'sign-contract': {
        var sc = J.signContract(state, id);
        result(sc, sc.ok ? sc.contract.client + ' signed for ' + sc.contract.term + ' days.' : '');
        break;
      }

      case 'decline-contract':
        state.offers.contracts = state.offers.contracts.filter(function (c) { return c.id !== id; });
        break;

      case 'cancel-contract': {
        var cc = J.contractById(state, id);
        if (!cc) break;
        confirmModal('Terminate the ' + cc.client + ' agreement?',
          'Early termination costs ' + money(cc.penalty * 2.2) + ' and 4 points of reputation.', function () {
            var r = J.cancelContract(state, id);
            result(r, r.ok ? 'Agreement terminated. Fee ' + money(r.fee) : '');
            UI.render(true);
          });
        return;
      }

      case 'buy-territory': {
        var bter = E.buyTerritory(state, id);
        if (bter.ok) {
          toast('ok', 'Territory licensed', bter.territory.name + ' is now open for business.');
          Notify.log({ kind: 'ok', msg: 'EXPANSION · ' + bter.territory.name + ' licensed for ' + money(bter.territory.price) });
          Map.focus(bter.territory.x, bter.territory.y, 0.9);
        } else {
          toast('warn', 'Not possible', bter.reason);
        }
        break;
      }

      case 'borrow': {
        var amt = readAmount('credit-amount');
        var drawn = E.borrow(state, amt);
        if (drawn > 0) toast('info', 'Credit drawn', money(drawn) + ' added to cash.');
        else toast('warn', 'Refused', 'No headroom on the credit line.');
        break;
      }

      case 'repay': {
        var ramt = readAmount('credit-amount');
        var paid = E.repay(state, ramt);
        if (paid > 0) toast('ok', 'Repaid', money(paid) + ' returned to the lender.');
        else toast('warn', 'Refused', 'Nothing to repay, or not enough cash.');
        break;
      }

      case 'event-option':
        UI.closeModal();
        UI.emit('event-choice', parseInt(btn.dataset.index, 10));
        return;

      case 'modal-close':
        UI.closeModal();
        return;

      case 'modal-confirm':
        UI.closeModal();
        if (pendingConfirm) { var fn = pendingConfirm; pendingConfirm = null; fn(); }
        return;

      case 'menu-save': UI.closeModal(); UI.emit('save'); return;
      case 'menu-load': UI.closeModal(); UI.emit('load'); return;
      case 'menu-export': UI.closeModal(); UI.emit('export'); return;
      case 'menu-import': UI.closeModal(); UI.emit('import'); return;
      case 'menu-reset':
        UI.closeModal();
        confirmModal('Start over?', 'This permanently deletes your saved operation.', function () { UI.emit('reset'); });
        return;
      case 'menu-autosave':
        state.settings.autosave = !state.settings.autosave;
        UI.showMenu();
        return;
      case 'menu-notifications':
        state.settings.notifications = !state.settings.notifications;
        UI.showMenu();
        return;
    }

    UI.render(true);
  }

  function readAmount(id) {
    var el = document.getElementById(id);
    var v = el ? parseFloat(el.value) : 0;
    return isFinite(v) && v > 0 ? v : 0;
  }

  function onChange(e) {
    var el = e.target.closest('[data-change]');
    if (!el) return;
    var kind = el.dataset.change;
    if (kind === 'assign-crew') {
      if (!S.assignCrew(state, el.dataset.id, el.value || null)) {
        toast('warn', 'Assignment refused', 'That unit has no free seat.');
      }
    } else if (kind === 'assign-tool') {
      if (!S.assignTool(state, el.dataset.id, el.value || null)) {
        toast('warn', 'Assignment refused', 'That unit has no free equipment bay.');
      }
    }
    UI.render(true);
  }

  /* ── Modals ────────────────────────────────────────────────────────────── */

  var pendingConfirm = null;

  UI.modal = function (html, opts) {
    opts = opts || {};
    var root = els['modal-root'];
    root.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    root.innerHTML = '<div class="modal-backdrop" ' + (opts.dismissible === false ? '' : 'data-act="modal-close"') + '></div>' +
      '<div class="modal-card pointer-events-auto relative w-full max-w-md rounded-xl border border-slate-700 bg-ink-900 shadow-2xl shadow-black/70">' + html + '</div>';
    root.classList.remove('hidden');
  };

  UI.closeModal = function () {
    var root = els['modal-root'];
    root.classList.add('hidden');
    root.className = 'pointer-events-none fixed inset-0 z-50 hidden';
    root.innerHTML = '';
  };

  function confirmModal(title, body, onConfirm) {
    pendingConfirm = onConfirm;
    UI.modal(
      '<div class="p-5">' +
        '<h3 class="text-[15px] font-semibold text-slate-100">' + U.escape(title) + '</h3>' +
        '<p class="mt-2 text-[12px] leading-relaxed text-slate-400">' + U.escape(body) + '</p>' +
        '<div class="mt-5 flex justify-end gap-2">' +
          '<button class="btn btn-ghost" data-act="modal-close">Cancel</button>' +
          '<button class="btn btn-danger" data-act="modal-confirm">Confirm</button>' +
        '</div>' +
      '</div>');
  }

  /** Decision dialog for a random world event. */
  UI.showEvent = function (evt) {
    var options = evt.options.map(function (opt, i) {
      var unaffordable = opt.cost && !E.canAfford(state, opt.cost);
      return '<button class="w-full rounded-lg border border-slate-700 bg-ink-850 p-3 text-left transition hover:border-cyan-500/60 hover:bg-ink-800 disabled:opacity-40" ' +
        'data-act="event-option" data-index="' + i + '"' + (unaffordable ? ' disabled' : '') + '>' +
        '<div class="flex items-center justify-between gap-2">' +
          '<span class="text-[12.5px] font-semibold text-slate-100">' + U.escape(opt.label) + '</span>' +
          (opt.cost ? '<span class="font-mono text-[11px] font-bold ' + (unaffordable ? 'text-rose-400' : 'text-amber-300') + '">' + money(opt.cost) + '</span>' : '') +
        '</div>' +
        '<p class="mt-1 text-[11px] leading-snug text-slate-400">' + U.escape(opt.detail) + '</p>' +
      '</button>';
    }).join('');

    UI.modal(
      '<div class="p-5">' +
        '<div class="flex items-center gap-2">' +
          '<span class="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 text-[13px] text-amber-300">!</span>' +
          '<h3 class="text-[15px] font-semibold text-slate-100">' + U.escape(evt.title) + '</h3>' +
        '</div>' +
        '<p class="mt-3 text-[12px] leading-relaxed text-slate-400">' + U.escape(evt.body) + '</p>' +
        '<div class="mt-4 space-y-2">' + options + '</div>' +
        '<p class="mt-3 text-center font-mono text-[9.5px] uppercase tracking-wider text-slate-600">Operations are paused until you decide</p>' +
      '</div>', { dismissible: false });
  };

  UI.showMenu = function () {
    UI.modal(
      '<div class="p-5">' +
        '<h3 class="text-[15px] font-semibold text-slate-100">Operations menu</h3>' +
        '<div class="mt-4 space-y-1.5">' +
          menuRow('menu-save', 'Save game', 'Write the current state to this browser') +
          menuRow('menu-load', 'Load last save', 'Discard unsaved progress') +
          menuRow('menu-export', 'Export save file', 'Download a JSON backup') +
          menuRow('menu-import', 'Import save file', 'Restore from a JSON backup') +
        '</div>' +
        '<div class="mt-4 space-y-1.5 border-t border-slate-800 pt-4">' +
          toggleRow('menu-autosave', 'Autosave daily', state.settings.autosave) +
          toggleRow('menu-notifications', 'Pop-up notifications', state.settings.notifications) +
        '</div>' +
        '<div class="mt-4 flex justify-between border-t border-slate-800 pt-4">' +
          '<button class="btn btn-danger" data-act="menu-reset">Start over</button>' +
          '<button class="btn btn-primary" data-act="modal-close">Back to operations</button>' +
        '</div>' +
      '</div>');
  };

  function menuRow(act, label, detail) {
    return '<button class="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-ink-850 px-3 py-2 text-left transition hover:border-slate-600" data-act="' + act + '">' +
      '<span><span class="block text-[12px] font-semibold text-slate-200">' + label + '</span>' +
      '<span class="block text-[10.5px] text-slate-500">' + detail + '</span></span>' +
      '<span class="text-slate-600">›</span></button>';
  }

  function toggleRow(act, label, on) {
    return '<button class="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left" data-act="' + act + '">' +
      '<span class="text-[12px] text-slate-300">' + label + '</span>' +
      '<span class="chip ' + (on ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-500') + '">' +
      (on ? 'on' : 'off') + '</span></button>';
  }

  /** End-of-run summary when the operation runs out of money. */
  UI.showInsolvency = function () {
    UI.modal(
      '<div class="p-5">' +
        '<h3 class="text-[15px] font-semibold text-rose-300">Operations suspended</h3>' +
        '<p class="mt-2 text-[12px] leading-relaxed text-slate-400">' +
          'Cash and credit are exhausted. Sell vehicles or equipment, cut headcount, or terminate loss-making ' +
          'contracts to trade your way out — the clock stays paused until you act.</p>' +
        '<div class="mt-4 grid grid-cols-2 gap-2">' +
          statTile('Cash', money(state.finance.cash), 'text-rose-400') +
          statTile('Debt', money(state.finance.debt), 'text-rose-300') +
          statTile('Asset value', U.moneyShort(S.assetValue(state)), 'text-slate-200') +
          statTile('Daily payroll', U.moneyShort(S.dailyPayroll(state)), 'text-slate-200') +
        '</div>' +
        '<div class="mt-5 flex justify-end gap-2">' +
          '<button class="btn btn-danger" data-act="menu-reset">Start over</button>' +
          '<button class="btn btn-primary" data-act="modal-close">Restructure</button>' +
        '</div>' +
      '</div>', { dismissible: false });
  };

  FST.UI = UI;
})(window.FST = window.FST || {});
