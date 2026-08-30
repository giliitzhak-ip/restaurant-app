/**
 * MERIDIAN FIELD OPS — Simulation engine. Owns the clock, drives per-tick
 * updates, and raises the events the UI layer subscribes to.
 */
(function (FST) {
  'use strict';

  var C = FST.Config, U = FST.Utils, S = FST.State,
      E = FST.Economy, J = FST.Jobs, Units = FST.Units;

  var Engine = U.emitter();
  var state = null;
  var rafId = null;
  var accumulator = 0;
  var lastFrame = 0;
  var spawnCredit = 0;
  var running = false;

  Engine.state = function () { return state; };

  Engine.init = function (newState) {
    state = newState;
    accumulator = 0;
    spawnCredit = 0;
    state.netWorth = S.netWorth(state);
    Engine.emit('state', state);
    return state;
  };

  Engine.start = function () {
    if (running) return;
    running = true;
    lastFrame = performance.now();
    rafId = requestAnimationFrame(frame);
  };

  Engine.stop = function () {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  };

  Engine.setSpeed = function (speed) {
    if (!state) return;
    if (speed > 0) state.time.lastSpeed = speed;
    state.time.speed = speed;
    Engine.emit('speed', speed);
  };

  Engine.togglePause = function () {
    if (!state) return;
    Engine.setSpeed(state.time.speed === 0 ? (state.time.lastSpeed || 1) : 0);
  };

  /** Stop the clock and surface a decision the player must answer. */
  Engine.prompt = function (evt) {
    state.pendingEvent = evt;
    Engine.setSpeed(0);
    Engine.emit('decision', evt);
  };

  function frame(now) {
    if (!running) return;
    var elapsed = Math.min(now - lastFrame, 250);
    lastFrame = now;

    var speed = state ? state.time.speed : 0;
    if (speed > 0) {
      accumulator += elapsed * speed;
      var steps = 0;
      while (accumulator >= C.TIME.TICK_MS && steps < 60) {
        accumulator -= C.TIME.TICK_MS;
        steps += 1;
        step(C.TIME.MINUTES_PER_TICK);
      }
      if (steps >= 60) accumulator = 0;   // never let the sim spiral
    }

    Engine.emit('frame', elapsed);
    rafId = requestAnimationFrame(frame);
  }

  /** One simulation step of `dt` in-game minutes. */
  function step(dt) {
    var prevDay = state.time.day;
    state.time.minutes += dt;
    state.time.day = Math.floor(state.time.minutes / 1440);

    // Units
    for (var i = 0; i < state.fleet.length; i++) {
      var events = Units.tick(state, state.fleet[i], dt);
      for (var k = 0; k < events.length; k++) handleUnitEvent(events[k]);
    }

    expireJobs();
    generateJobs(dt);

    if (state.ops.autoDispatch) {
      var assigned = J.autoDispatch(state);
      assigned.forEach(function (a) {
        Engine.emit('log', { kind: 'info', msg: 'Auto-dispatch: ' + a.unit.callsign + ' → ' + a.job.label });
      });
    }

    if (state.time.day !== prevDay) rollover(prevDay);
    Engine.emit('tick', state);
  }

  function handleUnitEvent(evt) {
    if (evt.kind === 'job') {
      var r = evt.result;
      if (r.failed) {
        Engine.emit('toast', {
          kind: 'danger',
          title: 'Job failed',
          msg: r.unit.callsign + ' could not close ' + r.job.label + ' for ' + r.job.client +
            '. Remediation ' + U.money(r.remediation) + ', CSAT ' + r.csatDelta.toFixed(1) + '.'
        });
      } else {
        Engine.emit('toast', {
          kind: r.late ? 'warn' : 'ok',
          title: r.late ? 'Completed late' : 'Job complete',
          msg: r.unit.callsign + ' closed ' + r.job.label + ' — ' + U.money(r.payout) +
            ' at ' + Math.round(r.quality * 100) + '% quality.'
        });
      }
      Engine.emit('job:resolved', r);
      Engine.emit('log', {
        kind: r.failed ? 'danger' : (r.late ? 'warn' : 'ok'),
        msg: (r.failed ? 'FAILED · ' : 'CLOSED · ') + r.job.label + ' (' + r.job.client + ') · ' +
          (r.failed ? '−' + U.money(r.remediation) : U.money(r.payout))
      });
    } else {
      Engine.emit('log', evt);
      if (evt.kind === 'danger') Engine.emit('toast', { kind: 'danger', title: 'Alert', msg: evt.msg });
    }
  }

  /* ── Call generation ───────────────────────────────────────────────────── */

  function generateJobs(dt) {
    var perDay = J.demandPerDay(state);
    var minuteOfDay = state.time.minutes % 1440;
    var daytime = (minuteOfDay >= C.TIME.SHIFT_START - 60 && minuteOfDay < C.TIME.SHIFT_END) ? 1.45 : 0.3;
    spawnCredit += (perDay / 1440) * dt * daytime;

    var openCap = 4 + state.fleet.length * 2 + state.territories.length;
    while (spawnCredit >= 1) {
      spawnCredit -= 1;
      var open = state.jobs.filter(function (j) { return j.status === 'pending'; }).length;
      if (open >= openCap) break;
      var job = J.spawn(state, contractOpts());
      if (!job) break;
      announce(job);
    }
  }

  /** Some calls arrive through a signed contract rather than off the street. */
  function contractOpts() {
    var active = state.contracts.filter(function (c) { return c.active; });
    if (!active.length) return {};
    var totalVolume = active.reduce(function (t, c) { return t + c.volume; }, 0);
    var share = totalVolume / Math.max(0.1, J.demandPerDay(state));
    if (!U.chance(U.clamp(share, 0, 0.85))) return {};
    var contract = U.weighted(active, function (c) { return c.volume; });
    return { contractId: contract.id, territory: contract.territory };
  }

  function announce(job) {
    var prio = C.PRIORITIES[job.priority];
    Engine.emit('job:new', job);
    if (job.priority === 'emergency') {
      Engine.emit('toast', {
        kind: 'danger',
        title: 'EMERGENCY CALL',
        msg: job.label + ' — ' + job.client + ' · ' + U.money(job.value) +
          ' · respond within ' + U.duration(job.deadline - state.time.minutes)
      });
      if (state.time.speed > 2) Engine.setSpeed(1);
    } else if (job.priority === 'urgent') {
      Engine.emit('toast', { kind: 'warn', title: 'Urgent request', msg: job.label + ' — ' + job.client + ' · ' + U.money(job.value) });
    }
    Engine.emit('log', {
      kind: job.priority === 'emergency' ? 'danger' : 'info',
      msg: 'NEW ' + prio.label + ' · ' + job.label + ' · ' + job.client + ' · ' + U.money(job.value)
    });
  }

  function expireJobs() {
    for (var i = 0; i < state.jobs.length; i++) {
      var job = state.jobs[i];
      if (job.status === 'pending' && state.time.minutes > job.deadline) {
        var res = J.expire(state, job);
        Engine.emit('log', {
          kind: res.breach ? 'danger' : 'warn',
          msg: (res.breach ? 'SLA BREACH · ' : 'LOST · ') + job.label + ' (' + job.client + ') · ' +
            U.moneyShort(job.value) + ' forgone · CSAT ' + res.delta.toFixed(1)
        });
        if (res.breach || job.priority === 'emergency') {
          Engine.emit('toast', {
            kind: 'danger', title: res.breach ? 'SLA breach' : 'Emergency missed',
            msg: job.client + ' went to a competitor' + (res.fee ? ' · ' + U.money(res.fee) + ' penalty' : '') + '.'
          });
        }
      }
    }
    // Keep the job list bounded; the ledger already holds the history.
    var closed = state.jobs.filter(function (j) {
      return j.status !== 'pending' && j.status !== 'assigned' && j.status !== 'active';
    });
    if (closed.length > 60) {
      var keep = closed.slice(-40);
      state.jobs = state.jobs.filter(function (j) {
        return (j.status === 'pending' || j.status === 'assigned' || j.status === 'active') || keep.indexOf(j) !== -1;
      });
    }
  }

  /* ── Daily / quarterly rollover ────────────────────────────────────────── */

  function rollover(prevDay) {
    Units.dailyUpdate(state).forEach(function (evt) {
      Engine.emit('log', evt);
      if (evt.kind === 'danger') Engine.emit('toast', { kind: 'danger', title: 'Personnel', msg: evt.msg });
    });

    payRetainers();
    reviewContracts();

    var record = E.settleDay(state);
    state.ops.csat = U.clamp(
      state.ops.csat + (C.CSAT.MEAN - state.ops.csat) * C.CSAT.DAILY_DECAY, 0, 100);
    state.netWorth = S.netWorth(state);

    Engine.emit('log', {
      kind: record.profit >= 0 ? 'ok' : 'warn',
      msg: 'DAY ' + (prevDay + 1) + ' CLOSE · rev ' + U.moneyShort(record.revenue) +
        ' · exp ' + U.moneyShort(record.expense) + ' · net ' + U.moneyShort(record.profit)
    });

    if (state.finance.cash < 0) handleInsolvency();

    if (state.time.day - state.lastCandidateDay >= 2) S.refreshCandidates(state);
    refreshContractOffers();
    checkMilestones();
    maybeRandomEvent();

    var cal = U.calendar(state.time.minutes);
    if (cal.dayOfQuarter === 0 && state.time.day > 0) {
      var tax = E.settleQuarter(state);
      if (tax.due > 0) {
        Engine.emit('toast', {
          kind: tax.borrowed > 0 ? 'warn' : 'info',
          title: 'Quarterly tax settled',
          msg: U.money(tax.paid) + ' paid' + (tax.borrowed > 0 ? ' · ' + U.money(tax.borrowed) + ' drawn on credit' : '')
        });
        Engine.emit('log', { kind: 'warn', msg: 'TAX · ' + U.money(tax.paid) + ' remitted for the quarter' });
      }
      Engine.emit('quarter', cal);
    }

    Engine.emit('day', record);
    if (state.settings.autosave) {
      S.save(state);
      Engine.emit('saved', { auto: true });
    }
  }

  function payRetainers() {
    var total = 0;
    state.contracts.forEach(function (c) {
      if (!c.active) return;
      total += c.retainer;
      c.earned += c.retainer;
    });
    if (total > 0) E.earn(state, total, 'retainers');
  }

  function reviewContracts() {
    var ending = state.contracts.filter(function (c) { return c.active && state.time.day >= c.endsOn; });
    ending.forEach(function (c) {
      state.contracts = state.contracts.filter(function (x) { return x.id !== c.id; });
      Engine.emit('log', { kind: 'info', msg: 'CONTRACT ENDED · ' + c.client + ' · earned ' + U.moneyShort(c.earned) });
      if (c.breaches <= 1 && state.ops.csat >= c.minCsat) {
        var renewal = J.makeContractOffer(state, c.tier);
        if (renewal) {
          renewal.client = c.client;
          renewal.retainer = Math.round(renewal.retainer * 1.12);
          state.offers.contracts.push(renewal);
          Engine.emit('toast', { kind: 'ok', title: 'Renewal offered', msg: c.client + ' wants to extend at ' + U.money(renewal.retainer) + '/day.' });
        }
      }
    });

    // Chronic SLA failure gets you fired.
    state.contracts.filter(function (c) { return c.active && c.breaches >= 5; }).forEach(function (c) {
      state.contracts = state.contracts.filter(function (x) { return x.id !== c.id; });
      state.ops.csat = U.clamp(state.ops.csat - 6, 0, 100);
      Engine.emit('toast', { kind: 'danger', title: 'Contract terminated', msg: c.client + ' has ended the agreement over repeated SLA breaches.' });
    });
  }

  function refreshContractOffers() {
    state.offers.contracts = state.offers.contracts.filter(function (c) { return state.time.day <= c.expiresOn; });
    var cadence = state.time.day - state.lastContractDay;
    var wantOffer = cadence >= U.randInt(3, 6) && state.offers.contracts.length < 4;
    if (wantOffer) {
      var offer = J.makeContractOffer(state);
      if (offer) {
        state.offers.contracts.push(offer);
        state.lastContractDay = state.time.day;
        Engine.emit('toast', { kind: 'info', title: 'Contract offer', msg: offer.client + ' · ' + offer.label + ' · ' + U.money(offer.retainer) + '/day retainer' });
      }
    }
  }

  function handleInsolvency() {
    var shortfall = -state.finance.cash;
    var drawn = E.borrow(state, shortfall);
    if (drawn >= shortfall - 1) {
      Engine.emit('toast', { kind: 'warn', title: 'Credit line drawn', msg: U.money(drawn) + ' automatically drawn to cover the shortfall.' });
    } else {
      Engine.emit('toast', {
        kind: 'danger', title: 'INSOLVENT',
        msg: 'Cash and credit are exhausted. Sell assets or cut costs immediately.'
      });
      Engine.setSpeed(0);
      Engine.emit('insolvent', state);
    }
  }

  /* ── Milestones ────────────────────────────────────────────────────────── */

  function checkMilestones() {
    C.MILESTONES.forEach(function (m) {
      if (state.milestones.indexOf(m.id) !== -1) return;
      var g = m.goal(state);
      if (g.have >= g.need) {
        state.milestones.push(m.id);
        Engine.emit('milestone', m);
        Engine.emit('toast', { kind: 'ok', title: 'Milestone: ' + m.name, msg: m.reward });
        Engine.emit('log', { kind: 'ok', msg: 'MILESTONE · ' + m.name + ' · ' + m.reward });
      }
    });
  }

  /* ── Random events ─────────────────────────────────────────────────────── */

  function maybeRandomEvent() {
    if (state.pendingEvent) return;
    if (state.time.day - state.lastEventDay < 5) return;
    if (!U.chance(0.42)) return;

    var pool = C.EVENTS.filter(function (e) {
      if (state.time.day < e.minDay) return false;
      if (e.needStaff && state.staff.length < 2) return false;
      if (e.needFleet && !state.fleet.length) return false;
      return true;
    });
    if (!pool.length) return;

    var evt = U.weighted(pool, function (e) { return e.weight; });
    state.lastEventDay = state.time.day;
    Engine.prompt(evt);
  }

  /** Apply the option the player chose on a decision event. */
  Engine.resolveEvent = function (optionIndex) {
    var evt = state.pendingEvent;
    if (!evt) return;
    var option = evt.options[optionIndex];
    state.pendingEvent = null;
    if (!option) return;

    if (option.cost && !E.canAfford(state, option.cost)) {
      Engine.emit('toast', { kind: 'danger', title: 'Declined', msg: 'Insufficient cash — the default outcome applies.' });
      option = evt.options[evt.options.length - 1];
    } else if (option.cost) {
      E.spend(state, option.cost, 'overhead');
    }

    var outcome = applyEffect(option.effect);
    Engine.emit('log', { kind: outcome.kind || 'info', msg: 'EVENT · ' + evt.title + ' · ' + outcome.msg });
    Engine.emit('toast', { kind: outcome.kind || 'info', title: evt.title, msg: outcome.msg });
    Engine.emit('event:resolved', { event: evt, option: option, outcome: outcome });
    Engine.setSpeed(state.time.lastSpeed || 1);
  };

  function applyEffect(effect) {
    var i;
    switch (effect) {
      case 'fuel_absorb':
        state.finance.fuelPriceMod = { mult: 1.18, until: state.time.minutes + 14 * 1440 };
        return { msg: 'Fuel is 18% dearer for the next two weeks.', kind: 'warn' };

      case 'fuel_hedge':
        state.finance.fuelPriceMod = { mult: 0.88, until: state.time.minutes + 30 * 1440 };
        return { msg: 'Forward purchase locked in — fuel 12% below market for 30 days.', kind: 'ok' };

      case 'poach_pay':
        state.staff.forEach(function (p) { p.morale = U.clamp(p.morale + 12, 0, 100); });
        return { msg: 'Retention bonus paid. Crew morale is up across the board.', kind: 'ok' };

      case 'poach_lose':
        var best = state.staff.slice().sort(function (a, b) { return b.skill - a.skill; })[0];
        if (best) {
          S.assignCrew(state, best.id, null);
          state.staff = state.staff.filter(function (p) { return p.id !== best.id; });
          state.staff.forEach(function (p) { p.morale = U.clamp(p.morale - 7, 0, 100); });
          return { msg: best.name + ' has left for a competitor.', kind: 'danger' };
        }
        return { msg: 'The approach came to nothing.', kind: 'info' };

      case 'storm_surge':
        for (i = 0; i < 3; i++) {
          var j = J.spawn(state, { priority: 'emergency', valueMult: 1.5 });
          if (j) Engine.emit('job:new', j);
        }
        state.staff.forEach(function (p) { p.fatigue = U.clamp(p.fatigue + 10, 0, 100); });
        return { msg: 'Three emergency calls inbound at 1.5x value. Crews are on overtime.', kind: 'warn' };

      case 'storm_pass':
        state.ops.csat = U.clamp(state.ops.csat - 1.5, 0, 100);
        return { msg: 'Two callers went elsewhere. Minor reputation cost.', kind: 'info' };

      case 'audit_pass':
        state.ops.csat = U.clamp(state.ops.csat + 6, 0, 100);
        return { msg: 'Clean audit. Reputation +6.', kind: 'ok' };

      case 'audit_risk':
        if (U.chance(0.45)) {
          E.spend(state, 28000, 'penalties');
          state.ops.csat = U.clamp(state.ops.csat - 4, 0, 100);
          return { msg: 'Findings issued. ' + U.money(28000) + ' fine and a reputation hit.', kind: 'danger' };
        }
        return { msg: 'The audit passed without findings. Lucky.', kind: 'ok' };

      case 'break_fix':
        var worst = pickWorstUnit();
        if (worst) {
          worst.condition = 100;
          worst.status = 'shop';
          worst.shopDays = 1;
          if (worst.jobId) J.recall(state, worst.id);
          return { msg: worst.callsign + ' is in the workshop for the day, condition restored.', kind: 'info' };
        }
        return { msg: 'No unit required attention.', kind: 'info' };

      case 'break_patch':
        var patched = pickWorstUnit();
        if (patched) {
          patched.condition = U.clamp(patched.condition - 22, 0, 100);
          return { msg: patched.callsign + ' stays in service at ' + Math.round(patched.condition) + '% condition.', kind: 'warn' };
        }
        return { msg: 'No unit required attention.', kind: 'info' };

      case 'auction_buy':
        var affordable = C.TOOLS.filter(function (t) {
          return S.isUnlocked(state, t.unlock) && E.canAfford(state, t.price * 0.55);
        });
        if (!affordable.length) return { msg: 'Nothing in the lot was within reach.', kind: 'warn' };
        var pickTool = U.pick(affordable);
        E.spend(state, Math.round(pickTool.price * 0.55), 'capex');
        var tool = S.makeTool(pickTool.id);
        state.tools.push(tool);
        return { msg: 'Acquired a ' + pickTool.name + ' for ' + U.money(pickTool.price * 0.55) + '.', kind: 'ok' };

      case 'ref_bid':
        var premium = J.makeContractOffer(state, 'regional') || J.makeContractOffer(state);
        if (premium) {
          premium.retainer = Math.round(premium.retainer * 1.3);
          premium.mult = U.round(premium.mult * 1.08, 3);
          state.offers.contracts.push(premium);
          return { msg: 'Premium proposal accepted for review — see the Contracts board.', kind: 'ok' };
        }
        return { msg: 'The opportunity fell through.', kind: 'warn' };

      case 'ref_std':
        var std = J.makeContractOffer(state, 'local');
        if (std) {
          state.offers.contracts.push(std);
          return { msg: 'A standard agreement is on the Contracts board.', kind: 'info' };
        }
        return { msg: 'No agreement materialised.', kind: 'info' };

      case 'ins_full':
        S.setModifier(state, 'wear_reduction', 0.25, 30);
        return { msg: 'Comprehensive cover in force. Vehicle wear reduced 25% for 30 days.', kind: 'ok' };

      case 'ins_min':
        S.setModifier(state, 'wear_reduction', -0.15, 30);
        return { msg: 'Premium saved, but wear runs 15% higher for 30 days.', kind: 'warn' };

      default:
        return { msg: 'No action taken.', kind: 'info' };
    }
  }

  function pickWorstUnit() {
    return state.fleet.slice().sort(function (a, b) { return a.condition - b.condition; })[0];
  }

  /** Exposed for tests and the debug console. */
  Engine._step = step;

  FST.Engine = Engine;
})(window.FST = window.FST || {});
