/**
 * MERIDIAN FIELD OPS — Field unit simulation: movement, fuel, wear, on-site
 * work progress, crew fatigue and shift handling.
 */
(function (FST) {
  'use strict';

  var C = FST.Config, U = FST.Utils, S = FST.State, E = FST.Economy, J = FST.Jobs;
  var Units = {};

  var WEAR_PER_UNIT = 0.03;       // condition points lost per map unit x vehicle wear
  var FATIGUE_DRIVE = 0.030;      // per minute
  var FATIGUE_WORK = 0.075;
  var FATIGUE_REST = 0.115;
  var AUTO_REFUEL_AT = 0.45;      // top up on return below this share of tank

  Units.onShift = function (state) {
    var t = state.time.minutes % 1440;
    return t >= C.TIME.SHIFT_START && t < C.TIME.SHIFT_END;
  };

  /**
   * Advance one unit by `dt` in-game minutes.
   * Returns an array of events for the engine to broadcast.
   */
  Units.tick = function (state, unit, dt) {
    var events = [];
    var spec = S.vehicle(unit.vehicle);
    var crew = S.crewOf(state, unit);
    var onShift = Units.onShift(state);

    // Overtime is billed the moment crews work outside the roster window.
    if (!onShift && crew.length && (unit.status === 'enroute' || unit.status === 'onsite')) {
      var otRate = (C.ECONOMY.OVERTIME_MULTIPLIER - 1) / (C.TIME.SHIFT_END - C.TIME.SHIFT_START);
      var otCost = crew.reduce(function (t, p) { return t + p.wage * otRate; }, 0) * dt;
      E.spend(state, otCost, 'payroll');
    }

    switch (unit.status) {
      case 'shop':
        // Workshop days are consumed by the daily rollover, nothing to do here.
        break;

      case 'enroute':
        events = events.concat(drive(state, unit, spec, dt, crew));
        break;

      case 'returning':
        events = events.concat(drive(state, unit, spec, dt, crew));
        break;

      case 'onsite':
        events = events.concat(work(state, unit, dt, crew));
        break;

      case 'idle':
      case 'offshift':
        crew.forEach(function (p) {
          p.fatigue = U.clamp(p.fatigue - FATIGUE_REST * dt * (onShift ? 0.35 : 1), 0, 100);
          p.morale = U.clamp(p.morale + 0.004 * dt, 0, 100);
        });
        unit.status = onShift ? 'idle' : 'offshift';
        break;
    }

    return events;
  };

  function drive(state, unit, spec, dt, crew) {
    var events = [];
    var speed = S.unitSpeed(state, unit) * C.TIME.SPEED_SCALE / 60;  // map units per minute
    var budget = speed * dt;

    while (budget > 0.0001 && unit.pathIndex < unit.path.length) {
      var target = unit.path[unit.pathIndex];
      var d = U.dist(unit.x, unit.y, target.x, target.y);
      if (d <= budget) {
        travelled(state, unit, spec, d);
        unit.x = target.x; unit.y = target.y;
        unit.pathIndex += 1;
        budget -= d;
      } else {
        var t = budget / d;
        unit.x += (target.x - unit.x) * t;
        unit.y += (target.y - unit.y) * t;
        travelled(state, unit, spec, budget);
        budget = 0;
      }
    }

    crew.forEach(function (p) { p.fatigue = U.clamp(p.fatigue + FATIGUE_DRIVE * dt, 0, 100); });

    // Out of fuel mid-route: emergency delivery at a hefty premium.
    if (unit.fuel <= 0.2 && unit.pathIndex < unit.path.length) {
      var litres = spec.fuelCap * 0.5;
      var cost = Math.round(litres * E.fuelPrice(state) * 2.1);
      E.spend(state, cost, 'fuel');
      unit.fuel = litres;
      events.push({ kind: 'danger', msg: unit.callsign + ' ran dry — emergency fuel delivery ' + U.money(cost) });
    }

    if (unit.pathIndex >= unit.path.length) {
      if (unit.status === 'enroute') {
        var job = unit.jobId ? S.jobById(state, unit.jobId) : null;
        if (job && (job.status === 'assigned' || job.status === 'pending')) {
          job.status = 'active';
          job.startedAt = state.time.minutes;
          unit.status = 'onsite';
          events.push({ kind: 'info', msg: unit.callsign + ' on site — ' + job.label + ' for ' + job.client });
        } else {
          unit.jobId = null;
          unit.path = J.route(unit, C.HQ);
          unit.pathIndex = 1;
          unit.status = 'returning';
        }
      } else {
        unit.status = Units.onShift(state) ? 'idle' : 'offshift';
        unit.x = C.HQ.x; unit.y = C.HQ.y;
        // Top the tank up at the depot pump so crews are not stranded later.
        if (unit.fuel < spec.fuelCap * AUTO_REFUEL_AT) {
          var need = spec.fuelCap - unit.fuel;
          var fill = Math.round(need * E.fuelPrice(state));
          if (E.canAfford(state, fill)) {
            E.spend(state, fill, 'fuel');
            unit.fuel = spec.fuelCap;
            state.stats.fuelUsed += need;
          }
        }
      }
    }
    return events;
  }

  function travelled(state, unit, spec, distance) {
    if (distance <= 0) return;
    unit.odometer += distance;
    state.stats.distance += distance;
    var burn = distance * spec.burn;
    unit.fuel = Math.max(0, unit.fuel - burn);
    state.stats.fuelUsed += burn;
    var wearMult = 1 + S.modifier(state, 'wear_reduction') * -1;
    unit.condition = U.clamp(unit.condition - distance * spec.wear * WEAR_PER_UNIT * wearMult, 0, 100);
  }

  function work(state, unit, dt, crew) {
    var events = [];
    var job = unit.jobId ? S.jobById(state, unit.jobId) : null;
    if (!job || job.status !== 'active') {
      unit.status = 'returning';
      unit.path = J.route(unit, C.HQ);
      unit.pathIndex = 1;
      return events;
    }

    var efficiency = Units.efficiency(state, unit, job);
    unit.progress += dt * efficiency;
    job.progress = U.clamp(unit.progress / job.duration, 0, 1);

    crew.forEach(function (p) { p.fatigue = U.clamp(p.fatigue + FATIGUE_WORK * dt, 0, 100); });
    unit.condition = U.clamp(unit.condition - dt * 0.004, 0, 100);

    // Mid-job complications: a scope surprise that costs time and parts.
    if (!job.complication && U.chance(job.risk * dt * 0.0016)) {
      var extra = Math.round(job.duration * U.rand(0.15, 0.4));
      var parts = Math.round(job.value * U.rand(0.04, 0.11));
      job.duration += extra;
      job.complication = { extra: extra, parts: parts };
      E.spend(state, parts, 'maintenance');
      events.push({
        kind: 'warn',
        msg: unit.callsign + ': scope change at ' + job.client + ' (+' + U.duration(extra) + ', ' + U.money(parts) + ' parts)'
      });
    }

    if (unit.progress >= job.duration) {
      var result = J.complete(state, unit, job);
      events.push({ kind: 'job', result: result });
    }
    return events;
  }

  /** On-site work rate multiplier: crew size, competence and freshness. */
  Units.efficiency = function (state, unit, job) {
    var crew = S.crewOf(state, unit);
    if (!crew.length) return 0;
    var skill = S.crewSkill(state, unit);
    var margin = U.clamp((skill - job.skill) / 70, -0.45, 0.55);
    var hands = 0.62 + Math.min(crew.length, 4) * 0.17;
    var fatigue = crew.reduce(function (t, p) { return t + p.fatigue; }, 0) / crew.length;
    return U.clamp(hands + margin - fatigue / 100 * 0.28, 0.22, 2.1);
  };

  /** Remaining minutes of on-site work at the current rate. */
  Units.etaComplete = function (state, unit) {
    var job = unit.jobId ? S.jobById(state, unit.jobId) : null;
    if (!job) return 0;
    if (unit.status === 'onsite') {
      var eff = Units.efficiency(state, unit, job);
      return (job.duration - unit.progress) / Math.max(0.05, eff);
    }
    var remaining = 0, pts = [{ x: unit.x, y: unit.y }].concat(unit.path.slice(unit.pathIndex));
    remaining = J.routeLength(pts);
    return J.travelMinutes(state, unit, remaining) + job.duration;
  };

  /** Daily rollover: workshop time, training progress, morale drift. */
  Units.dailyUpdate = function (state) {
    var events = [];

    state.fleet.forEach(function (unit) {
      // Morning depot fuelling for anything parked up.
      var spec = S.vehicle(unit.vehicle);
      if ((unit.status === 'idle' || unit.status === 'offshift') && unit.fuel < spec.fuelCap * 0.6) {
        var need = spec.fuelCap - unit.fuel;
        var cost = Math.round(need * E.fuelPrice(state));
        if (E.canAfford(state, cost)) {
          E.spend(state, cost, 'fuel');
          unit.fuel = spec.fuelCap;
          state.stats.fuelUsed += need;
        }
      }
      if (unit.status === 'shop') {
        unit.shopDays -= 1;
        if (unit.shopDays <= 0) {
          unit.status = 'idle';
          events.push({ kind: 'ok', msg: unit.callsign + ' released from the workshop at 100% condition' });
        }
      }
      if (unit.condition < 35 && unit.status !== 'shop') {
        events.push({ kind: 'warn', msg: unit.callsign + ' condition critical (' + Math.round(unit.condition) + '%) — service it' });
      }
    });

    state.staff.forEach(function (p) {
      if (p.training) {
        p.training.remaining -= 1;
        if (p.training.remaining <= 0) {
          p.skill = U.clamp(p.skill + p.training.gain, 0, 100);
          p.morale = U.clamp(p.morale + 6, 0, 100);
          // A better technician expects a better wage.
          p.wage = Math.round(p.wage * (1 + p.training.gain / 190));
          events.push({ kind: 'ok', msg: p.name + ' completed training — skill now ' + Math.round(p.skill) });
          p.training = null;
        }
      }
      if (p.fatigue > 78) {
        p.morale = U.clamp(p.morale - 2.2, 0, 100);
      }
      if (!p.unitId && !p.training) {
        p.morale = U.clamp(p.morale - 0.8, 0, 100);   // benched crew get restless
      }
      if (p.morale < 25 && U.chance(0.12)) {
        events.push({ kind: 'danger', msg: p.name + ' is threatening to resign (morale ' + Math.round(p.morale) + ')' });
      }
    });

    return events;
  };

  FST.Units = Units;
})(window.FST = window.FST || {});
