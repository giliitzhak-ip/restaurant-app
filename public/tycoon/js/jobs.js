/**
 * MERIDIAN FIELD OPS — Service call generation, dispatch scoring, job
 * resolution and client contracts.
 */
(function (FST) {
  'use strict';

  var C = FST.Config, U = FST.Utils, S = FST.State, E = FST.Economy;
  var J = {};

  /* Statuses from which a unit can accept a new assignment. */
  var DISPATCHABLE = ['idle', 'offshift', 'returning'];
  J.DISPATCHABLE = DISPATCHABLE;

  /* ── Generation ────────────────────────────────────────────────────────── */

  /** Pick a random point inside a territory, biased away from the dead centre. */
  function pointIn(terr) {
    var angle = U.rand(0, Math.PI * 2);
    var radius = terr.r * Math.sqrt(U.rand(0.06, 0.94));
    return {
      x: U.clamp(terr.x + Math.cos(angle) * radius, 40, C.WORLD.w - 40),
      y: U.clamp(terr.y + Math.sin(angle) * radius, 40, C.WORLD.h - 40)
    };
  }

  /** True when some unlocked vehicle or tool can supply this capability. */
  J.capAvailable = function (state, cap) {
    var byTool = C.TOOLS.some(function (t) { return t.id === cap && S.isUnlocked(state, t.unlock); });
    if (byTool) return true;
    return C.VEHICLES.some(function (v) {
      return v.caps.indexOf(cap) !== -1 && S.isUnlocked(state, v.unlock);
    });
  };

  /** True when the fleet can actually field this capability right now. */
  J.capFielded = function (state, cap) {
    return state.fleet.some(function (u) { return S.unitCaps(state, u).indexOf(cap) !== -1; });
  };

  /**
   * Job types a territory can generate: the sector must be unlocked and every
   * required capability must at least be purchasable, so the board never fills
   * with work that is impossible by construction.
   */
  function candidateTypes(state, terr) {
    var sectors = S.activeSectors(state);
    return C.JOB_TYPES.filter(function (t) {
      if (sectors.indexOf(t.sector) === -1) return false;
      if (!(terr.mix[t.sector] || 0)) return false;
      return t.caps.every(function (c) { return J.capAvailable(state, c); });
    });
  }

  J.spawn = function (state, opts) {
    opts = opts || {};
    var terrId = opts.territory || U.pick(state.territories);
    var terr = S.territory(terrId);
    if (!terr) return null;

    var types = candidateTypes(state, terr);
    if (!types.length) return null;

    var type = opts.typeId ? S.jobType(opts.typeId)
      : U.weighted(types, function (t) {
        var w = terr.mix[t.sector] || 1;
        var fielded = t.caps.every(function (c) { return J.capFielded(state, c); });
        return fielded ? w : w * 0.35;
      });
    if (!type) return null;

    var priorityKey = opts.priority || U.weighted(Object.keys(C.PRIORITIES), function (k) {
      return C.PRIORITIES[k].weight;
    });
    var prio = C.PRIORITIES[priorityKey];

    var pos = opts.pos || pointIn(terr);
    var contract = opts.contractId ? J.contractById(state, opts.contractId) : null;

    // Reputation is priced in: happy clients pay better, unhappy ones haggle.
    var csatMult = 0.75 + (state.ops.csat / 100) * 0.45;
    var value = type.value * prio.pay * terr.demand * csatMult * U.rand(0.88, 1.14)
      * (contract ? contract.mult : 1) * (opts.valueMult || 1);

    var slaMinutes = prio.sla * (contract ? contract.sla : 1) * U.rand(0.9, 1.15);

    var job = {
      id: U.uid('j'),
      typeId: type.id,
      label: type.label,
      sector: type.sector,
      client: contract ? contract.client : U.pick(C.CLIENTS),
      contractId: contract ? contract.id : null,
      territory: terr.id,
      x: Math.round(pos.x), y: Math.round(pos.y),
      priority: priorityKey,
      value: Math.round(value),
      duration: Math.round(type.dur * U.rand(0.85, 1.2)),
      caps: type.caps.slice(),
      skill: type.skill,
      risk: type.risk,
      status: 'pending',
      createdAt: state.time.minutes,
      deadline: state.time.minutes + Math.round(slaMinutes),
      unitId: null,
      startedAt: null,
      progress: 0,
      complication: null
    };
    state.jobs.push(job);
    return job;
  };

  /**
   * Expected new calls per in-game day. The open market only ever offers a
   * little more than the fleet can absorb — contracted volume lands on top of
   * that, which is exactly what makes over-signing dangerous.
   */
  J.demandPerDay = function (state) {
    var market = 0;
    state.territories.forEach(function (id) {
      var t = S.territory(id);
      if (t) market += 2.6 * t.demand;
    });
    market *= 0.7 + (state.ops.csat / 100) * 0.75;

    var ceiling = state.fleet.length * 2.4 + 1.6;
    var flow = Math.min(market, ceiling);
    state.contracts.forEach(function (c) { if (c.active) flow += c.volume; });
    return flow;
  };

  /** Rough daily job capacity of the fleet, shown next to demand in the UI. */
  J.capacityPerDay = function (state) {
    return state.fleet.reduce(function (total, unit) {
      if (!unit.crew.length) return total;
      return total + 2.4 * U.clamp(unit.condition / 100 + 0.15, 0.4, 1.15);
    }, 0);
  };

  /* ── Dispatch ──────────────────────────────────────────────────────────── */

  /** Waypoint route: leg out along an arterial, then in to the site. */
  J.route = function (from, to) {
    var midX = Math.round((from.x + to.x) / 2 / 80) * 80;
    var pts = [{ x: from.x, y: from.y }];
    if (Math.abs(to.x - from.x) > 40 && Math.abs(to.y - from.y) > 40) {
      pts.push({ x: midX, y: from.y });
      pts.push({ x: midX, y: to.y });
    }
    pts.push({ x: to.x, y: to.y });
    return pts;
  };

  J.routeLength = function (pts) {
    var total = 0;
    for (var i = 1; i < pts.length; i++) total += U.dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    return total;
  };

  /** Distance in map units → travel minutes for this unit. */
  J.travelMinutes = function (state, unit, distance) {
    var speed = S.unitSpeed(state, unit) * C.TIME.SPEED_SCALE;   // map units per hour
    return (distance / Math.max(8, speed)) * 60;
  };

  /**
   * Score every unit against a job. Returns a ranked array of evaluations,
   * each explaining exactly why the unit is or is not a good call.
   */
  J.evaluate = function (state, job) {
    return state.fleet.map(function (unit) {
      var caps = S.unitCaps(state, unit);
      var missing = job.caps.filter(function (c) { return caps.indexOf(c) === -1; });
      var crew = S.crewOf(state, unit);
      var skill = S.crewSkill(state, unit);
      var route = J.route(unit, job);
      var distance = J.routeLength(route);
      var eta = J.travelMinutes(state, unit, distance);
      var spec = S.vehicle(unit.vehicle);
      var fuelNeeded = distance * spec.burn;

      var blockers = [];
      if (missing.length) blockers.push('Missing ' + missing.map(capLabel).join(', '));
      if (!crew.length) blockers.push('No crew assigned');
      if (DISPATCHABLE.indexOf(unit.status) === -1) blockers.push(statusLabel(unit.status));
      if (fuelNeeded > unit.fuel) blockers.push('Not enough fuel');
      if (unit.condition <= 12) blockers.push('Condition critical');

      var skillMargin = skill - job.skill;
      var slack = job.deadline - state.time.minutes - eta - job.duration;

      // Weighted preference: arrive fast, arrive competent, arrive fresh.
      var score = 100;
      score -= eta * 0.16;
      score += U.clamp(skillMargin, -45, 35) * 0.62;
      score -= (avgFatigue(crew)) * 0.28;
      score -= (100 - unit.condition) * 0.12;
      score -= Math.max(0, fuelNeeded / Math.max(1, unit.fuel) * 22 - 6);
      if (slack < 0) score -= 28;
      if (skillMargin < 0) score -= 18;
      var overtime = unit.status === 'offshift';
      if (overtime) score -= 9;

      return {
        unit: unit,
        eta: eta,
        distance: distance,
        skill: skill,
        skillMargin: skillMargin,
        fuelNeeded: fuelNeeded,
        missing: missing,
        blockers: blockers,
        eligible: blockers.length === 0,
        slack: slack,
        onTime: slack >= 0,
        overtime: overtime,
        score: Math.round(score)
      };
    }).sort(function (a, b) {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.score - a.score;
    });
  };

  function avgFatigue(crew) {
    if (!crew.length) return 100;
    return crew.reduce(function (t, p) { return t + p.fatigue; }, 0) / crew.length;
  }

  function capLabel(id) { return (C.CAPABILITIES[id] || { label: id }).label; }
  J.capLabel = capLabel;

  function statusLabel(status) {
    return { idle: 'Available', enroute: 'En route', onsite: 'On site', returning: 'Returning',
      offshift: 'Off shift', shop: 'In workshop' }[status] || status;
  }
  J.statusLabel = statusLabel;

  /** Commit a unit to a job. */
  J.dispatch = function (state, jobId, unitId) {
    var job = S.jobById(state, jobId);
    var unit = S.unitById(state, unitId);
    if (!job || !unit) return { ok: false, reason: 'Unknown job or unit' };
    if (job.status !== 'pending') return { ok: false, reason: 'Call already dispatched' };

    var evals = J.evaluate(state, job);
    var ev = evals.filter(function (e) { return e.unit.id === unitId; })[0];
    if (!ev || !ev.eligible) {
      return { ok: false, reason: ev ? ev.blockers[0] : 'Unit unavailable' };
    }

    unit.status = 'enroute';
    unit.jobId = job.id;
    unit.path = J.route(unit, job);
    unit.pathIndex = 1;
    unit.progress = 0;

    job.status = 'assigned';
    job.unitId = unit.id;
    job.eta = ev.eta;
    job.dispatchedAt = state.time.minutes;
    return { ok: true, eval: ev };
  };

  /** Best-effort automatic assignment, used by the auto-dispatch toggle. */
  J.autoDispatch = function (state) {
    var assigned = [];
    var pending = state.jobs.filter(function (j) { return j.status === 'pending'; })
      .sort(function (a, b) {
        var pa = C.PRIORITIES[a.priority].pay, pb = C.PRIORITIES[b.priority].pay;
        if (pa !== pb) return pb - pa;
        return a.deadline - b.deadline;
      });
    for (var i = 0; i < pending.length; i++) {
      var evals = J.evaluate(state, pending[i]);
      var best = evals.filter(function (e) { return e.eligible && e.onTime; })[0]
        || evals.filter(function (e) { return e.eligible; })[0];
      if (best) {
        var res = J.dispatch(state, pending[i].id, best.unit.id);
        if (res.ok) assigned.push({ job: pending[i], unit: best.unit });
      }
    }
    return assigned;
  };

  /** Cancel an in-flight assignment and send the unit home. */
  J.recall = function (state, unitId) {
    var unit = S.unitById(state, unitId);
    if (!unit) return { ok: false, reason: 'Unknown unit' };
    var job = unit.jobId ? S.jobById(state, unit.jobId) : null;
    if (job && (job.status === 'assigned' || job.status === 'active')) {
      job.status = 'pending';
      job.unitId = null;
      job.progress = 0;
      // Walking away from work in progress annoys the client.
      if (unit.status === 'onsite') state.ops.csat = U.clamp(state.ops.csat - 1.4, 0, 100);
    }
    unit.jobId = null;
    unit.progress = 0;
    unit.path = J.route(unit, C.HQ);
    unit.pathIndex = 1;
    unit.status = 'returning';
    return { ok: true, job: job };
  };

  /* ── Resolution ────────────────────────────────────────────────────────── */

  /** Quality of workmanship, 0..1.4 — drives payout and reputation. */
  J.quality = function (state, unit, job) {
    var skill = S.crewSkill(state, unit);
    var margin = (skill - job.skill) / 60;
    var toolBonus = S.toolsOf(state, unit).reduce(function (t, tool) {
      return t + (S.tool(tool.type).quality || 0) * (job.caps.indexOf(tool.type) !== -1 ? 1.6 : 0.35);
    }, 0);
    var conditionPenalty = (100 - unit.condition) / 100 * 0.14;
    var q = 0.82 + U.clamp(margin, -0.55, 0.45) + toolBonus - conditionPenalty;
    return U.clamp(q, 0.35, 1.4);
  };

  /** Chance the job goes wrong outright. */
  J.failureChance = function (state, unit, job) {
    var margin = S.crewSkill(state, unit) - job.skill;
    var base = job.risk * (margin >= 0 ? U.lerp(1, 0.3, U.clamp(margin / 40, 0, 1))
      : U.lerp(1, 2.6, U.clamp(-margin / 35, 0, 1)));
    base *= 1 + (100 - unit.condition) / 100 * 0.5;
    base *= 1 + avgFatigue(S.crewOf(state, unit)) / 100 * 0.4;
    return U.clamp(base, 0.005, 0.62);
  };

  /**
   * Finish a job that has reached full progress. Applies payout, reputation
   * change, crew experience and contract accounting.
   */
  J.complete = function (state, unit, job) {
    var prio = C.PRIORITIES[job.priority];
    var late = state.time.minutes > job.deadline;
    var quality = J.quality(state, unit, job);
    var failed = U.chance(J.failureChance(state, unit, job));

    var result = {
      job: job, unit: unit, quality: quality, late: late, failed: failed,
      payout: 0, csatDelta: 0
    };

    if (failed) {
      job.status = 'failed';
      state.stats.jobsFailed += 1;
      state.ops.streak = 0;
      // Remediation costs come out of your pocket.
      var remediation = Math.round(job.value * U.rand(0.12, 0.3));
      E.spend(state, remediation, 'penalties');
      result.remediation = remediation;
      result.csatDelta = -C.CSAT.FAILED_LOSS * prio.csat;
      state.ops.csat = U.clamp(state.ops.csat + result.csatDelta, 0, 100);
    } else {
      var payout = job.value * U.clamp(quality, 0.5, 1.25);
      if (late) payout *= 0.72;
      payout = Math.round(payout);
      E.earn(state, payout, job.contractId ? 'retainers' : 'jobs');
      job.status = 'done';
      state.stats.jobsDone += 1;
      state.ops.streak += 1;

      var delta = late ? -C.CSAT.LATE_LOSS * prio.csat
        : (C.CSAT.ON_TIME_GAIN * prio.csat + (quality - 1) * C.CSAT.QUALITY_WEIGHT);
      state.ops.csat = U.clamp(state.ops.csat + delta, 0, 100);
      result.payout = payout;
      result.csatDelta = delta;
    }

    if (late && job.contractId) {
      var contract = J.contractById(state, job.contractId);
      if (contract) {
        contract.breaches += 1;
        E.spend(state, contract.penalty, 'penalties');
        result.penalty = contract.penalty;
      }
    }

    // Crew learn on the job; the harder the call, the more they take from it.
    var crew = S.crewOf(state, unit);
    crew.forEach(function (p) {
      var headroom = U.clamp((job.skill + 12 - p.skill) / 40, 0, 1);
      p.skill = U.clamp(p.skill + headroom * U.rand(0.12, 0.42), 0, 100);
      p.jobsDone += 1;
      p.morale = U.clamp(p.morale + (failed ? -3.5 : 1.1), 0, 100);
    });

    unit.jobsDone += 1;
    unit.jobId = null;
    unit.progress = 0;
    unit.path = J.route(unit, C.HQ);
    unit.pathIndex = 1;
    unit.status = 'returning';
    return result;
  };

  /** A pending call whose SLA window has closed is lost to a competitor. */
  J.expire = function (state, job) {
    job.status = 'expired';
    state.stats.jobsExpired += 1;
    var contract = job.contractId ? J.contractById(state, job.contractId) : null;

    // A call you never accepted simply goes to a competitor — that costs you
    // the revenue, not your name. A contracted call you dropped is a breach.
    var delta = -C.CSAT.EXPIRED_LOSS * C.PRIORITIES[job.priority].csat * (contract ? 1 : 0.2);
    state.ops.csat = U.clamp(state.ops.csat + delta, 0, 100);
    var fee = 0;
    if (contract) {
      state.ops.streak = 0;
      contract.breaches += 1;
      fee = Math.round(contract.penalty * 0.5);
      E.spend(state, fee, 'penalties');
    }
    return { delta: delta, fee: fee, breach: !!contract };
  };

  /* ── Contracts ─────────────────────────────────────────────────────────── */

  J.contractById = function (state, id) {
    for (var i = 0; i < state.contracts.length; i++) if (state.contracts[i].id === id) return state.contracts[i];
    return null;
  };

  J.makeContractOffer = function (state, tierId) {
    var tiers = C.CONTRACT_TIERS.filter(function (t) { return S.isUnlocked(state, t.unlock); });
    if (!tiers.length) return null;
    var tier = tierId ? C.CONTRACT_TIERS.filter(function (t) { return t.id === tierId; })[0] : U.pick(tiers);
    if (!tier || !S.isUnlocked(state, tier.unlock)) return null;
    if (state.ops.csat < tier.minCsat) return null;

    var sectors = S.activeSectors(state);
    var sector = U.pick(sectors);
    var terrId = U.pick(state.territories);
    var scale = 0.85 + (state.ops.csat / 100) * 0.45;

    return {
      id: U.uid('c'),
      tier: tier.id,
      label: tier.label,
      client: U.pick(C.CLIENTS),
      sector: sector,
      territory: terrId,
      term: tier.term,
      retainer: Math.round(U.rand(tier.retainer[0], tier.retainer[1]) * scale),
      volume: U.round(U.rand(tier.volume[0], tier.volume[1]), 2),
      sla: tier.sla,
      mult: U.round(U.rand(tier.mult[0], tier.mult[1]), 3),
      penalty: tier.penalty,
      minCsat: tier.minCsat,
      offeredOn: state.time.day,
      expiresOn: state.time.day + U.randInt(3, 6),
      active: false,
      breaches: 0,
      earned: 0,
      startedOn: null
    };
  };

  J.signContract = function (state, offerId) {
    var offer = state.offers.contracts.filter(function (c) { return c.id === offerId; })[0];
    if (!offer) return { ok: false, reason: 'Offer withdrawn' };
    if (state.ops.csat < offer.minCsat) return { ok: false, reason: 'CSAT below client threshold' };
    offer.active = true;
    offer.startedOn = state.time.day;
    offer.endsOn = state.time.day + offer.term;
    state.contracts.push(offer);
    state.offers.contracts = state.offers.contracts.filter(function (c) { return c.id !== offerId; });
    return { ok: true, contract: offer };
  };

  J.cancelContract = function (state, contractId) {
    var contract = J.contractById(state, contractId);
    if (!contract) return { ok: false, reason: 'Unknown contract' };
    var fee = Math.round(contract.penalty * 2.2);
    E.spend(state, fee, 'penalties');
    state.ops.csat = U.clamp(state.ops.csat - 4, 0, 100);
    state.contracts = state.contracts.filter(function (c) { return c.id !== contractId; });
    return { ok: true, fee: fee };
  };

  FST.Jobs = J;
})(window.FST = window.FST || {});
