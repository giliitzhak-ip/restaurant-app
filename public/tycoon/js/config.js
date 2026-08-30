/**
 * MERIDIAN FIELD OPS — Static configuration & balance data.
 * All tunable game values live here so balance changes never touch logic.
 */
(function (FST) {
  'use strict';

  var C = {};

  C.VERSION = '1.0.0';
  C.SAVE_KEY = 'meridian.fieldops.save.v1';

  /* ── World & time ──────────────────────────────────────────────────────── */
  C.WORLD = { w: 1600, h: 1000 };

  C.TIME = {
    TICK_MS: 100,          // real milliseconds per simulation tick at 1x
    MINUTES_PER_TICK: 2,   // in-game minutes advanced per tick
    SPEEDS: [0, 1, 2, 4],  // pause / normal / fast / turbo
    SPEED_LABELS: ['PAUSED', '1x', '2x', '4x'],
    SPEED_SCALE: 3.0,      // map units per hour = vehicle speed x this
    SHIFT_START: 6 * 60,   // 06:00 crews clock on
    SHIFT_END: 20 * 60,    // 20:00 crews clock off
    DAYS_PER_QUARTER: 90,
    QUARTERS_PER_YEAR: 4
  };

  /* ── Economy ───────────────────────────────────────────────────────────── */
  C.ECONOMY = {
    START_CASH: 185000,
    TAX_RATE: 0.23,               // applied to quarterly operating profit
    OVERHEAD_PER_DAY: 780,        // depot, software, admin
    INSURANCE_PER_VEHICLE_DAY: 46,
    FUEL_PRICE: 1.62,             // per litre, drifts over time
    FUEL_PRICE_RANGE: [1.05, 2.85],
    CREDIT_BASE: 120000,          // credit line floor
    CREDIT_PER_ASSET: 0.4,        // + share of asset value
    INTEREST_DAILY: 0.00045,      // ~16.4% APR on drawn debt
    TRAINING_COST_PER_POINT: 420,
    OVERTIME_MULTIPLIER: 1.85,
    REPAIR_COST_PER_POINT: 58
  };

  /* ── Reputation ────────────────────────────────────────────────────────── */
  C.CSAT = {
    START: 72,
    ON_TIME_GAIN: 1.1,
    LATE_LOSS: 2.4,
    EXPIRED_LOSS: 1.5,
    FAILED_LOSS: 3.1,
    QUALITY_WEIGHT: 1.6,
    DAILY_DECAY: 0.06,            // share of the gap to the mean recovered daily
    MEAN: 62
  };

  /* ── Capability tags shared by vehicles and tools ──────────────────────── */
  C.CAPABILITIES = {
    diagnostic: { label: 'Diagnostics', icon: '◎' },
    hvac: { label: 'HVAC / Refrigerant', icon: '❄' },
    hydraulic: { label: 'Hydraulics', icon: '⛭' },
    welding: { label: 'Welding', icon: '⚡' },
    thermal: { label: 'Thermal Imaging', icon: '▚' },
    fiber: { label: 'Fiber Optics', icon: '⌇' },
    aerial: { label: 'Aerial Access', icon: '⇡' },
    hv: { label: 'High Voltage', icon: '⌁' },
    leak: { label: 'Leak Detection', icon: '≈' },
    heavy_lift: { label: 'Heavy Lift', icon: '⤒' }
  };

  /* ── Fleet catalog ─────────────────────────────────────────────────────── */
  C.VEHICLES = [
    { id: 'van_compact', name: 'Compact Service Van', price: 28000, speed: 68, crew: 2, slots: 2,
      fuelCap: 62, burn: 0.088, wear: 0.055, upkeep: 22, caps: [], tier: 1,
      blurb: 'Nimble city runner. Cheap to feed, light on capability.' },
    { id: 'van_heavy', name: 'Heavy Utility Van', price: 47500, speed: 58, crew: 3, slots: 3,
      fuelCap: 95, burn: 0.132, wear: 0.062, upkeep: 38, caps: [], tier: 1,
      blurb: 'Workhorse of the fleet. Three seats, three tool bays.' },
    { id: 'rapid_ev', name: 'Rapid Response EV', price: 61000, speed: 86, crew: 2, slots: 2,
      fuelCap: 100, burn: 0.041, wear: 0.034, upkeep: 18, caps: ['diagnostic'], tier: 1,
      blurb: 'Fast, silent, and almost free to run. Limited payload.' },
    { id: 'truck_4x4', name: 'Utility Truck 4x4', price: 84000, speed: 62, crew: 3, slots: 4,
      fuelCap: 130, burn: 0.171, wear: 0.078, upkeep: 54, caps: [], tier: 2, unlock: 'm_fleet',
      blurb: 'All-terrain capable. Reaches sites others cannot.' },
    { id: 'bucket_truck', name: 'Aerial Bucket Truck', price: 126000, speed: 48, crew: 3, slots: 4,
      fuelCap: 150, burn: 0.205, wear: 0.094, upkeep: 78, caps: ['aerial'], tier: 2, unlock: 'm_fleet',
      blurb: '18m insulated boom. Unlocks elevated work outright.' },
    { id: 'crane_rig', name: 'Mobile Crane Rig', price: 238000, speed: 38, crew: 4, slots: 5,
      fuelCap: 220, burn: 0.318, wear: 0.126, upkeep: 165, caps: ['heavy_lift', 'aerial'], tier: 3, unlock: 'm_heavy',
      blurb: '40 tonne class. The only way to touch heavy placement work.' }
  ];

  /* ── Tool catalog ──────────────────────────────────────────────────────── */
  C.TOOLS = [
    { id: 'diagnostic', name: 'Diagnostic Analyzer', price: 7400, upkeep: 4, quality: 0.04, tier: 1 },
    { id: 'hvac', name: 'HVAC Charging Rig', price: 12800, upkeep: 7, quality: 0.05, tier: 1 },
    { id: 'hydraulic', name: 'Hydraulic Toolset', price: 19500, upkeep: 11, quality: 0.06, tier: 1 },
    { id: 'thermal', name: 'Thermal Imaging Suite', price: 17200, upkeep: 8, quality: 0.07, tier: 1 },
    { id: 'welding', name: 'Mobile Welding Unit', price: 24600, upkeep: 14, quality: 0.06, tier: 2, unlock: 'm_fleet' },
    { id: 'fiber', name: 'Fiber Splice Kit', price: 21800, upkeep: 9, quality: 0.08, tier: 2, unlock: 'm_certified' },
    { id: 'leak', name: 'Acoustic Leak Array', price: 28400, upkeep: 12, quality: 0.07, tier: 2, unlock: 'm_revenue' },
    { id: 'hv', name: 'HV Insulated Gear Set', price: 41000, upkeep: 21, quality: 0.09, tier: 3, unlock: 'm_certified' },
    { id: 'heavy_lift', name: 'Rigging & Lift Package', price: 56000, upkeep: 26, quality: 0.08, tier: 3, unlock: 'm_heavy' }
  ];

  /* ── Sectors ───────────────────────────────────────────────────────────── */
  C.SECTORS = {
    residential: { label: 'Residential', color: '#38bdf8', unlocked: true },
    commercial: { label: 'Commercial', color: '#a78bfa', unlock: 'm_fleet' },
    industrial: { label: 'Industrial', color: '#fb923c', unlock: 'm_revenue' },
    telecom: { label: 'Telecom', color: '#34d399', unlock: 'm_certified' },
    energy: { label: 'Energy', color: '#f43f5e', unlock: 'm_grid' }
  };

  /* ── Job catalog ───────────────────────────────────────────────────────── */
  C.JOB_TYPES = [
    { id: 'appliance', label: 'Appliance Repair', sector: 'residential', value: 760, dur: 110, caps: ['diagnostic'], skill: 25, risk: 0.05 },
    { id: 'hvac_tune', label: 'HVAC Tune-Up', sector: 'residential', value: 1180, dur: 150, caps: ['hvac'], skill: 34, risk: 0.05 },
    { id: 'panel', label: 'Electrical Panel Upgrade', sector: 'residential', value: 1850, dur: 205, caps: ['diagnostic'], skill: 45, risk: 0.08 },
    { id: 'water_line', label: 'Water Line Leak', sector: 'residential', value: 1390, dur: 165, caps: ['hydraulic'], skill: 38, risk: 0.07 },

    { id: 'chiller', label: 'Rooftop Chiller Repair', sector: 'commercial', value: 3700, dur: 255, caps: ['hvac', 'thermal'], skill: 55, risk: 0.09 },
    { id: 'access_ctrl', label: 'Access Control Retrofit', sector: 'commercial', value: 2680, dur: 220, caps: ['diagnostic'], skill: 47, risk: 0.06 },
    { id: 'genset', label: 'Standby Generator Service', sector: 'commercial', value: 4600, dur: 280, caps: ['diagnostic', 'welding'], skill: 58, risk: 0.10 },
    { id: 'signage', label: 'Aerial Signage Install', sector: 'commercial', value: 3160, dur: 200, caps: ['aerial'], skill: 44, risk: 0.11 },

    { id: 'conveyor', label: 'Conveyor Drive Rebuild', sector: 'industrial', value: 7600, dur: 330, caps: ['hydraulic', 'welding'], skill: 62, risk: 0.12 },
    { id: 'press', label: 'Hydraulic Press Overhaul', sector: 'industrial', value: 9900, dur: 400, caps: ['hydraulic'], skill: 70, risk: 0.13 },
    { id: 'placement', label: 'Heavy Equipment Placement', sector: 'industrial', value: 15400, dur: 420, caps: ['heavy_lift'], skill: 68, risk: 0.14 },
    { id: 'vessel_weld', label: 'Pressure Vessel Weld', sector: 'industrial', value: 11400, dur: 375, caps: ['welding', 'thermal'], skill: 74, risk: 0.15 },

    { id: 'splice', label: 'Fiber Splice & Test', sector: 'telecom', value: 5700, dur: 240, caps: ['fiber'], skill: 60, risk: 0.08 },
    { id: 'tower', label: 'Tower Antenna Alignment', sector: 'telecom', value: 8900, dur: 300, caps: ['aerial', 'fiber'], skill: 72, risk: 0.14 },
    { id: 'ups_swap', label: 'Data Centre UPS Swap', sector: 'telecom', value: 12600, dur: 355, caps: ['diagnostic', 'hv'], skill: 76, risk: 0.13 },

    { id: 'substation', label: 'Substation Fault Clearance', sector: 'energy', value: 18800, dur: 395, caps: ['hv', 'thermal'], skill: 80, risk: 0.17 },
    { id: 'transformer', label: 'Transformer Replacement', sector: 'energy', value: 24500, dur: 480, caps: ['hv', 'heavy_lift'], skill: 84, risk: 0.18 },
    { id: 'pipeline', label: 'Pipeline Leak Isolation', sector: 'energy', value: 16200, dur: 415, caps: ['leak', 'welding'], skill: 78, risk: 0.16 },
    { id: 'inverter', label: 'Solar Inverter Repair', sector: 'energy', value: 9600, dur: 295, caps: ['diagnostic', 'thermal'], skill: 66, risk: 0.10 }
  ];

  /* Priority tiers modify pay, SLA window and reputation stakes. */
  C.PRIORITIES = {
    routine:   { label: 'Routine',   pay: 1.00, sla: 1440, weight: 58, csat: 1.0, color: '#64748b' },
    urgent:    { label: 'Urgent',    pay: 1.45, sla: 480,  weight: 30, csat: 1.6, color: '#f59e0b' },
    emergency: { label: 'EMERGENCY', pay: 2.30, sla: 180,  weight: 12, csat: 2.6, color: '#f43f5e' }
  };

  /* ── Territories ───────────────────────────────────────────────────────── */
  C.TERRITORIES = [
    { id: 'northgate', name: 'Northgate Metro', x: 430, y: 330, r: 215, price: 0, demand: 1.0,
      mix: { residential: 6, commercial: 3, industrial: 1, telecom: 1, energy: 0 },
      blurb: 'Dense housing and small commercial strips. Your home turf.' },
    { id: 'harbor', name: 'Harbor Industrial', x: 1075, y: 265, r: 235, price: 135000, demand: 1.25, unlock: 'm_fleet',
      mix: { residential: 1, commercial: 3, industrial: 6, telecom: 2, energy: 1 },
      blurb: 'Port logistics, warehousing and heavy plant. High ticket value.' },
    { id: 'eastfield', name: 'Eastfield Commercial', x: 780, y: 690, r: 210, price: 260000, demand: 1.18, unlock: 'm_reputation',
      mix: { residential: 3, commercial: 6, industrial: 1, telecom: 3, energy: 1 },
      blurb: 'Office parks and data halls. Tight SLAs, loyal clients.' },
    { id: 'ridgeline', name: 'Ridgeline Energy Corridor', x: 1310, y: 720, r: 225, price: 560000, demand: 1.42, unlock: 'm_grid',
      mix: { residential: 0, commercial: 1, industrial: 3, telecom: 2, energy: 7 },
      blurb: 'Substations, solar farms and transmission. The big money.' },
    { id: 'southport', name: 'Southport Logistics', x: 245, y: 780, r: 195, price: 840000, demand: 1.34, unlock: 'm_regional',
      mix: { residential: 2, commercial: 3, industrial: 5, telecom: 4, energy: 2 },
      blurb: 'Rail interchange and distribution megasheds. Volume play.' }
  ];

  C.HQ = { x: 430, y: 330 };

  /* ── Personnel ─────────────────────────────────────────────────────────── */
  C.ROLES = [
    { id: 'apprentice', label: 'Apprentice', skill: [18, 36], wage: 330, hireFee: 1800 },
    { id: 'technician', label: 'Technician', skill: [38, 58], wage: 560, hireFee: 4600 },
    { id: 'senior', label: 'Senior Technician', skill: [58, 76], wage: 880, hireFee: 9500 },
    { id: 'specialist', label: 'Field Specialist', skill: [74, 92], wage: 1290, hireFee: 17500 }
  ];

  C.STAFF_CAP_BASE = 5;

  C.FIRST_NAMES = ['Alex', 'Rowan', 'Priya', 'Mateo', 'Ines', 'Dev', 'Nadia', 'Kai', 'Yusuf', 'Lena',
    'Tomas', 'Amara', 'Jonas', 'Sasha', 'Elif', 'Bruno', 'Noor', 'Ravi', 'Freya', 'Oscar',
    'Mila', 'Cormac', 'Zara', 'Theo', 'Anouk', 'Idris', 'Sena', 'Hugo', 'Nia', 'Emre'];
  C.LAST_NAMES = ['Okafor', 'Lindqvist', 'Marchetti', 'Delacroix', 'Halvorsen', 'Nakamura', 'Bauer', 'Costa',
    'Rasmussen', 'Varga', 'Fitzgerald', 'Aslan', 'Moreau', 'Kowalski', 'Vasquez', 'Sørensen',
    'Novak', 'Balogun', 'Ferreira', 'Whitlock', 'Nguyen', 'Petrov', 'Abadi', 'Strand'];
  C.CALLSIGNS = ['ATLAS', 'BRAVO', 'CINDER', 'DELTA', 'ECHO', 'FALCON', 'GRANITE', 'HALO', 'IRON', 'JUNIPER',
    'KESTREL', 'LUMEN', 'MERIDIAN', 'NOMAD', 'ORBIT', 'PIONEER', 'QUARRY', 'RIDGE', 'SUMMIT', 'TITAN'];

  C.CLIENTS = ['Bellweather Holdings', 'Kestrel Foods', 'Northvale Housing', 'Orion Data', 'Pallas Logistics',
    'Redstone Manufacturing', 'Silverline Retail', 'Tarrant Chemicals', 'Union Rail', 'Vertex Health',
    'Wildmoor Estates', 'Ashcroft Hotels', 'Brightline Energy', 'Corvid Media', 'Dunmore Cold Storage',
    'Everline Telecom', 'Fairhaven Schools', 'Granite Bay Marina', 'Helios Solar', 'Ivory Tower Offices'];

  /* ── Contract templates ────────────────────────────────────────────────── */
  C.CONTRACT_TIERS = [
    { id: 'local', label: 'Local Service Agreement', term: 60, retainer: [220, 480], volume: [0.6, 1.1],
      sla: 1.0, minCsat: 0, mult: [1.02, 1.12], penalty: 900, tier: 1 },
    { id: 'regional', label: 'Regional Framework', term: 90, retainer: [780, 1450], volume: [0.8, 1.4],
      sla: 0.85, minCsat: 70, mult: [1.12, 1.28], penalty: 3200, tier: 2, unlock: 'm_reputation' },
    { id: 'enterprise', label: 'Enterprise Master Contract', term: 120, retainer: [2100, 3900], volume: [1.2, 2.0],
      sla: 0.7, minCsat: 82, mult: [1.25, 1.5], penalty: 9000, tier: 3, unlock: 'm_regional' }
  ];

  /* ── Milestones ────────────────────────────────────────────────────────── */
  C.MILESTONES = [
    { id: 'm_first', name: 'Open for Business', desc: 'Complete 5 service jobs.',
      goal: function (s) { return { have: s.stats.jobsDone, need: 5 }; },
      reward: 'Local service agreements and an extra headcount slot', staff: 1 },
    { id: 'm_fleet', name: 'Fleet Builder', desc: 'Operate 3 field units simultaneously.',
      goal: function (s) { return { have: s.fleet.length, need: 3 }; },
      reward: 'Commercial sector, heavy vehicles, welding rig, Harbor Industrial', staff: 2 },
    { id: 'm_reputation', name: 'Trusted Operator', desc: 'Reach 82 CSAT with 45 completed jobs.',
      goal: function (s) { return { have: Math.min(s.ops.csat, 82) / 82 * Math.min(s.stats.jobsDone, 45), need: 45 }; },
      reward: 'Regional Frameworks + Eastfield Commercial territory', staff: 2 },
    { id: 'm_revenue', name: 'Half a Million', desc: 'Bank $500,000 in lifetime revenue.',
      goal: function (s) { return { have: s.stats.revenue, need: 500000 }; },
      reward: 'Industrial sector, welding & leak detection equipment', staff: 2 },
    { id: 'm_certified', name: 'Certified Crew', desc: 'Train a technician to skill 78.',
      goal: function (s) { return { have: s.staff.reduce(function (m, p) { return Math.max(m, p.skill); }, 0), need: 78 }; },
      reward: 'Telecom sector, fiber tooling and HV gear', staff: 2 },
    { id: 'm_heavy', name: 'Heavy Iron', desc: 'Reach $1.8M lifetime revenue.',
      goal: function (s) { return { have: s.stats.revenue, need: 1800000 }; },
      reward: 'Mobile Crane Rig and heavy lift rigging', staff: 3 },
    { id: 'm_grid', name: 'Grid Partner', desc: '$4M lifetime revenue while holding 85 CSAT.',
      goal: function (s) { return { have: s.ops.csat >= 85 ? s.stats.revenue : 0, need: 4000000 }; },
      reward: 'Energy sector, HV gear, Ridgeline corridor', staff: 3 },
    { id: 'm_regional', name: 'Regional Operator', desc: 'Hold licences in 3 territories.',
      goal: function (s) { return { have: s.territories.length, need: 3 }; },
      reward: 'Enterprise contracts + Southport Logistics', staff: 4 },
    { id: 'm_bluechip', name: 'Blue Chip', desc: 'Grow net worth to $12,000,000.',
      goal: function (s) { return { have: s.netWorth || 0, need: 12000000 }; },
      reward: 'Industry benchmark status. You have made it.', staff: 4 }
  ];

  /* ── Random world events ───────────────────────────────────────────────── */
  C.EVENTS = [
    { id: 'fuel_spike', title: 'Fuel Market Shock', weight: 10, minDay: 3,
      body: 'Regional refinery outage. Diesel wholesale is up sharply and your card is on file at every pump.',
      options: [
        { label: 'Absorb the cost', detail: 'Fuel price +18% for two weeks.', effect: 'fuel_absorb' },
        { label: 'Pre-buy 30 days', detail: 'Pay $9,500 now, lock current price.', effect: 'fuel_hedge', cost: 9500 }
      ] },
    { id: 'poach', title: 'Rival Poaching Attempt', weight: 9, minDay: 12, needStaff: true,
      body: 'A competitor has made an offer to one of your best technicians. They are waiting on your answer.',
      options: [
        { label: 'Counter-offer', detail: 'Pay a $6,000 retention bonus, +12 morale.', effect: 'poach_pay', cost: 6000 },
        { label: 'Let them walk', detail: 'Lose the technician. Remaining crew morale dips.', effect: 'poach_lose' }
      ] },
    { id: 'storm', title: 'Severe Weather Front', weight: 12, minDay: 6,
      body: 'A storm cell is crossing your territories. Emergency call volume is about to spike — and so is risk.',
      options: [
        { label: 'Surge staffing', detail: 'Pay overtime, +3 emergency calls at 1.5x value.', effect: 'storm_surge' },
        { label: 'Ride it out', detail: 'Normal operations. Two calls go to a rival.', effect: 'storm_pass' }
      ] },
    { id: 'audit', title: 'Compliance Audit', weight: 8, minDay: 20,
      body: 'The regulator has scheduled a safety and records audit of your operation.',
      options: [
        { label: 'Full cooperation', detail: 'Costs $12,000 in prep time. +6 CSAT.', effect: 'audit_pass', cost: 12000 },
        { label: 'Minimum compliance', detail: 'Free, but 45% chance of a $28,000 fine.', effect: 'audit_risk' }
      ] },
    { id: 'breakdown', title: 'Unscheduled Breakdown', weight: 11, minDay: 8, needFleet: true,
      body: 'A unit has thrown a fault code mid-route. The shop can take it today or you can nurse it along.',
      options: [
        { label: 'Full workshop repair', detail: 'Unit offline 1 day, condition restored to 100%.', effect: 'break_fix' },
        { label: 'Field patch', detail: 'Stay in service at −22% condition and higher failure risk.', effect: 'break_patch' }
      ] },
    { id: 'bulk_offer', title: 'Liquidation Auction', weight: 7, minDay: 15,
      body: 'A failed competitor is liquidating. Their tooling is going for well under book value.',
      options: [
        { label: 'Buy the lot', detail: 'Random tool package at 55% of list price.', effect: 'auction_buy' },
        { label: 'Pass', detail: 'Preserve cash.', effect: 'none' }
      ] },
    { id: 'referral', title: 'Client Referral', weight: 13, minDay: 4,
      body: 'A satisfied client has referred you to their parent company. They want a proposal today.',
      options: [
        { label: 'Bid aggressively', detail: 'Spend $4,500 on the proposal for a premium contract offer.', effect: 'ref_bid', cost: 4500 },
        { label: 'Standard quote', detail: 'Free. A routine contract offer appears.', effect: 'ref_std' }
      ] },
    { id: 'insurance', title: 'Insurance Renewal', weight: 8, minDay: 25,
      body: 'Your fleet policy is up for renewal. The broker has two structures on the table.',
      options: [
        { label: 'Comprehensive', detail: 'Pay $18,000 upfront. Vehicle wear −25% for 30 days.', effect: 'ins_full', cost: 18000 },
        { label: 'Third party only', detail: 'Save the premium, accept the exposure.', effect: 'ins_min' }
      ] }
  ];

  FST.Config = C;
})(window.FST = window.FST || {});
