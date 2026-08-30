/**
 * MERIDIAN FIELD OPS — Presentation layer.
 * Renders the executive dashboard, management panels and modals, and turns
 * user intent into calls on the simulation modules.
 */
(function (FST) {
  'use strict';

  var C = FST.Config, U = FST.Utils, S = FST.State, E = FST.Economy,
      J = FST.Jobs, Units = FST.Units, Charts = FST.Charts, Notify = FST.Notify, Map = FST.Map;
  var I18n = FST.I18n, T = FST.I18n.t;

  var UI = U.emitter();
  var state = null;
  var els = {};
  var activeTab = 'dispatch';
  var dispatchOpenFor = null;
  var selection = { jobId: null, unitId: null };
  var lastCash = null;

  var TABS = [
    { id: 'dispatch', badge: function (s) {
        return s.jobs.filter(function (j) { return j.status === 'pending'; }).length; } },
    { id: 'fleet', badge: function (s) { return s.fleet.length; } },
    { id: 'crew', badge: function (s) { return s.staff.length; } },
    { id: 'equipment', badge: function (s) { return s.tools.length; } },
    { id: 'contracts', badge: function (s) { return s.offers.contracts.length || null; } },
    { id: 'finance' },
    { id: 'growth', badge: function (s) {
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
    return '<span class="chip" style="background:' + Charts.alpha(sec.color, 0.16) + ';color:' + sec.color + '">' +
      U.escape(I18n.f(sec, 'label')) + '</span>';
  }

  function priorityChip(priority) {
    var p = C.PRIORITIES[priority];
    var cls = priority === 'emergency' ? 'bg-rose-500/15 text-rose-300'
      : priority === 'urgent' ? 'bg-amber-400/15 text-amber-300' : 'bg-slate-700/60 text-slate-400';
    return '<span class="chip ' + cls + (priority === 'emergency' ? ' pulse-emergency' : '') + '">' +
      U.escape(J.priorityLabel(priority)) + '</span>';
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

  /** Rebuild every rendered string after a language change. */
  UI.retranslate = function () {
    if (!state) return;
    renderTabs();
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
    els['hud-date'].textContent = cal.label + (Units.onShift(state) ? '' : ' · ' + T('hud.offshift'));

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
        label: T('kpi.net7'), value: U.moneyShort(last7.profit),
        tone: last7.profit >= 0 ? 'text-emerald-300' : 'text-rose-400',
        sub: T('kpi.net7.sub', { rev: U.moneyShort(last7.revenue), exp: U.moneyShort(last7.expense) }),
        spark: history.slice(-14).map(function (d) { return d.profit; }),
        sparkColor: last7.profit >= 0 ? '#4ade80' : '#fb7185'
      },
      {
        label: T('kpi.calls'), value: String(pending.length),
        tone: pending.length > state.fleet.length * 2 ? 'text-amber-300' : 'text-slate-100',
        sub: T('kpi.calls.sub', { active: active.length, free: available, total: state.fleet.length }),
        bar: { value: available, max: Math.max(1, state.fleet.length), color: '#38bdf8' }
      },
      {
        label: T('kpi.load'), value: (demand / Math.max(0.1, capacity) * 100).toFixed(0) + '%',
        tone: demand > capacity * 1.15 ? 'text-rose-400' : demand > capacity * 0.85 ? 'text-amber-300' : 'text-emerald-300',
        sub: T('kpi.load.sub', { demand: demand.toFixed(1), capacity: capacity.toFixed(1) }),
        bar: { value: demand, max: Math.max(demand, capacity), color: demand > capacity ? '#fb7185' : '#34d399' }
      },
      {
        label: T('kpi.rep'), value: state.ops.csat.toFixed(0),
        tone: state.ops.csat >= 75 ? 'text-emerald-300' : state.ops.csat >= 50 ? 'text-sky-300' : 'text-rose-400',
        sub: T('kpi.rep.sub', { done: state.stats.jobsDone, lost: state.stats.jobsExpired, streak: state.ops.streak }),
        bar: { value: state.ops.csat, max: 100, color: healthColor(state.ops.csat / 100) }
      }
    ];

    els['kpi-row'].innerHTML = tiles.map(function (t, i) {
      return '<div class="panel px-3 py-2">' +
        '<p class="font-mono text-[9px] uppercase tracking-wider text-slate-500">' + U.escape(t.label) + '</p>' +
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
    els['map-summary'].textContent = T('map.summary', {
      terr: state.territories.length, open: pending, moving: moving, onsite: onsite
    });
  }

  function renderTabs() {
    els.tabs.innerHTML = TABS.map(function (t) {
      return '<button class="tab" role="tab" data-tab="' + t.id + '" aria-selected="' + (t.id === activeTab) + '">' +
        U.escape(T('tab.' + t.id)) + '<span class="tab-badge" data-badge="' + t.id + '"></span></button>';
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
      '<div><h3 class="panel-title">' + U.escape(T('disp.board')) + '</h3>' +
      '<p class="mt-0.5 font-mono text-[10px] text-slate-500">' +
        U.escape(T('disp.boardSub', { pending: pending.length, live: live.length })) + '</p></div>' +
      '<button class="btn ' + (state.ops.autoDispatch ? 'btn-ok' : 'btn-ghost') + '" data-act="toggle-auto">' +
      U.escape(T(state.ops.autoDispatch ? 'disp.autoOn' : 'disp.autoOff')) + '</button></div>';

    var liveHtml = live.length ? sectionHead(T('disp.inProgress'), U.escape(T('disp.activeCount', { n: live.length }))) +
      '<div class="space-y-1.5 p-2">' + live.map(liveCard).join('') + '</div>' : '';

    var pendingHtml = pending.length
      ? '<div class="space-y-1.5 p-2">' + pending.map(pendingCard).join('') + '</div>'
      : empty(T('disp.empty'));

    return head + sectionHead(T('disp.awaiting')) + pendingHtml + liveHtml;
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
          '<p class="truncate text-[12.5px] font-semibold text-slate-100">' + U.escape(J.jobLabel(job)) + '</p>' +
          '<p class="truncate text-[11px] text-slate-500">' + U.escape(job.client) +
            (job.contractId ? ' · <span class="text-cyan-400">' + U.escape(T('disp.contract')) + '</span>' : '') + '</p>' +
        '</div>' +
        '<div class="shrink-0 text-end">' +
          '<p class="font-mono text-[13px] font-bold text-emerald-300">' + U.money(job.value) + '</p>' +
          '<p class="font-mono text-[9.5px] ' + (frac > 0.4 ? 'text-slate-500' : 'text-rose-400') + '">' +
            U.escape(T('disp.sla', { time: U.duration(left) })) + '</p>' +
        '</div>' +
      '</div>' +

      '<div class="mt-1.5 flex flex-wrap items-center gap-1">' +
        priorityChip(job.priority) + sectorChip(job.sector) +
        job.caps.map(function (c) {
          var have = J.capFielded(state, c);
          return chip((C.CAPABILITIES[c] || {}).icon + ' ' + J.capLabel(c),
            have ? 'bg-slate-800 text-slate-400' : 'bg-rose-500/15 text-rose-300');
        }).join('') +
        chip(T('disp.skill', { n: job.skill }), 'bg-slate-800 text-slate-400') +
        chip(U.duration(job.duration), 'bg-slate-800 text-slate-400') +
      '</div>' +

      '<div class="mt-2">' + meter(frac, 1, frac > 0.5 ? '#34d399' : frac > 0.25 ? '#fbbf24' : '#fb7185') + '</div>' +

      '<div class="mt-2 flex items-center justify-between gap-2">' +
        '<p class="truncate font-mono text-[10px] text-slate-500">' +
          (best ? U.escape(T('disp.best', { unit: best.unit.callsign, eta: U.duration(best.eta) })) +
            (best.onTime ? '' : ' <span class="text-rose-400">' + U.escape(T('disp.late')) + '</span>')
            : '<span class="text-rose-400">' + U.escape(T('disp.noUnit')) + '</span>') + '</p>' +
        '<div class="flex gap-1">' +
          '<button class="btn btn-ghost" data-act="focus-job" data-id="' + job.id + '">' + U.escape(T('disp.locate')) + '</button>' +
          '<button class="btn btn-primary" data-act="dispatch-open" data-id="' + job.id + '">' +
            U.escape(T(open ? 'disp.close' : 'disp.dispatch')) + '</button>' +
        '</div>' +
      '</div>' +

      (open ? dispatchList(job, evals) : '') +
    '</div>';
  }

  function dispatchList(job, evals) {
    if (!evals.length) return '<p class="mt-2 text-[11px] text-slate-500">' + U.escape(T('disp.noFleet')) + '</p>';
    return '<div class="mt-2 space-y-1 border-t border-slate-800 pt-2">' +
      '<p class="font-mono text-[9px] uppercase tracking-wider text-slate-500">' + U.escape(T('disp.recommended')) + '</p>' +
      evals.map(function (ev, i) {
        var u = ev.unit;
        return '<div class="flex items-center gap-2 rounded-md px-1.5 py-1 ' +
            (ev.eligible ? 'bg-slate-800/40' : 'opacity-55') + '">' +
          '<span class="w-4 shrink-0 text-center font-mono text-[10px] ' + (i === 0 && ev.eligible ? 'text-emerald-400' : 'text-slate-600') + '">' + (i + 1) + '</span>' +
          '<div class="min-w-0 flex-1">' +
            '<p class="truncate text-[11.5px] font-semibold text-slate-200">' + U.escape(u.callsign) +
              ' <span class="font-normal text-slate-500">' + U.escape(I18n.f(S.vehicle(u.vehicle), 'name')) + '</span></p>' +
            '<p class="truncate font-mono text-[9.5px] ' + (ev.eligible ? 'text-slate-500' : 'text-rose-400') + '">' +
              U.escape(ev.eligible
                ? T('disp.evalLine', {
                    eta: U.duration(ev.eta), km: Math.round(ev.distance), skill: Math.round(ev.skill),
                    margin: (ev.skillMargin >= 0 ? '+' : '') + Math.round(ev.skillMargin),
                    fuel: ev.fuelNeeded.toFixed(0)
                  }) + (ev.overtime ? ' · ' + T('disp.overtime') : '')
                : ev.blockers.join(' · ')) + '</p>' +
          '</div>' +
          '<span class="shrink-0 font-mono text-[10px] ' +
            (!ev.eligible ? 'text-slate-700' : ev.onTime ? 'text-slate-400' : 'text-amber-400') + '" title="' + U.escape(T('disp.score')) + '">' +
            (ev.eligible ? ev.score : '—') + '</span>' +
          '<button class="btn btn-primary shrink-0" data-act="dispatch-unit" data-id="' + job.id + '" data-unit="' + u.id + '"' +
            (ev.eligible ? '' : ' disabled') + '>' + U.escape(T('disp.send')) + '</button>' +
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
          '<p class="truncate text-[12px] font-semibold text-slate-100">' + U.escape(J.jobLabel(job)) + '</p>' +
          '<p class="truncate text-[10.5px] text-slate-500">' + U.escape(job.client) + ' · ' +
            U.escape(unit ? unit.callsign + ' · ' + J.statusLabel(unit.status) : T('disp.unassigned')) + '</p>' +
        '</div>' +
        '<div class="shrink-0 text-end">' +
          '<p class="font-mono text-[12px] font-bold text-emerald-300">' + U.money(job.value) + '</p>' +
          '<p class="font-mono text-[9.5px] ' + (late ? 'text-rose-400' : 'text-slate-500') + '">' +
            U.escape(T('disp.doneIn', { eta: U.duration(eta) })) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="mt-2 flex items-center gap-2">' +
        '<div class="flex-1">' + meter(job.progress || 0, 1, '#38bdf8') + '</div>' +
        '<span class="font-mono text-[10px] text-slate-500">' + Math.round((job.progress || 0) * 100) + '%</span>' +
        '<button class="btn btn-ghost" data-act="recall" data-unit="' + (unit ? unit.id : '') + '"' + (unit ? '' : ' disabled') + '>' +
          U.escape(T('disp.recall')) + '</button>' +
      '</div>' +
      (job.complication ? '<p class="mt-1.5 font-mono text-[9.5px] text-amber-400">' +
        U.escape(T('disp.scope', { time: U.duration(job.complication.extra), money: U.money(job.complication.parts) })) + '</p>' : '') +
    '</div>';
  }

  /* ── Panel: Fleet ──────────────────────────────────────────────────────── */

  PANELS.fleet = function () {
    var cards = state.fleet.map(unitCard).join('');
    var catalog = C.VEHICLES.map(vehicleRow).join('');
    return sectionHead(T('fleet.units'), U.escape(T('fleet.inService', { n: state.fleet.length }))) +
      (state.fleet.length ? '<div class="space-y-1.5 p-2">' + cards + '</div>' : empty(T('fleet.empty'))) +
      sectionHead(T('fleet.acquire'), U.escape(T('fleet.cash', { money: U.moneyShort(state.finance.cash) }))) +
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
            ' <span class="ms-1 font-normal text-slate-500">' + U.escape(I18n.f(spec, 'name')) + '</span></p>' +
          '<p class="truncate text-[10.5px] text-slate-500">' +
            U.escape(job ? J.jobLabel(job) + ' · ' + job.client
              : T('fleet.lifetime', { km: Math.round(unit.odometer), n: unit.jobsDone })) + '</p>' +
        '</div>' +
        '<span class="chip ' + statusTone + '">' + J.statusLabel(unit.status) + '</span>' +
      '</div>' +

      '<div class="mt-2 grid grid-cols-3 gap-2">' +
        gauge(T('fleet.fuel'), Math.round(fuelPct * 100) + '%', fuelPct, healthColor(fuelPct)) +
        gauge(T('fleet.condition'), Math.round(unit.condition) + '%', unit.condition / 100, healthColor(unit.condition / 100)) +
        gauge(T('fleet.crewSkill'), String(Math.round(S.crewSkill(state, unit))), U.clamp(S.crewSkill(state, unit) / 100, 0, 1), '#38bdf8') +
      '</div>' +

      '<div class="mt-2 flex flex-wrap items-center gap-1">' +
        chip(T('fleet.crewCount', { a: crew.length, b: spec.crew }), crew.length ? 'bg-slate-800 text-slate-400' : 'bg-rose-500/15 text-rose-300') +
        chip(T('fleet.bays', { a: tools.length, b: spec.slots }), 'bg-slate-800 text-slate-400') +
        S.unitCaps(state, unit).map(function (c) {
          return chip((C.CAPABILITIES[c] || {}).icon + ' ' + J.capLabel(c), 'bg-cyan-500/10 text-cyan-300');
        }).join('') +
      '</div>' +

      (crew.length ? '<p class="mt-1.5 truncate font-mono text-[9.5px] text-slate-500">' +
        crew.map(function (p) { return U.escape(p.name) + ' (' + Math.round(p.skill) + ')'; }).join(' · ') + '</p>' : '') +

      '<div class="mt-2 flex flex-wrap gap-1">' +
        '<button class="btn btn-ghost" data-act="focus-unit" data-unit="' + unit.id + '">' + U.escape(T('disp.locate')) + '</button>' +
        '<button class="btn btn-ghost" data-act="refuel" data-unit="' + unit.id + '"' + (fuelPct > 0.99 ? ' disabled' : '') + '>' +
          U.escape(T('fleet.refuel', { money: U.moneyShort((spec.fuelCap - unit.fuel) * E.fuelPrice(state)) })) + '</button>' +
        '<button class="btn btn-ghost" data-act="service" data-unit="' + unit.id + '"' + (unit.condition > 99 ? ' disabled' : '') + '>' +
          U.escape(T('fleet.service', {
            money: U.moneyShort((100 - unit.condition) * C.ECONOMY.REPAIR_COST_PER_POINT * (0.7 + spec.tier * 0.35))
          })) + '</button>' +
        (job ? '<button class="btn btn-danger" data-act="recall" data-unit="' + unit.id + '">' + U.escape(T('disp.recall')) + '</button>' : '') +
        '<button class="btn btn-danger" data-act="sell-unit" data-unit="' + unit.id + '">' + U.escape(T('fleet.sell')) + '</button>' +
      '</div>' +
    '</div>';
  }

  function gauge(label, value, frac, color) {
    return '<div>' +
      '<div class="flex items-baseline justify-between"><span class="font-mono text-[9px] uppercase tracking-wider text-slate-500">' + U.escape(label) + '</span>' +
      '<span class="font-mono text-[10.5px] font-semibold text-slate-300">' + value + '</span></div>' +
      '<div class="mt-1">' + meter(frac, 1, color) + '</div></div>';
  }

  function vehicleRow(spec) {
    var locked = !S.isUnlocked(state, spec.unlock);
    var affordable = E.canAfford(state, spec.price);
    return '<div class="card p-2.5' + (locked ? ' opacity-55' : '') + '">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="min-w-0">' +
          '<p class="truncate text-[12px] font-semibold text-slate-100">' + U.escape(I18n.f(spec, 'name')) + '</p>' +
          '<p class="text-[10.5px] leading-snug text-slate-500">' + U.escape(I18n.f(spec, 'blurb')) + '</p>' +
        '</div>' +
        '<p class="shrink-0 font-mono text-[12.5px] font-bold ' + (affordable && !locked ? 'text-emerald-300' : 'text-slate-500') + '">' + U.money(spec.price) + '</p>' +
      '</div>' +
      '<div class="mt-1.5 flex flex-wrap items-center gap-1">' +
        chip(T('fleet.tier', { n: spec.tier }), 'bg-slate-800 text-slate-400') +
        chip(T('fleet.speedSpec', { n: spec.speed }), 'bg-slate-800 text-slate-400') +
        chip(T('fleet.crewSpec', { n: spec.crew }), 'bg-slate-800 text-slate-400') +
        chip(T('fleet.baysSpec', { n: spec.slots }), 'bg-slate-800 text-slate-400') +
        chip(T('fleet.litres', { n: spec.fuelCap }), 'bg-slate-800 text-slate-400') +
        chip(T('fleet.perDay', { money: U.money(spec.upkeep) }), 'bg-slate-800 text-slate-400') +
        spec.caps.map(function (c) { return chip((C.CAPABILITIES[c] || {}).icon + ' ' + J.capLabel(c), 'bg-cyan-500/10 text-cyan-300'); }).join('') +
      '</div>' +
      '<div class="mt-2 flex items-center justify-between">' +
        '<span class="font-mono text-[9.5px] text-slate-500">' +
          U.escape(locked ? T('fleet.lockedBy', { req: milestoneName(spec.unlock) }) : '') + '</span>' +
        '<button class="btn btn-primary" data-act="buy-vehicle" data-id="' + spec.id + '"' + (locked || !affordable ? ' disabled' : '') + '>' +
          U.escape(T('fleet.buy')) + '</button>' +
      '</div>' +
    '</div>';
  }

  function milestoneName(id) {
    var m = S.milestone(id);
    return m ? T('common.requires', { name: I18n.f(m, 'name') }) : T('common.locked');
  }

  /* ── Panel: Crew ───────────────────────────────────────────────────────── */

  PANELS.crew = function () {
    var cap = S.staffCap(state);
    var payroll = S.dailyPayroll(state);
    var roster = state.staff.map(personCard).join('');
    var market = state.offers.candidates.map(candidateCard).join('');

    return sectionHead(T('crew.roster'), U.escape(T('crew.rosterSub',
        { n: state.staff.length, cap: cap, pay: U.moneyShort(payroll) }))) +
      (state.staff.length ? '<div class="space-y-1.5 p-2">' + roster + '</div>' : empty(T('crew.empty'))) +
      sectionHead(T('crew.market'), U.escape(T('crew.marketSub'))) +
      (market ? '<div class="space-y-1.5 p-2">' + market + '</div>' : empty(T('crew.noCandidates')));
  };

  function unitOptions(selectedId, forPerson) {
    var opts = '<option value="">' + U.escape(T('crew.unassigned')) + '</option>';
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
          '<p class="truncate text-[10.5px] text-slate-500">' + U.escape(T('crew.line', {
            role: roleLabel(person), wage: U.money(person.wage), jobs: person.jobsDone })) + '</p>' +
        '</div>' +
        (person.training
          ? '<span class="chip bg-violet-500/15 text-violet-300">' + U.escape(T('crew.training', { n: person.training.remaining })) + '</span>'
          : unit ? '<span class="chip bg-cyan-500/10 text-cyan-300">' + U.escape(unit.callsign) + '</span>'
                 : '<span class="chip bg-slate-700/60 text-slate-400">' + U.escape(T('crew.bench')) + '</span>') +
      '</div>' +

      '<div class="mt-2 grid grid-cols-3 gap-2">' +
        gauge(T('crew.skill'), String(Math.round(person.skill)), person.skill / 100, '#38bdf8') +
        gauge(T('crew.fatigue'), Math.round(person.fatigue) + '%', person.fatigue / 100, healthColor(1 - person.fatigue / 100)) +
        gauge(T('crew.morale'), Math.round(person.morale) + '%', person.morale / 100, healthColor(person.morale / 100)) +
      '</div>' +

      '<div class="mt-2 flex flex-wrap items-center gap-1.5">' +
        '<select class="field flex-1 min-w-[7rem]" data-change="assign-crew" data-id="' + person.id + '"' +
          (busy || person.training ? ' disabled' : '') + '>' + unitOptions(person.unitId, person) + '</select>' +
        '<button class="btn btn-ghost" data-act="train" data-id="' + person.id + '"' +
          (person.training || busy || !E.canAfford(state, trainCost.cost) ? ' disabled' : '') + '>' +
          U.escape(T('crew.train', { gain: trainCost.gain, money: U.moneyShort(trainCost.cost) })) + '</button>' +
        '<button class="btn btn-danger" data-act="fire" data-id="' + person.id + '"' + (busy ? ' disabled' : '') + '>' +
          U.escape(T('crew.fire')) + '</button>' +
      '</div>' +
    '</div>';
  }

  /** Role name resolved in the active language, falling back to the save. */
  function roleLabel(person) {
    var role = C.ROLES.filter(function (r) { return r.id === person.role; })[0];
    return I18n.f(role, 'label') || person.roleLabel;
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
          '<p class="truncate text-[10.5px] text-slate-500">' + U.escape(T('crew.candLine', {
            role: roleLabel(person), skill: Math.round(person.skill), morale: Math.round(person.morale) })) + '</p>' +
        '</div>' +
        '<div class="shrink-0 text-end">' +
          '<p class="font-mono text-[12px] font-bold text-slate-200">' + U.money(person.wage) +
            '<span class="text-[9px] text-slate-500">' + U.escape(T('crew.perDay')) + '</span></p>' +
          '<p class="font-mono text-[9.5px] text-slate-500">' + U.escape(T('crew.fee', { money: U.moneyShort(person.hireFee) })) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="mt-1.5">' + meter(person.skill, 100, '#38bdf8') + '</div>' +
      '<div class="mt-2 flex items-center justify-between">' +
        '<span class="font-mono text-[9.5px] ' + (full ? 'text-amber-400' : 'text-slate-500') + '">' +
          U.escape(full ? T('crew.capReached') : T('crew.slots', { n: state.staff.length, cap: S.staffCap(state) })) + '</span>' +
        '<button class="btn btn-primary" data-act="hire" data-id="' + person.id + '"' + (full || !affordable ? ' disabled' : '') + '>' +
          U.escape(T('crew.hire')) + '</button>' +
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
        '<span class="min-w-0 flex-1 truncate text-[10px] ' + (fielded ? 'text-slate-300' : 'text-slate-500') + '">' +
          U.escape(I18n.f(C.CAPABILITIES[capId], 'label')) + '</span>' +
        (demand ? '<span class="chip bg-amber-400/15 text-amber-300">' + demand + '</span>' : '') +
        '</div>';
    }).join('');

    var owned = state.tools.map(toolCard).join('');
    var catalog = C.TOOLS.map(toolRow).join('');

    return sectionHead(T('equip.coverage'), U.escape(T('equip.coverageSub'))) +
      '<div class="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3">' + coverage + '</div>' +
      sectionHead(T('equip.owned'), U.escape(T('equip.items', { n: state.tools.length }))) +
      (state.tools.length ? '<div class="space-y-1.5 p-2">' + owned + '</div>' : empty(T('equip.empty'))) +
      sectionHead(T('equip.catalogue'), U.escape(T('fleet.cash', { money: U.moneyShort(state.finance.cash) }))) +
      '<div class="space-y-1.5 p-2">' + catalog + '</div>';
  };

  function toolCard(tool) {
    var spec = S.tool(tool.type);
    var unit = tool.unitId ? S.unitById(state, tool.unitId) : null;
    var busy = unit && ['enroute', 'onsite'].indexOf(unit.status) !== -1;
    var opts = '<option value="">' + U.escape(T('equip.depot')) + '</option>';
    state.fleet.forEach(function (u) {
      var full = S.toolsOf(state, u).length >= S.vehicle(u.vehicle).slots && u.id !== tool.unitId;
      opts += '<option value="' + u.id + '"' + (u.id === tool.unitId ? ' selected' : '') + (full ? ' disabled' : '') + '>' +
        U.escape(u.callsign) + ' (' + S.toolsOf(state, u).length + '/' + S.vehicle(u.vehicle).slots + ')</option>';
    });

    return '<div class="card flex items-center gap-2 p-2">' +
      '<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-500/10 text-[13px] text-cyan-300">' +
        C.CAPABILITIES[spec.id].icon + '</span>' +
      '<div class="min-w-0 flex-1">' +
        '<p class="truncate text-[11.5px] font-semibold text-slate-200">' + U.escape(I18n.f(spec, 'name')) + '</p>' +
        '<p class="truncate font-mono text-[9.5px] text-slate-500">' +
          U.escape(T('equip.line', { money: U.money(spec.upkeep), quality: U.pct(spec.quality) })) + '</p>' +
      '</div>' +
      '<select class="field w-28 shrink-0" data-change="assign-tool" data-id="' + tool.id + '"' + (busy ? ' disabled' : '') + '>' + opts + '</select>' +
      '<button class="btn btn-danger shrink-0" data-act="sell-tool" data-id="' + tool.id + '"' + (busy ? ' disabled' : '') + '>' +
        U.escape(T('equip.sell')) + '</button>' +
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
        '<p class="truncate text-[11.5px] font-semibold text-slate-200">' + U.escape(I18n.f(spec, 'name')) +
          (owned ? ' <span class="font-mono text-[9.5px] text-cyan-400">×' + owned + '</span>' : '') + '</p>' +
        '<p class="truncate font-mono text-[9.5px] text-slate-500">' +
          U.escape(locked ? milestoneName(spec.unlock)
            : T('equip.catLine', { tier: spec.tier, money: U.money(spec.upkeep) })) + '</p>' +
      '</div>' +
      '<span class="shrink-0 font-mono text-[11.5px] font-bold ' + (affordable && !locked ? 'text-emerald-300' : 'text-slate-500') + '">' + U.money(spec.price) + '</span>' +
      '<button class="btn btn-primary shrink-0" data-act="buy-tool" data-id="' + spec.id + '"' + (locked || !affordable ? ' disabled' : '') + '>' +
        U.escape(T('equip.buy')) + '</button>' +
    '</div>';
  }

  /* ── Panel: Contracts ──────────────────────────────────────────────────── */

  PANELS.contracts = function () {
    var committed = state.contracts.reduce(function (t, c) { return t + (c.active ? c.volume : 0); }, 0);
    var capacity = J.capacityPerDay(state);
    var retainers = state.contracts.reduce(function (t, c) { return t + (c.active ? c.retainer : 0); }, 0);

    var warn = committed > capacity * 0.8
      ? '<div class="mx-2 mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10.5px] text-amber-300">' +
        U.escape(T('con.warn', { committed: committed.toFixed(1), capacity: capacity.toFixed(1) })) + '</div>'
      : '';

    var active = state.contracts.map(contractCard).join('');
    var offers = state.offers.contracts.map(offerCard).join('');

    return sectionHead(T('con.active'), U.escape(T('con.retainers', { money: U.moneyShort(retainers) }))) +
      warn +
      (state.contracts.length ? '<div class="space-y-1.5 p-2">' + active + '</div>' : empty(T('con.empty'))) +
      sectionHead(T('con.offers'), U.escape(T('con.offersCount', { n: state.offers.contracts.length }))) +
      (state.offers.contracts.length ? '<div class="space-y-1.5 p-2">' + offers + '</div>' : empty(T('con.noOffers')));
  };

  function contractCard(c) {
    var elapsed = state.time.day - c.startedOn;
    return '<div class="card p-2.5">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="min-w-0">' +
          '<p class="truncate text-[12.5px] font-semibold text-slate-100">' + U.escape(c.client) + '</p>' +
          '<p class="truncate text-[10.5px] text-slate-500">' + U.escape(J.contractLabel(c)) + ' · ' +
            U.escape(I18n.f(S.territory(c.territory), 'name')) + '</p>' +
        '</div>' +
        '<div class="shrink-0 text-end">' +
          '<p class="font-mono text-[12.5px] font-bold text-emerald-300">' + U.money(c.retainer) +
            '<span class="text-[9px] text-slate-500">' + U.escape(T('crew.perDay')) + '</span></p>' +
          '<p class="font-mono text-[9.5px] text-slate-500">' + U.escape(T('con.earned', { money: U.moneyShort(c.earned) })) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="mt-1.5 flex flex-wrap gap-1">' +
        sectorChip(c.sector) +
        chip(T('con.volume', { n: c.volume.toFixed(1) }), 'bg-slate-800 text-slate-400') +
        chip(T('con.mult', { n: c.mult.toFixed(2) }), 'bg-emerald-500/10 text-emerald-300') +
        chip(T('con.sla', { n: c.sla.toFixed(2) }), 'bg-slate-800 text-slate-400') +
        chip(T('con.breaches', { n: c.breaches }), c.breaches >= 3 ? 'bg-rose-500/15 text-rose-300' : 'bg-slate-800 text-slate-400') +
      '</div>' +
      '<div class="mt-2 flex items-center gap-2">' +
        '<div class="flex-1">' + meter(elapsed, c.term, '#22d3ee') + '</div>' +
        '<span class="font-mono text-[9.5px] text-slate-500">' + U.escape(T('con.day', { a: elapsed, b: c.term })) + '</span>' +
        '<button class="btn btn-danger" data-act="cancel-contract" data-id="' + c.id + '">' + U.escape(T('con.terminate')) + '</button>' +
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
          '<p class="truncate text-[10.5px] text-slate-500">' + U.escape(T('con.offerLine', {
            label: J.contractLabel(c), days: c.term, territory: I18n.f(S.territory(c.territory), 'name') })) + '</p>' +
        '</div>' +
        '<div class="shrink-0 text-end">' +
          '<p class="font-mono text-[12.5px] font-bold text-emerald-300">' + U.money(c.retainer) +
            '<span class="text-[9px] text-slate-500">' + U.escape(T('crew.perDay')) + '</span></p>' +
          '<p class="font-mono text-[9.5px] text-slate-500">' + U.escape(T('con.expires', { n: daysLeft })) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="mt-1.5 flex flex-wrap gap-1">' +
        sectorChip(c.sector) +
        chip(T('con.volume', { n: c.volume.toFixed(1) }), 'bg-slate-800 text-slate-400') +
        chip(T('con.mult', { n: c.mult.toFixed(2) }), 'bg-emerald-500/10 text-emerald-300') +
        chip(T('con.sla', { n: c.sla.toFixed(2) }), c.sla < 1 ? 'bg-amber-400/15 text-amber-300' : 'bg-slate-800 text-slate-400') +
        chip(T('con.penalty', { money: U.moneyShort(c.penalty) }), 'bg-rose-500/10 text-rose-300') +
        (c.minCsat ? chip(T('con.needCsat', { n: c.minCsat }), eligible ? 'bg-slate-800 text-slate-400' : 'bg-rose-500/15 text-rose-300') : '') +
      '</div>' +
      '<p class="mt-1.5 font-mono text-[9.5px] text-slate-500">' +
        U.escape(T('con.termValue', { money: U.moneyShort(c.retainer * c.term) })) + '</p>' +
      '<div class="mt-2 flex justify-end gap-1">' +
        '<button class="btn btn-ghost" data-act="decline-contract" data-id="' + c.id + '">' + U.escape(T('con.decline')) + '</button>' +
        '<button class="btn btn-primary" data-act="sign-contract" data-id="' + c.id + '"' + (eligible ? '' : ' disabled') + '>' +
          U.escape(T('con.sign')) + '</button>' +
      '</div>' +
    '</div>';
  }

  /* ── Panel: Finance ────────────────────────────────────────────────────── */

  PANELS.finance = function () {
    var f = state.finance;
    var w30 = E.window(state, 30);
    var credit = S.creditLimit(state);
    var room = Math.max(0, credit - f.debt);

    return sectionHead(T('fin.position'), U.escape(T('fin.last30'))) +
      '<div class="p-2">' +
        '<div class="grid grid-cols-2 gap-2">' +
          statTile(T('fin.cash'), U.money(f.cash), f.cash < 0 ? 'text-rose-400' : 'text-emerald-300') +
          statTile(T('fin.networth'), U.money(S.netWorth(state)), 'text-slate-100') +
          statTile(T('fin.tax'), U.money(f.taxAccrued), 'text-amber-300') +
          statTile(T('fin.debt'), U.money(f.debt), f.debt > 0 ? 'text-rose-300' : 'text-slate-400') +
        '</div>' +

        '<div class="mt-2 rounded-lg border border-slate-800 bg-ink-850/60 p-2">' +
          '<div class="flex items-center justify-between"><span class="panel-title">' + U.escape(T('fin.cashChart')) + '</span>' +
          '<span class="flex gap-2 font-mono text-[9.5px]"><span class="text-sky-300">■ ' + U.escape(T('fin.legendCash')) + '</span>' +
          '<span class="text-violet-300">■ ' + U.escape(T('fin.legendNet')) + '</span></span></div>' +
          '<canvas id="chart-cash" class="mt-1.5 h-32 w-full"></canvas>' +
        '</div>' +

        '<div class="mt-2 rounded-lg border border-slate-800 bg-ink-850/60 p-2">' +
          '<div class="flex items-center justify-between"><span class="panel-title">' + U.escape(T('fin.flowChart')) + '</span>' +
          '<span class="flex gap-2 font-mono text-[9.5px]"><span class="text-cyan-300">■ ' + U.escape(T('fin.legendRev')) + '</span>' +
          '<span class="text-rose-300">■ ' + U.escape(T('fin.legendExp')) + '</span></span></div>' +
          '<canvas id="chart-flow" class="mt-1.5 h-28 w-full"></canvas>' +
        '</div>' +

        '<div class="mt-2 grid grid-cols-2 gap-2">' +
          '<div class="rounded-lg border border-slate-800 bg-ink-850/60 p-2">' +
            '<span class="panel-title">' + U.escape(T('fin.mix')) + '</span>' +
            '<canvas id="chart-mix" class="mt-1 h-28 w-full"></canvas>' +
          '</div>' +
          '<div class="rounded-lg border border-slate-800 bg-ink-850/60 p-2">' +
            '<span class="panel-title">' + U.escape(T('fin.breakdown')) + '</span>' +
            '<div id="mix-legend" class="mt-1 space-y-0.5"></div>' +
          '</div>' +
        '</div>' +

        '<div class="mt-2 rounded-lg border border-slate-800 bg-ink-850/60 p-2.5">' +
          '<div class="flex items-center justify-between"><span class="panel-title">' + U.escape(T('fin.credit')) + '</span>' +
          '<span class="font-mono text-[9.5px] text-slate-500">' +
            U.escape(T('fin.creditSub', { available: U.money(room), limit: U.money(credit) })) + '</span></div>' +
          '<div class="mt-1.5">' + meter(f.debt, credit, f.debt / credit > 0.7 ? '#fb7185' : '#fbbf24') + '</div>' +
          '<div class="mt-2 flex items-center gap-1.5">' +
            '<input class="field w-28" type="number" id="credit-amount" min="1000" step="1000" value="25000">' +
            '<button class="btn btn-ghost" data-act="borrow">' + U.escape(T('fin.draw')) + '</button>' +
            '<button class="btn btn-ghost" data-act="repay"' + (f.debt <= 0 ? ' disabled' : '') + '>' + U.escape(T('fin.repay')) + '</button>' +
            '<span class="ms-auto font-mono text-[9.5px] text-slate-500">' +
              U.escape(T('fin.apr', { n: U.pct(C.ECONOMY.INTEREST_DAILY * 365, 1) })) + '</span>' +
          '</div>' +
        '</div>' +

        '<div class="mt-2 rounded-lg border border-slate-800 bg-ink-850/60 px-2.5 py-1.5">' +
          statRow(T('fin.lifeRev'), U.money(state.stats.revenue)) +
          statRow(T('fin.lifeExp'), U.money(state.stats.expense)) +
          statRow(T('fin.taxPaid'), U.money(state.stats.taxPaid)) +
          statRow(T('fin.payroll'), U.money(S.dailyPayroll(state))) +
          statRow(T('fin.assets'), U.money(S.assetValue(state))) +
          statRow(T('fin.fuelPrice'), T('fin.perLitre', { price: '$' + E.fuelPrice(state).toFixed(2) })) +
          statRow(T('fin.jobsSplit'), state.stats.jobsDone + ' / ' + state.stats.jobsFailed + ' / ' + state.stats.jobsExpired) +
          statRow(T('fin.distance'), T('fin.km', { n: Math.round(state.stats.distance).toLocaleString('en-US') })) +
        '</div>' +
      '</div>';
  };

  function statTile(label, value, tone) {
    return '<div class="rounded-lg border border-slate-800 bg-ink-850/60 px-2.5 py-2">' +
      '<p class="font-mono text-[9px] uppercase tracking-wider text-slate-500">' + U.escape(label) + '</p>' +
      '<p class="mt-0.5 font-mono text-[15px] font-bold ' + tone + '">' + value + '</p></div>';
  }

  function statRow(label, value) {
    return '<div class="stat-row"><span class="text-[11px] text-slate-500">' + U.escape(label) + '</span>' +
      '<span class="font-mono text-[11px] font-semibold text-slate-200">' + U.escape(value) + '</span></div>';
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
        empty: T('chart.empty')
      });
    }

    var flowCanvas = document.getElementById('chart-flow');
    if (flowCanvas) {
      Charts.bars(flowCanvas, history.slice(-30).map(function (d) {
        return { label: 'D' + (d.day + 1), bars: [
          { color: Charts.PALETTE.revenue, value: d.revenue },
          { color: Charts.PALETTE.expense, value: d.expense }
        ] };
      }), { empty: T('chart.noDays') });
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
      .map(function (k) { return { label: T('cost.' + k), value: totals[k], color: COST_COLORS[k] || '#94a3b8' }; });

    var mixCanvas = document.getElementById('chart-mix');
    if (mixCanvas) {
      var total = slices.reduce(function (t, s) { return t + s.value; }, 0);
      Charts.donut(mixCanvas, slices, { centerLabel: U.moneyShort(total), centerSub: T('fin.mixCenter') });
    }

    var legend = document.getElementById('mix-legend');
    if (legend) {
      var grand = slices.reduce(function (t, s) { return t + s.value; }, 0) || 1;
      legend.innerHTML = slices.length ? slices.slice(0, 8).map(function (s) {
        return '<div class="flex items-center gap-1.5 text-[10px]">' +
          '<i class="dot" style="background:' + s.color + '"></i>' +
          '<span class="min-w-0 flex-1 truncate text-slate-400">' + U.escape(s.label) + '</span>' +
          '<span class="font-mono text-slate-300">' + U.moneyShort(s.value) + '</span>' +
          '<span class="w-9 text-right font-mono text-slate-600">' + U.pct(s.value / grand) + '</span></div>';
      }).join('') : '<p class="text-[10px] text-slate-600">' + U.escape(T('fin.noSpend')) + '</p>';
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
              (done ? '✓ ' : '') + U.escape(I18n.f(m, 'name')) + '</p>' +
            '<p class="text-[10.5px] leading-snug text-slate-500">' + U.escape(I18n.f(m, 'desc')) + '</p>' +
          '</div>' +
          '<span class="chip ' + (done ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400') + '">' +
            U.escape(done ? T('grow.unlocked') : U.pct(frac)) + '</span>' +
        '</div>' +
        (done ? '' : '<div class="mt-2">' + meter(frac, 1, '#22d3ee') + '</div>') +
        '<p class="mt-1.5 font-mono text-[9.5px] ' + (done ? 'text-emerald-400/70' : 'text-cyan-400/70') + '">' +
          U.escape(I18n.f(m, 'reward')) + '</p>' +
      '</div>';
    }).join('');

    var territories = C.TERRITORIES.map(function (t) {
      var owned = state.territories.indexOf(t.id) !== -1;
      var unlocked = S.isUnlocked(state, t.unlock);
      var affordable = E.canAfford(state, t.price);
      return '<div class="card p-2.5' + (owned ? ' border-cyan-500/30 bg-cyan-500/5' : unlocked ? '' : ' opacity-55') + '">' +
        '<div class="flex items-start justify-between gap-2">' +
          '<div class="min-w-0">' +
            '<p class="truncate text-[12px] font-semibold ' + (owned ? 'text-cyan-300' : 'text-slate-100') + '">' +
              U.escape(I18n.f(t, 'name')) + '</p>' +
            '<p class="text-[10.5px] leading-snug text-slate-500">' + U.escape(I18n.f(t, 'blurb')) + '</p>' +
          '</div>' +
          (owned ? '<span class="chip bg-cyan-500/15 text-cyan-300">' + U.escape(T('grow.licensedTag')) + '</span>'
                 : '<p class="shrink-0 font-mono text-[12px] font-bold ' + (affordable && unlocked ? 'text-emerald-300' : 'text-slate-500') + '">' + U.money(t.price) + '</p>') +
        '</div>' +
        '<div class="mt-1.5 flex flex-wrap gap-1">' +
          chip(T('grow.demand', { n: t.demand.toFixed(2) }), 'bg-slate-800 text-slate-400') +
          Object.keys(t.mix).filter(function (k) { return t.mix[k] > 0; })
            .sort(function (a, b) { return t.mix[b] - t.mix[a]; }).slice(0, 3)
            .map(function (k) { return sectorChip(k); }).join('') +
        '</div>' +
        (owned ? '' : '<div class="mt-2 flex items-center justify-between">' +
          '<span class="font-mono text-[9.5px] text-slate-500">' +
            U.escape(unlocked ? T('grow.available') : milestoneName(t.unlock)) + '</span>' +
          '<button class="btn btn-primary" data-act="buy-territory" data-id="' + t.id + '"' + (!unlocked || !affordable ? ' disabled' : '') + '>' +
            U.escape(T('grow.licence')) + '</button>' +
        '</div>') +
      '</div>';
    }).join('');

    var sectors = Object.keys(C.SECTORS).map(function (k) {
      var sec = C.SECTORS[k];
      var open = S.isUnlocked(state, sec.unlock);
      return '<div class="flex items-center gap-2 rounded-md border px-2 py-1.5 ' +
        (open ? 'border-slate-700 bg-slate-800/30' : 'border-slate-800 opacity-50') + '">' +
        '<i class="dot" style="background:' + sec.color + '"></i>' +
        '<span class="flex-1 truncate text-[11px] ' + (open ? 'text-slate-200' : 'text-slate-500') + '">' +
          U.escape(I18n.f(sec, 'label')) + '</span>' +
        '<span class="font-mono text-[9px] uppercase ' + (open ? 'text-emerald-400' : 'text-slate-600') + '">' +
          U.escape(T(open ? 'grow.active' : 'grow.locked')) + '</span></div>';
    }).join('');

    return sectionHead(T('grow.sectors'), S.activeSectors(state).length + '/' + Object.keys(C.SECTORS).length) +
      '<div class="grid grid-cols-2 gap-1.5 p-2">' + sectors + '</div>' +
      sectionHead(T('grow.territories'), U.escape(T('grow.licensed', { n: state.territories.length }))) +
      '<div class="space-y-1.5 p-2">' + territories + '</div>' +
      sectionHead(T('grow.milestones'), state.milestones.length + '/' + C.MILESTONES.length) +
      '<div class="space-y-1.5 p-2">' + milestones + '</div>';
  };

  /* ── Actions ───────────────────────────────────────────────────────────── */

  function toast(kind, title, msg) { Notify.toast({ kind: kind, title: title, msg: msg }); }

  function result(res, okMsg) {
    if (res && res.ok) { toast('ok', T('act.done'), okMsg); return true; }
    toast('warn', T('act.notPossible'), reason(res));
    return false;
  }

  /** Modules return i18n keys as failure reasons; resolve them for display. */
  function reason(res) {
    return res && res.reason ? T(res.reason) : T('act.unavailable');
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
        toast('info', T('act.autoTitle'), T(state.ops.autoDispatch ? 'act.autoOn' : 'act.autoOff'));
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
          toast('ok', T('act.dispatched'), T('act.dispatchedMsg', {
            unit: unit.callsign, job: J.jobLabel(job), eta: U.duration(res.eval.eta) }));
          Notify.log({ kind: 'info', msg: T('log.dispatch', {
            unit: unit.callsign, job: J.jobLabel(job), client: job.client }) });
          dispatchOpenFor = null;
          selection.jobId = null;
          Map.select(selection);
        } else {
          toast('warn', T('act.dispatchRefused'), reason(res));
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
          toast('warn', T('act.recalled'), T('act.recalledMsg', { unit: ru.callsign }));
        }
        break;

      case 'refuel': {
        var rf = E.refuel(state, unitId);
        result(rf, rf.ok ? T('act.refuelled', { litres: rf.litres.toFixed(0), money: money(rf.cost) }) : '');
        break;
      }

      case 'service': {
        var sv = E.serviceUnit(state, unitId);
        result(sv, sv.ok ? T('act.serviced', { money: money(sv.cost) }) : '');
        break;
      }

      case 'sell-unit': {
        var su = S.unitById(state, unitId);
        if (!su) break;
        confirmModal(T('act.sellTitle', { unit: su.callsign }),
          T('act.sellBody', { money: money(S.vehicle(su.vehicle).price * 0.48 * (su.condition / 100)) }), function () {
            var r = E.sellVehicle(state, unitId);
            result(r, r.ok ? T('act.sold', { unit: su.callsign, money: money(r.value) }) : '');
            UI.render(true);
          });
        return;
      }

      case 'buy-vehicle': {
        var bv = E.buyVehicle(state, id);
        result(bv, bv.ok ? T('act.bought', { unit: bv.unit.callsign }) : '');
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
          var toolName = I18n.f(S.tool(id), 'name');
          toast('ok', T('act.toolBought'), host
            ? T('act.toolLoaded', { tool: toolName, unit: host.callsign })
            : T('act.toolDepot', { tool: toolName }));
        } else {
          toast('warn', T('act.notPossible'), reason(bt));
        }
        break;
      }

      case 'sell-tool': {
        var st = E.sellTool(state, id);
        result(st, st.ok ? T('act.toolSold', { money: money(st.value) }) : '');
        break;
      }

      case 'hire': {
        var h = E.hire(state, id);
        result(h, h.ok ? T('act.hired', { name: h.person.name }) : '');
        break;
      }

      case 'fire': {
        var person = S.personById(state, id);
        if (!person) break;
        confirmModal(T('act.fireTitle', { name: person.name }),
          T('act.fireBody', { money: money(person.wage * 6) }),
          function () {
            var r = E.fire(state, id);
            result(r, r.ok ? T('act.fired', { name: person.name, money: money(r.severance) }) : '');
            UI.render(true);
          });
        return;
      }

      case 'train': {
        var tr = E.train(state, id, 3);
        result(tr, tr.ok ? T('act.trained', { gain: tr.gain, days: tr.days, money: money(tr.cost) }) : '');
        break;
      }

      case 'sign-contract': {
        var sc = J.signContract(state, id);
        result(sc, sc.ok ? T('act.signed', { client: sc.contract.client, days: sc.contract.term }) : '');
        break;
      }

      case 'decline-contract':
        state.offers.contracts = state.offers.contracts.filter(function (c) { return c.id !== id; });
        break;

      case 'cancel-contract': {
        var cc = J.contractById(state, id);
        if (!cc) break;
        confirmModal(T('act.cancelTitle', { client: cc.client }),
          T('act.cancelBody', { money: money(cc.penalty * 2.2) }), function () {
            var r = J.cancelContract(state, id);
            result(r, r.ok ? T('act.cancelled', { money: money(r.fee) }) : '');
            UI.render(true);
          });
        return;
      }

      case 'buy-territory': {
        var bter = E.buyTerritory(state, id);
        if (bter.ok) {
          var terrName = I18n.f(bter.territory, 'name');
          toast('ok', T('act.terrTitle'), T('act.terrMsg', { name: terrName }));
          Notify.log({ kind: 'ok', msg: T('log.expansion', { name: terrName, money: money(bter.territory.price) }) });
          Map.focus(bter.territory.x, bter.territory.y, 0.9);
        } else {
          toast('warn', T('act.notPossible'), reason(bter));
        }
        break;
      }

      case 'borrow': {
        var amt = readAmount('credit-amount');
        var drawn = E.borrow(state, amt);
        if (drawn > 0) toast('info', T('act.creditDrawn'), T('act.creditDrawnMsg', { money: money(drawn) }));
        else toast('warn', T('act.refused'), T('act.noHeadroom'));
        break;
      }

      case 'repay': {
        var ramt = readAmount('credit-amount');
        var paid = E.repay(state, ramt);
        if (paid > 0) toast('ok', T('act.repaid'), T('act.repaidMsg', { money: money(paid) }));
        else toast('warn', T('act.refused'), T('act.nothingToRepay'));
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
      case 'menu-export': UI.emit('export'); return;
      case 'menu-import': UI.emit('import'); return;

      case 'transfer-copy':
        copyTransfer();
        return;

      case 'transfer-download':
        UI.emit('download', transferPayload);
        return;

      case 'transfer-file':
        UI.emit('pick-file');
        return;

      case 'transfer-load': {
        var box = document.getElementById('transfer-text');
        var text = box ? box.value.trim() : '';
        if (!text) { toast('warn', T('act.notPossible'), T('xfer.empty')); return; }
        UI.closeModal();
        UI.emit('import-json', text);
        return;
      }
      case 'menu-reset':
        UI.closeModal();
        confirmModal(T('menu.resetTitle'), T('menu.resetBody'), function () { UI.emit('reset'); });
        return;
      case 'menu-autosave':
        state.settings.autosave = !state.settings.autosave;
        UI.showMenu();
        return;
      case 'menu-notifications':
        state.settings.notifications = !state.settings.notifications;
        UI.showMenu();
        return;
      case 'set-lang':
        I18n.setLang(btn.dataset.lang);
        UI.showMenu();
        return;
    }

    UI.render(true);
  }

  /** Clipboard API where available, selection copy where it is not. */
  function copyTransfer() {
    var box = document.getElementById('transfer-text');
    var done = function () { toast('ok', T('act.done'), T('xfer.copied')); };
    var failed = function () { toast('warn', T('act.notPossible'), T('xfer.copyFailed')); };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(transferPayload).then(done, function () { legacyCopy(box, done, failed); });
    } else {
      legacyCopy(box, done, failed);
    }
  }

  function legacyCopy(box, done, failed) {
    if (!box) { failed(); return; }
    box.removeAttribute('readonly');
    box.focus();
    box.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    box.setAttribute('readonly', 'readonly');
    if (ok) done(); else failed();
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
        toast('warn', T('act.assignRefused'), T('act.noSeat'));
      }
    } else if (kind === 'assign-tool') {
      if (!S.assignTool(state, el.dataset.id, el.value || null)) {
        toast('warn', T('act.assignRefused'), T('act.noBay'));
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
          '<button class="btn btn-ghost" data-act="modal-close">' + U.escape(T('modal.cancel')) + '</button>' +
          '<button class="btn btn-danger" data-act="modal-confirm">' + U.escape(T('modal.confirm')) + '</button>' +
        '</div>' +
      '</div>');
  }

  /** Decision dialog for a random world event. */
  UI.showEvent = function (evt) {
    var options = evt.options.map(function (opt, i) {
      var unaffordable = opt.cost && !E.canAfford(state, opt.cost);
      return '<button class="w-full rounded-lg border border-slate-700 bg-ink-850 p-3 text-start transition hover:border-cyan-500/60 hover:bg-ink-800 disabled:opacity-40" ' +
        'data-act="event-option" data-index="' + i + '"' + (unaffordable ? ' disabled' : '') + '>' +
        '<div class="flex items-center justify-between gap-2">' +
          '<span class="text-[12.5px] font-semibold text-slate-100">' + U.escape(I18n.f(opt, 'label')) + '</span>' +
          (opt.cost ? '<span class="font-mono text-[11px] font-bold ' + (unaffordable ? 'text-rose-400' : 'text-amber-300') + '">' + money(opt.cost) + '</span>' : '') +
        '</div>' +
        '<p class="mt-1 text-[11px] leading-snug text-slate-400">' + U.escape(I18n.f(opt, 'detail')) + '</p>' +
      '</button>';
    }).join('');

    UI.modal(
      '<div class="p-5">' +
        '<div class="flex items-center gap-2">' +
          '<span class="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 text-[13px] text-amber-300">!</span>' +
          '<h3 class="text-[15px] font-semibold text-slate-100">' + U.escape(I18n.f(evt, 'title')) + '</h3>' +
        '</div>' +
        '<p class="mt-3 text-[12px] leading-relaxed text-slate-400">' + U.escape(I18n.f(evt, 'body')) + '</p>' +
        '<div class="mt-4 space-y-2">' + options + '</div>' +
        '<p class="mt-3 text-center font-mono text-[9.5px] uppercase tracking-wider text-slate-600">' +
          U.escape(T('modal.eventFooter')) + '</p>' +
      '</div>', { dismissible: false });
  };

  var transferPayload = '';

  /**
   * Embedded viewers (the artifact host among them) never grant a page
   * permission to save a file, and the attempt fails silently. Where that is
   * the case the file route is simply not offered — copy-and-paste is.
   */
  var canDownload = (function () {
    try { return window.self === window.top; } catch (err) { return false; }
  })();

  /**
   * Save transfer as text rather than only as a file: some hosts (the artifact
   * viewer among them) never grant a page download permission, and a button
   * that silently does nothing is worse than no button.
   */
  UI.showTransfer = function (mode, json) {
    transferPayload = json || '';
    var isExport = mode === 'export';
    UI.modal(
      '<div class="p-5">' +
        '<h3 class="text-[15px] font-semibold text-slate-100">' +
          U.escape(T(isExport ? 'xfer.exportTitle' : 'xfer.importTitle')) + '</h3>' +
        '<p class="mt-2 text-[12px] leading-relaxed text-slate-400">' +
          U.escape(T(isExport ? (canDownload ? 'xfer.exportBody' : 'xfer.exportBodyCopy') : 'xfer.importBody')) + '</p>' +
        '<textarea id="transfer-text" dir="ltr" spellcheck="false"' +
          (isExport ? ' readonly' : ' placeholder="' + U.escape(T('xfer.placeholder')) + '"') +
          ' class="mt-3 h-32 w-full resize-none rounded-lg border border-slate-700 bg-ink-850 p-2 font-mono text-[10px] leading-snug text-slate-300 outline-none focus:border-cyan-500">' +
          U.escape(isExport ? transferPayload : '') + '</textarea>' +
        '<div class="mt-4 flex flex-wrap justify-end gap-2">' +
          '<button class="btn btn-ghost" data-act="modal-close">' + U.escape(T('modal.cancel')) + '</button>' +
          (isExport
            ? (canDownload ? '<button class="btn btn-ghost" data-act="transfer-download">' + U.escape(T('xfer.download')) + '</button>' : '') +
              '<button class="btn btn-primary" data-act="transfer-copy">' + U.escape(T('xfer.copy')) + '</button>'
            : '<button class="btn btn-ghost" data-act="transfer-file">' + U.escape(T('xfer.chooseFile')) + '</button>' +
              '<button class="btn btn-primary" data-act="transfer-load">' + U.escape(T('xfer.load')) + '</button>') +
        '</div>' +
      '</div>');

    var box = document.getElementById('transfer-text');
    if (box && isExport) { box.focus(); box.select(); }
  };

  UI.showMenu = function () {
    UI.modal(
      '<div class="p-5">' +
        '<h3 class="text-[15px] font-semibold text-slate-100">' + U.escape(T('menu.title')) + '</h3>' +
        '<div class="mt-4 space-y-1.5">' +
          menuRow('menu-save', T('menu.save'), T('menu.saveSub')) +
          menuRow('menu-load', T('menu.load'), T('menu.loadSub')) +
          menuRow('menu-export', T('menu.export'), T('menu.exportSub')) +
          menuRow('menu-import', T('menu.import'), T('menu.importSub')) +
        '</div>' +
        '<div class="mt-4 space-y-1.5 border-t border-slate-800 pt-4">' +
          languageRow() +
          toggleRow('menu-autosave', T('menu.autosave'), state.settings.autosave) +
          toggleRow('menu-notifications', T('menu.notifications'), state.settings.notifications) +
        '</div>' +
        '<div class="mt-4 flex justify-between border-t border-slate-800 pt-4">' +
          '<button class="btn btn-danger" data-act="menu-reset">' + U.escape(T('menu.reset')) + '</button>' +
          '<button class="btn btn-primary" data-act="modal-close">' + U.escape(T('menu.back')) + '</button>' +
        '</div>' +
      '</div>');
  };

  function menuRow(act, label, detail) {
    return '<button class="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-ink-850 px-3 py-2 text-start transition hover:border-slate-600" data-act="' + act + '">' +
      '<span><span class="block text-[12px] font-semibold text-slate-200">' + U.escape(label) + '</span>' +
      '<span class="block text-[10.5px] text-slate-500">' + U.escape(detail) + '</span></span>' +
      '<span class="text-slate-600">' + (I18n.isRtl() ? '‹' : '›') + '</span></button>';
  }

  function toggleRow(act, label, on) {
    return '<button class="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-start" data-act="' + act + '">' +
      '<span class="text-[12px] text-slate-300">' + U.escape(label) + '</span>' +
      '<span class="chip ' + (on ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-500') + '">' +
      U.escape(T(on ? 'menu.on' : 'menu.off')) + '</span></button>';
  }

  /** Language picker inside the operations menu. */
  function languageRow() {
    return '<div class="flex items-center justify-between rounded-lg px-1 py-1.5">' +
      '<span class="text-[12px] text-slate-300">' + U.escape(T('menu.language')) + '</span>' +
      '<span class="flex gap-1">' + I18n.LANGUAGES.map(function (lang) {
        var on = I18n.lang() === lang.id;
        return '<button class="btn ' + (on ? 'btn-primary' : 'btn-ghost') + '" data-act="set-lang" data-lang="' +
          lang.id + '">' + U.escape(lang.name) + '</button>';
      }).join('') + '</span></div>';
  }

  /** End-of-run summary when the operation runs out of money. */
  UI.showInsolvency = function () {
    UI.modal(
      '<div class="p-5">' +
        '<h3 class="text-[15px] font-semibold text-rose-300">' + U.escape(T('insolv.title')) + '</h3>' +
        '<p class="mt-2 text-[12px] leading-relaxed text-slate-400">' + U.escape(T('insolv.body')) + '</p>' +
        '<div class="mt-4 grid grid-cols-2 gap-2">' +
          statTile(T('insolv.cash'), money(state.finance.cash), 'text-rose-400') +
          statTile(T('insolv.debt'), money(state.finance.debt), 'text-rose-300') +
          statTile(T('insolv.assets'), U.moneyShort(S.assetValue(state)), 'text-slate-200') +
          statTile(T('insolv.payroll'), U.moneyShort(S.dailyPayroll(state)), 'text-slate-200') +
        '</div>' +
        '<div class="mt-5 flex justify-end gap-2">' +
          '<button class="btn btn-danger" data-act="menu-reset">' + U.escape(T('menu.reset')) + '</button>' +
          '<button class="btn btn-primary" data-act="modal-close">' + U.escape(T('insolv.restructure')) + '</button>' +
        '</div>' +
      '</div>', { dismissible: false });
  };

  FST.UI = UI;
})(window.FST = window.FST || {});
