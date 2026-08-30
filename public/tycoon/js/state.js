/**
 * MERIDIAN FIELD OPS — Game state: entity factories, derived queries,
 * and LocalStorage persistence.
 */
(function (FST) {
  'use strict';

  var C = FST.Config, U = FST.Utils;
  var S = {};

  /** Name pool for the active language, falling back to the English list. */
  function pool(key) {
    var lang = FST.I18n ? FST.I18n.lang() : 'en';
    return (lang !== 'en' && C[key + '_' + lang]) || C[key];
  }
  S.pool = pool;

  /* ── Entity factories ──────────────────────────────────────────────────── */

  S.makePerson = function (roleId) {
    var role = C.ROLES.filter(function (r) { return r.id === roleId; })[0] || C.ROLES[0];
    var skill = U.randInt(role.skill[0], role.skill[1]);
    return {
      id: U.uid('p'),
      name: U.pick(pool('FIRST_NAMES')) + ' ' + U.pick(pool('LAST_NAMES')),
      role: role.id,
      roleLabel: role.label,
      skill: skill,
      wage: Math.round(role.wage * U.rand(0.9, 1.12) * (1 + (skill - role.skill[0]) / 220)),
      hireFee: role.hireFee,
      fatigue: 0,
      morale: U.randInt(62, 88),
      unitId: null,
      training: null,     // { days, remaining, gain, cost }
      jobsDone: 0,
      hiredOn: 0
    };
  };

  S.makeUnit = function (vehicleId, callsign) {
    var v = S.vehicle(vehicleId);
    return {
      id: U.uid('u'),
      callsign: callsign,
      vehicle: v.id,
      x: C.HQ.x, y: C.HQ.y,
      crew: [],
      status: 'idle',       // idle | enroute | onsite | returning | offshift | shop
      jobId: null,
      path: [],
      pathIndex: 0,
      progress: 0,          // minutes of work completed on current job
      fuel: v.fuelCap,
      condition: 100,
      odometer: 0,
      shopDays: 0,
      wearMod: 1,
      jobsDone: 0,
      purchasedOn: 0
    };
  };

  S.makeTool = function (toolId) {
    var t = S.tool(toolId);
    return { id: U.uid('t'), type: t.id, unitId: null, condition: 100, boughtOn: 0 };
  };

  /* ── Catalog lookups ───────────────────────────────────────────────────── */
  function finder(list, key) {
    var index = {};
    list.forEach(function (item) { index[item[key || 'id']] = item; });
    return function (id) { return index[id]; };
  }
  S.vehicle = finder(C.VEHICLES);
  S.tool = finder(C.TOOLS);
  S.jobType = finder(C.JOB_TYPES);
  S.territory = finder(C.TERRITORIES);
  S.milestone = finder(C.MILESTONES);

  /* ── New game ──────────────────────────────────────────────────────────── */
  S.create = function (companyName) {
    var seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    U.setRng(U.makeRng(seed));

    var state = {
      version: C.VERSION,
      seed: seed,
      company: { name: companyName || 'Meridian Field Services', founded: Date.now() },
      time: { minutes: 6 * 60, speed: 1, lastSpeed: 1, day: 0 },
      finance: {
        cash: C.ECONOMY.START_CASH,
        debt: 0,
        taxAccrued: 0,
        fuelPrice: C.ECONOMY.FUEL_PRICE,
        fuelPriceMod: { mult: 1, until: 0 },
        today: blankLedger(),
        history: []
      },
      ops: { csat: C.CSAT.START, streak: 0, autoDispatch: false },
      stats: {
        revenue: 0, expense: 0, taxPaid: 0,
        jobsDone: 0, jobsFailed: 0, jobsExpired: 0,
        distance: 0, fuelUsed: 0
      },
      fleet: [],
      staff: [],
      tools: [],
      jobs: [],
      contracts: [],
      offers: { contracts: [], candidates: [] },
      territories: ['northgate'],
      milestones: [],
      modifiers: {},        // transient buffs, keyed by id → { until, value }
      log: [],
      pendingEvent: null,
      settings: { autosave: true, notifications: true },
      netWorth: 0,
      lastCandidateDay: -1,
      lastContractDay: -1,
      lastEventDay: 0,
      idSeq: 0
    };

    // Starting assets: two vans, three crew, a basic toolkit.
    var u1 = S.makeUnit('van_compact', 'ATLAS');
    var u2 = S.makeUnit('van_heavy', 'BRAVO');
    state.fleet.push(u1, u2);

    var p1 = S.makePerson('technician');
    var p2 = S.makePerson('technician');
    var p3 = S.makePerson('apprentice');
    state.staff.push(p1, p2, p3);
    S.assignCrew(state, p1.id, u1.id);
    S.assignCrew(state, p2.id, u2.id);
    S.assignCrew(state, p3.id, u2.id);

    var t1 = S.makeTool('diagnostic');
    var t2 = S.makeTool('hvac');
    var t3 = S.makeTool('hydraulic');
    state.tools.push(t1, t2, t3);
    S.assignTool(state, t1.id, u1.id);
    S.assignTool(state, t2.id, u1.id);
    S.assignTool(state, t3.id, u2.id);

    S.refreshCandidates(state);
    return state;
  };

  function blankLedger() {
    return {
      revenue: { jobs: 0, retainers: 0, other: 0 },
      expense: { payroll: 0, fuel: 0, maintenance: 0, overhead: 0, insurance: 0, penalties: 0, interest: 0, capex: 0, training: 0, tax: 0 }
    };
  }
  S.blankLedger = blankLedger;

  /* ── Assignment helpers ────────────────────────────────────────────────── */

  S.unitById = function (state, id) {
    for (var i = 0; i < state.fleet.length; i++) if (state.fleet[i].id === id) return state.fleet[i];
    return null;
  };
  S.personById = function (state, id) {
    for (var i = 0; i < state.staff.length; i++) if (state.staff[i].id === id) return state.staff[i];
    return null;
  };
  S.jobById = function (state, id) {
    for (var i = 0; i < state.jobs.length; i++) if (state.jobs[i].id === id) return state.jobs[i];
    return null;
  };
  S.toolById = function (state, id) {
    for (var i = 0; i < state.tools.length; i++) if (state.tools[i].id === id) return state.tools[i];
    return null;
  };

  S.crewOf = function (state, unit) {
    return unit.crew.map(function (id) { return S.personById(state, id); })
      .filter(function (p) { return !!p; });
  };

  S.toolsOf = function (state, unit) {
    return state.tools.filter(function (t) { return t.unitId === unit.id; });
  };

  S.assignCrew = function (state, personId, unitId) {
    var person = S.personById(state, personId);
    if (!person) return false;
    // Detach from any previous unit first.
    state.fleet.forEach(function (u) {
      u.crew = u.crew.filter(function (id) { return id !== personId; });
    });
    person.unitId = null;
    if (!unitId) return true;

    var unit = S.unitById(state, unitId);
    if (!unit) return false;
    if (unit.crew.length >= S.vehicle(unit.vehicle).crew) return false;
    unit.crew.push(personId);
    person.unitId = unitId;
    return true;
  };

  S.assignTool = function (state, toolId, unitId) {
    var tool = S.toolById(state, toolId);
    if (!tool) return false;
    tool.unitId = null;
    if (!unitId) return true;
    var unit = S.unitById(state, unitId);
    if (!unit) return false;
    if (S.toolsOf(state, unit).length >= S.vehicle(unit.vehicle).slots) return false;
    tool.unitId = unitId;
    return true;
  };

  /* ── Derived stats ─────────────────────────────────────────────────────── */

  /** Every capability a unit can currently deliver (vehicle built-ins + loadout). */
  S.unitCaps = function (state, unit) {
    var caps = S.vehicle(unit.vehicle).caps.slice();
    S.toolsOf(state, unit).forEach(function (t) {
      if (caps.indexOf(t.type) === -1) caps.push(t.type);
    });
    return caps;
  };

  /** Effective crew skill: best tech carries, others contribute at 40%. */
  S.crewSkill = function (state, unit) {
    var crew = S.crewOf(state, unit);
    if (!crew.length) return 0;
    var sorted = crew.slice().sort(function (a, b) { return b.skill - a.skill; });
    var total = sorted[0].skill;
    for (var i = 1; i < sorted.length; i++) total += sorted[i].skill * 0.4;
    var fatiguePenalty = crew.reduce(function (sum, p) { return sum + p.fatigue; }, 0) / crew.length / 100 * 22;
    var moraleBonus = (crew.reduce(function (sum, p) { return sum + p.morale; }, 0) / crew.length - 60) * 0.09;
    return U.clamp(total - fatiguePenalty + moraleBonus, 0, 130);
  };

  S.unitSpeed = function (state, unit) {
    var v = S.vehicle(unit.vehicle);
    var conditionFactor = 0.65 + 0.35 * (unit.condition / 100);
    return v.speed * conditionFactor;
  };

  S.isAvailable = function (state, unit) {
    return ['idle', 'offshift', 'returning'].indexOf(unit.status) !== -1 &&
      unit.crew.length > 0 && unit.condition > 12 && unit.fuel > 4;
  };

  S.dailyPayroll = function (state) {
    return state.staff.reduce(function (sum, p) { return sum + p.wage; }, 0);
  };

  S.assetValue = function (state) {
    var v = state.fleet.reduce(function (sum, u) {
      var spec = S.vehicle(u.vehicle);
      return sum + spec.price * 0.55 * (u.condition / 100);
    }, 0);
    v += state.tools.reduce(function (sum, t) { return sum + S.tool(t.type).price * 0.5; }, 0);
    return v;
  };

  S.netWorth = function (state) {
    return state.finance.cash - state.finance.debt - state.finance.taxAccrued + S.assetValue(state);
  };

  S.creditLimit = function (state) {
    return Math.round(C.ECONOMY.CREDIT_BASE + S.assetValue(state) * C.ECONOMY.CREDIT_PER_ASSET
      + Math.max(0, state.ops.csat - 60) * 3000);
  };

  S.staffCap = function (state) {
    var cap = C.STAFF_CAP_BASE;
    state.milestones.forEach(function (id) {
      var m = S.milestone(id);
      if (m && m.staff) cap += m.staff;
    });
    return cap;
  };

  S.isUnlocked = function (state, unlockId) {
    return !unlockId || state.milestones.indexOf(unlockId) !== -1;
  };

  S.activeSectors = function (state) {
    return Object.keys(C.SECTORS).filter(function (k) {
      return S.isUnlocked(state, C.SECTORS[k].unlock);
    });
  };

  S.modifier = function (state, id) {
    var m = state.modifiers[id];
    if (!m) return 0;
    if (m.until && state.time.minutes > m.until) { delete state.modifiers[id]; return 0; }
    return m.value;
  };

  S.setModifier = function (state, id, value, days) {
    state.modifiers[id] = { value: value, until: state.time.minutes + days * 1440 };
  };

  /* ── Hiring pool ───────────────────────────────────────────────────────── */
  S.refreshCandidates = function (state) {
    var pool = [];
    var count = U.randInt(3, 5);
    var roles = ['apprentice', 'technician', 'technician', 'senior'];
    if (state.milestones.indexOf('m_reputation') !== -1) roles.push('senior', 'specialist');
    if (state.milestones.indexOf('m_grid') !== -1) roles.push('specialist');
    for (var i = 0; i < count; i++) pool.push(S.makePerson(U.pick(roles)));
    state.offers.candidates = pool;
    state.lastCandidateDay = state.time.day;
  };

  /* ── Persistence ───────────────────────────────────────────────────────── */

  S.serialize = function (state) {
    var copy = JSON.parse(JSON.stringify(state));
    copy.idSeq = U.idCounter();
    copy.savedAt = Date.now();
    return JSON.stringify(copy);
  };

  S.save = function (state, key) {
    try {
      localStorage.setItem(key || C.SAVE_KEY, S.serialize(state));
      return true;
    } catch (err) {
      console.warn('Save failed', err);
      return false;
    }
  };

  S.hasSave = function (key) {
    try { return !!localStorage.getItem(key || C.SAVE_KEY); } catch (err) { return false; }
  };

  S.load = function (key) {
    try {
      var raw = localStorage.getItem(key || C.SAVE_KEY);
      if (!raw) return null;
      return S.hydrate(JSON.parse(raw));
    } catch (err) {
      console.warn('Load failed', err);
      return null;
    }
  };

  /** Fill in any fields added since the save was written. */
  S.hydrate = function (data) {
    var fresh = S.create(data.company && data.company.name);
    var state = mergeDeep(fresh, data);
    U.seedIdCounter(data.idSeq || 1000);
    U.setRng(U.makeRng(((data.seed || 1) ^ (data.time && data.time.minutes || 0)) >>> 0));
    // Arrays come wholesale from the save; never merged element-by-element.
    ['fleet', 'staff', 'tools', 'jobs', 'contracts', 'territories', 'milestones', 'log', 'history']
      .forEach(function (k) { if (Array.isArray(data[k])) state[k] = data[k]; });
    if (data.finance && Array.isArray(data.finance.history)) state.finance.history = data.finance.history;
    if (data.offers) state.offers = data.offers;
    state.time.speed = 0; // always resume paused
    return state;
  };

  function mergeDeep(base, patch) {
    if (patch === null || patch === undefined) return base;
    if (Array.isArray(patch)) return patch.slice();
    if (typeof patch !== 'object') return patch;
    var out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(patch).forEach(function (k) {
      var b = out[k], p = patch[k];
      out[k] = (b && typeof b === 'object' && !Array.isArray(b) && p && typeof p === 'object' && !Array.isArray(p))
        ? mergeDeep(b, p) : (Array.isArray(p) ? p.slice() : p);
    });
    return out;
  }

  S.clearSave = function (key) {
    try { localStorage.removeItem(key || C.SAVE_KEY); } catch (err) { /* ignore */ }
  };

  FST.State = S;
})(window.FST = window.FST || {});
