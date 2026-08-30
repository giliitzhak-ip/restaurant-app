/**
 * MERIDIAN FIELD OPS — Money. Ledger posting, daily settlement, quarterly tax,
 * credit line and capital purchases.
 */
(function (FST) {
  'use strict';

  var C = FST.Config, U = FST.Utils, S = FST.State;
  var E = {};

  /** Post revenue to today's ledger and the cash balance. */
  E.earn = function (state, amount, category) {
    if (!(amount > 0)) return 0;
    amount = Math.round(amount);
    state.finance.cash += amount;
    state.finance.today.revenue[category || 'other'] += amount;
    state.stats.revenue += amount;
    // Operating profit is taxed; capital purchases are not deductible here.
    state.finance.taxAccrued += amount * C.ECONOMY.TAX_RATE;
    return amount;
  };

  /** Post an expense. Returns the amount actually spent. */
  E.spend = function (state, amount, category) {
    if (!(amount > 0)) return 0;
    amount = Math.round(amount);
    state.finance.cash -= amount;
    state.finance.today.expense[category || 'overhead'] += amount;
    state.stats.expense += amount;
    if (category !== 'capex') {
      state.finance.taxAccrued = Math.max(0, state.finance.taxAccrued - amount * C.ECONOMY.TAX_RATE);
    }
    return amount;
  };

  /** True when the purchase can be covered by cash on hand. */
  E.canAfford = function (state, amount) {
    return state.finance.cash >= amount;
  };

  E.fuelPrice = function (state) {
    var mod = state.finance.fuelPriceMod;
    var mult = (mod && mod.until > state.time.minutes) ? mod.mult : 1;
    return state.finance.fuelPrice * mult;
  };

  /* ── Credit line ───────────────────────────────────────────────────────── */

  E.borrow = function (state, amount) {
    var limit = S.creditLimit(state);
    var room = limit - state.finance.debt;
    amount = Math.min(amount, room);
    if (amount <= 0) return 0;
    state.finance.debt += amount;
    state.finance.cash += amount;
    return amount;
  };

  E.repay = function (state, amount) {
    amount = Math.min(amount, state.finance.debt, state.finance.cash);
    if (amount <= 0) return 0;
    state.finance.debt -= amount;
    state.finance.cash -= amount;
    return amount;
  };

  /* ── Daily settlement ──────────────────────────────────────────────────── */

  /**
   * Charge every recurring cost for the day that just ended, then roll the
   * ledger into history. Returns a summary used by the notification feed.
   */
  E.settleDay = function (state) {
    var payroll = 0;
    state.staff.forEach(function (p) {
      var wage = p.wage;
      if (p.training) wage *= 1.1;               // paid while in training
      payroll += wage;
    });
    E.spend(state, payroll, 'payroll');

    var maintenance = 0, insurance = 0;
    state.fleet.forEach(function (u) {
      var spec = S.vehicle(u.vehicle);
      maintenance += spec.upkeep * (1 + (100 - u.condition) / 130);
      insurance += C.ECONOMY.INSURANCE_PER_VEHICLE_DAY * (spec.tier * 0.6 + 0.6);
    });
    state.tools.forEach(function (t) { maintenance += S.tool(t.type).upkeep; });
    E.spend(state, maintenance, 'maintenance');
    E.spend(state, insurance, 'insurance');

    var overhead = C.ECONOMY.OVERHEAD_PER_DAY * (1 + state.territories.length * 0.28);
    E.spend(state, overhead, 'overhead');

    if (state.finance.debt > 0) {
      var interest = state.finance.debt * C.ECONOMY.INTEREST_DAILY;
      state.finance.debt += interest;            // capitalised, not a cash cost
      state.finance.today.expense.interest += Math.round(interest);
      state.stats.expense += Math.round(interest);
    }

    // Fuel price performs a slow random walk within its band.
    var drift = U.rand(-0.045, 0.045);
    state.finance.fuelPrice = U.clamp(state.finance.fuelPrice + drift,
      C.ECONOMY.FUEL_PRICE_RANGE[0], C.ECONOMY.FUEL_PRICE_RANGE[1]);

    var led = state.finance.today;
    var revenue = sum(led.revenue), expense = sum(led.expense);
    var record = {
      day: state.time.day,
      revenue: revenue,
      expense: expense,
      profit: revenue - expense,
      cash: Math.round(state.finance.cash),
      netWorth: Math.round(S.netWorth(state)),
      csat: Math.round(state.ops.csat * 10) / 10,
      jobs: state.stats.jobsDone,
      breakdown: led
    };
    state.finance.history.push(record);
    if (state.finance.history.length > 400) state.finance.history.shift();
    state.finance.today = S.blankLedger();

    return record;
  };

  /** Settle the quarterly tax bill. Called on the first day of each quarter. */
  E.settleQuarter = function (state) {
    var due = Math.max(0, Math.round(state.finance.taxAccrued));
    if (due <= 0) { state.finance.taxAccrued = 0; return { due: 0, borrowed: 0 }; }

    var borrowed = 0;
    if (state.finance.cash < due) borrowed = E.borrow(state, due - state.finance.cash);
    var paid = Math.min(due, Math.max(0, state.finance.cash));
    state.finance.cash -= paid;
    state.finance.today.expense.tax += paid;
    state.stats.taxPaid += paid;
    state.stats.expense += paid;
    state.finance.taxAccrued = Math.max(0, due - paid);
    return { due: due, paid: paid, borrowed: borrowed };
  };

  function sum(obj) {
    return Object.keys(obj).reduce(function (t, k) { return t + obj[k]; }, 0);
  }
  E.sum = sum;

  /** Rolling window helper used by the finance panel. */
  E.window = function (state, days) {
    var h = state.finance.history.slice(-days);
    var rev = 0, exp = 0;
    h.forEach(function (d) { rev += d.revenue; exp += d.expense; });
    return { revenue: rev, expense: exp, profit: rev - exp, days: h.length, series: h };
  };

  /* ── Capital purchases ─────────────────────────────────────────────────── */

  E.buyVehicle = function (state, vehicleId) {
    var spec = S.vehicle(vehicleId);
    if (!spec) return { ok: false, reason: 'err.unknownVehicle' };
    if (!S.isUnlocked(state, spec.unlock)) return { ok: false, reason: 'err.locked' };
    if (!E.canAfford(state, spec.price)) return { ok: false, reason: 'err.cash' };

    var used = state.fleet.map(function (u) { return u.callsign; });
    var free = C.CALLSIGNS.filter(function (c) { return used.indexOf(c) === -1; });
    var callsign = free.length ? free[0] : 'UNIT-' + (state.fleet.length + 1);

    E.spend(state, spec.price, 'capex');
    var unit = S.makeUnit(vehicleId, callsign);
    unit.purchasedOn = state.time.day;
    state.fleet.push(unit);
    return { ok: true, unit: unit };
  };

  E.sellVehicle = function (state, unitId) {
    var unit = S.unitById(state, unitId);
    if (!unit) return { ok: false, reason: 'err.unknownUnit' };
    if (unit.status !== 'idle' && unit.status !== 'offshift') return { ok: false, reason: 'err.unitOnJob' };
    var spec = S.vehicle(unit.vehicle);
    var value = Math.round(spec.price * 0.48 * (unit.condition / 100));

    S.crewOf(state, unit).forEach(function (p) { S.assignCrew(state, p.id, null); });
    S.toolsOf(state, unit).forEach(function (t) { t.unitId = null; });
    state.fleet = state.fleet.filter(function (u) { return u.id !== unitId; });
    E.earn(state, value, 'other');
    return { ok: true, value: value };
  };

  E.buyTool = function (state, toolId) {
    var spec = S.tool(toolId);
    if (!spec) return { ok: false, reason: 'err.unknownTool' };
    if (!S.isUnlocked(state, spec.unlock)) return { ok: false, reason: 'err.locked' };
    if (!E.canAfford(state, spec.price)) return { ok: false, reason: 'err.cash' };
    E.spend(state, spec.price, 'capex');
    var tool = S.makeTool(toolId);
    tool.boughtOn = state.time.day;
    state.tools.push(tool);
    return { ok: true, tool: tool };
  };

  E.sellTool = function (state, toolId) {
    var tool = S.toolById(state, toolId);
    if (!tool) return { ok: false, reason: 'err.unknownTool' };
    var value = Math.round(S.tool(tool.type).price * 0.45);
    state.tools = state.tools.filter(function (t) { return t.id !== toolId; });
    E.earn(state, value, 'other');
    return { ok: true, value: value };
  };

  E.hire = function (state, candidateId) {
    var cand = state.offers.candidates.filter(function (p) { return p.id === candidateId; })[0];
    if (!cand) return { ok: false, reason: 'err.candidateGone' };
    if (state.staff.length >= S.staffCap(state)) return { ok: false, reason: 'err.headcount' };
    if (!E.canAfford(state, cand.hireFee)) return { ok: false, reason: 'err.placementFee' };
    E.spend(state, cand.hireFee, 'training');
    cand.hiredOn = state.time.day;
    state.staff.push(cand);
    state.offers.candidates = state.offers.candidates.filter(function (p) { return p.id !== candidateId; });
    return { ok: true, person: cand };
  };

  E.fire = function (state, personId) {
    var person = S.personById(state, personId);
    if (!person) return { ok: false, reason: 'err.unknownPerson' };
    var unit = person.unitId ? S.unitById(state, person.unitId) : null;
    if (unit && unit.status !== 'idle' && unit.status !== 'offshift') {
      return { ok: false, reason: 'err.deployed' };
    }
    var severance = Math.round(person.wage * 6);
    E.spend(state, severance, 'payroll');
    S.assignCrew(state, personId, null);
    state.staff = state.staff.filter(function (p) { return p.id !== personId; });
    // Letting people go dents the morale of those who remain.
    state.staff.forEach(function (p) { p.morale = U.clamp(p.morale - 5, 0, 100); });
    return { ok: true, severance: severance };
  };

  E.train = function (state, personId, days) {
    var person = S.personById(state, personId);
    if (!person) return { ok: false, reason: 'err.unknownPerson' };
    if (person.training) return { ok: false, reason: 'err.inTraining' };
    var unit = person.unitId ? S.unitById(state, person.unitId) : null;
    if (unit && unit.status !== 'idle' && unit.status !== 'offshift') {
      return { ok: false, reason: 'err.deployed' };
    }
    days = days || 3;
    // Diminishing returns: the higher the skill, the slower the climb.
    var gain = Math.round(days * U.lerp(4.2, 1.3, U.clamp(person.skill / 100, 0, 1)));
    var cost = Math.round(gain * C.ECONOMY.TRAINING_COST_PER_POINT);
    if (!E.canAfford(state, cost)) return { ok: false, reason: 'err.cash' };
    E.spend(state, cost, 'training');
    S.assignCrew(state, personId, null);
    person.training = { days: days, remaining: days, gain: gain, cost: cost };
    return { ok: true, gain: gain, cost: cost, days: days };
  };

  E.refuel = function (state, unitId) {
    var unit = S.unitById(state, unitId);
    if (!unit) return { ok: false, reason: 'err.unknownUnit' };
    var spec = S.vehicle(unit.vehicle);
    var litres = spec.fuelCap - unit.fuel;
    if (litres <= 0.5) return { ok: false, reason: 'err.tankFull' };
    var cost = Math.round(litres * E.fuelPrice(state));
    if (!E.canAfford(state, cost)) return { ok: false, reason: 'err.cash' };
    E.spend(state, cost, 'fuel');
    unit.fuel = spec.fuelCap;
    state.stats.fuelUsed += litres;
    return { ok: true, cost: cost, litres: litres };
  };

  E.serviceUnit = function (state, unitId) {
    var unit = S.unitById(state, unitId);
    if (!unit) return { ok: false, reason: 'err.unknownUnit' };
    if (unit.status !== 'idle' && unit.status !== 'offshift') return { ok: false, reason: 'err.unitDeployed' };
    var points = 100 - unit.condition;
    if (points < 1) return { ok: false, reason: 'err.topCondition' };
    var spec = S.vehicle(unit.vehicle);
    var cost = Math.round(points * C.ECONOMY.REPAIR_COST_PER_POINT * (0.7 + spec.tier * 0.35));
    if (!E.canAfford(state, cost)) return { ok: false, reason: 'err.cash' };
    E.spend(state, cost, 'maintenance');
    unit.condition = 100;
    unit.status = 'shop';
    unit.shopDays = 1;
    return { ok: true, cost: cost };
  };

  E.buyTerritory = function (state, territoryId) {
    var terr = S.territory(territoryId);
    if (!terr) return { ok: false, reason: 'err.unknownTerritory' };
    if (state.territories.indexOf(territoryId) !== -1) return { ok: false, reason: 'err.alreadyLicensed' };
    if (!S.isUnlocked(state, terr.unlock)) return { ok: false, reason: 'err.milestoneRequired' };
    if (!E.canAfford(state, terr.price)) return { ok: false, reason: 'err.cash' };
    E.spend(state, terr.price, 'capex');
    state.territories.push(territoryId);
    return { ok: true, territory: terr };
  };

  FST.Economy = E;
})(window.FST = window.FST || {});
