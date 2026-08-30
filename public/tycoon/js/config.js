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
    diagnostic: { label: 'Diagnostics', label_he: 'אבחון', icon: '◎' },
    hvac: { label: 'HVAC / Refrigerant', label_he: 'מיזוג וקירור', icon: '❄' },
    hydraulic: { label: 'Hydraulics', label_he: 'הידראוליקה', icon: '⛭' },
    welding: { label: 'Welding', label_he: 'ריתוך', icon: '⚡' },
    thermal: { label: 'Thermal Imaging', label_he: 'דימות תרמי', icon: '▚' },
    fiber: { label: 'Fiber Optics', label_he: 'סיבים אופטיים', icon: '⌇' },
    aerial: { label: 'Aerial Access', label_he: 'גישה בגובה', icon: '⇡' },
    hv: { label: 'High Voltage', label_he: 'מתח גבוה', icon: '⌁' },
    leak: { label: 'Leak Detection', label_he: 'איתור נזילות', icon: '≈' },
    heavy_lift: { label: 'Heavy Lift', label_he: 'הרמה כבדה', icon: '⤒' }
  };

  /* ── Fleet catalog ─────────────────────────────────────────────────────── */
  C.VEHICLES = [
    { id: 'van_compact', name: 'Compact Service Van', name_he: 'ואן שירות קומפקטי', price: 28000, speed: 68, crew: 2, slots: 2,
      fuelCap: 62, burn: 0.088, wear: 0.055, upkeep: 22, caps: [], tier: 1,
      blurb: 'Nimble city runner. Cheap to feed, light on capability.', blurb_he: 'רכב עירוני זריז. זול בתחזוקה, מוגבל ביכולות.' },
    { id: 'van_heavy', name: 'Heavy Utility Van', name_he: 'ואן שירות כבד', price: 47500, speed: 58, crew: 3, slots: 3,
      fuelCap: 95, burn: 0.132, wear: 0.062, upkeep: 38, caps: [], tier: 1,
      blurb: 'Workhorse of the fleet. Three seats, three tool bays.', blurb_he: 'סוס העבודה של הצי. שלושה מושבים, שלושה תאי ציוד.' },
    { id: 'rapid_ev', name: 'Rapid Response EV', name_he: 'רכב חשמלי לתגובה מהירה', price: 61000, speed: 86, crew: 2, slots: 2,
      fuelCap: 100, burn: 0.041, wear: 0.034, upkeep: 18, caps: ['diagnostic'], tier: 1,
      blurb: 'Fast, silent, and almost free to run. Limited payload.', blurb_he: 'מהיר, שקט וכמעט חינם בהפעלה. כושר נשיאה מוגבל.' },
    { id: 'truck_4x4', name: 'Utility Truck 4x4', name_he: 'משאית שירות 4x4', price: 84000, speed: 62, crew: 3, slots: 4,
      fuelCap: 130, burn: 0.171, wear: 0.078, upkeep: 54, caps: [], tier: 2, unlock: 'm_fleet',
      blurb: 'All-terrain capable. Reaches sites others cannot.', blurb_he: 'כשיר לכל שטח. מגיע לאתרים שאחרים לא מגיעים אליהם.' },
    { id: 'bucket_truck', name: 'Aerial Bucket Truck', name_he: 'משאית במת הרמה', price: 126000, speed: 48, crew: 3, slots: 4,
      fuelCap: 150, burn: 0.205, wear: 0.094, upkeep: 78, caps: ['aerial'], tier: 2, unlock: 'm_fleet',
      blurb: '18m insulated boom. Unlocks elevated work outright.', blurb_he: 'זרוע מבודדת באורך 18 מ׳. פותחת עבודות גובה.' },
    { id: 'crane_rig', name: 'Mobile Crane Rig', name_he: 'מנוף נייד', price: 238000, speed: 38, crew: 4, slots: 5,
      fuelCap: 220, burn: 0.318, wear: 0.126, upkeep: 165, caps: ['heavy_lift', 'aerial'], tier: 3, unlock: 'm_heavy',
      blurb: '40 tonne class. The only way to touch heavy placement work.', blurb_he: 'מחלקת 40 טון. הדרך היחידה לבצע עבודות הצבה כבדות.' }
  ];

  /* ── Tool catalog ──────────────────────────────────────────────────────── */
  C.TOOLS = [
    { id: 'diagnostic', name: 'Diagnostic Analyzer', name_he: 'מנתח אבחון', price: 7400, upkeep: 4, quality: 0.04, tier: 1 },
    { id: 'hvac', name: 'HVAC Charging Rig', name_he: 'מערך מילוי גז למיזוג', price: 12800, upkeep: 7, quality: 0.05, tier: 1 },
    { id: 'hydraulic', name: 'Hydraulic Toolset', name_he: 'ערכת כלים הידראוליים', price: 19500, upkeep: 11, quality: 0.06, tier: 1 },
    { id: 'thermal', name: 'Thermal Imaging Suite', name_he: 'מערכת דימות תרמי', price: 17200, upkeep: 8, quality: 0.07, tier: 1 },
    { id: 'welding', name: 'Mobile Welding Unit', name_he: 'יחידת ריתוך ניידת', price: 24600, upkeep: 14, quality: 0.06, tier: 2, unlock: 'm_fleet' },
    { id: 'fiber', name: 'Fiber Splice Kit', name_he: 'ערכת ריתוך סיבים', price: 21800, upkeep: 9, quality: 0.08, tier: 2, unlock: 'm_certified' },
    { id: 'leak', name: 'Acoustic Leak Array', name_he: 'מערך אקוסטי לאיתור נזילות', price: 28400, upkeep: 12, quality: 0.07, tier: 2, unlock: 'm_revenue' },
    { id: 'hv', name: 'HV Insulated Gear Set', name_he: 'ציוד מבודד למתח גבוה', price: 41000, upkeep: 21, quality: 0.09, tier: 3, unlock: 'm_certified' },
    { id: 'heavy_lift', name: 'Rigging & Lift Package', name_he: 'ערכת ריגוט והרמה', price: 56000, upkeep: 26, quality: 0.08, tier: 3, unlock: 'm_heavy' }
  ];

  /* ── Sectors ───────────────────────────────────────────────────────────── */
  C.SECTORS = {
    residential: { label: 'Residential', label_he: 'מגורים', color: '#38bdf8', unlocked: true },
    commercial: { label: 'Commercial', label_he: 'מסחרי', color: '#a78bfa', unlock: 'm_fleet' },
    industrial: { label: 'Industrial', label_he: 'תעשייה', color: '#fb923c', unlock: 'm_revenue' },
    telecom: { label: 'Telecom', label_he: 'תקשורת', color: '#34d399', unlock: 'm_certified' },
    energy: { label: 'Energy', label_he: 'אנרגיה', color: '#f43f5e', unlock: 'm_grid' }
  };

  /* ── Job catalog ───────────────────────────────────────────────────────── */
  C.JOB_TYPES = [
    { id: 'appliance', label: 'Appliance Repair', label_he: 'תיקון מכשירי חשמל', sector: 'residential', value: 760, dur: 110, caps: ['diagnostic'], skill: 25, risk: 0.05 },
    { id: 'hvac_tune', label: 'HVAC Tune-Up', label_he: 'טיפול במערכת מיזוג', sector: 'residential', value: 1180, dur: 150, caps: ['hvac'], skill: 34, risk: 0.05 },
    { id: 'panel', label: 'Electrical Panel Upgrade', label_he: 'שדרוג לוח חשמל', sector: 'residential', value: 1850, dur: 205, caps: ['diagnostic'], skill: 45, risk: 0.08 },
    { id: 'water_line', label: 'Water Line Leak', label_he: 'נזילה בקו מים', sector: 'residential', value: 1390, dur: 165, caps: ['hydraulic'], skill: 38, risk: 0.07 },

    { id: 'chiller', label: 'Rooftop Chiller Repair', label_he: 'תיקון צ׳ילר על הגג', sector: 'commercial', value: 3700, dur: 255, caps: ['hvac', 'thermal'], skill: 55, risk: 0.09 },
    { id: 'access_ctrl', label: 'Access Control Retrofit', label_he: 'שדרוג בקרת כניסה', sector: 'commercial', value: 2680, dur: 220, caps: ['diagnostic'], skill: 47, risk: 0.06 },
    { id: 'genset', label: 'Standby Generator Service', label_he: 'טיפול בגנרטור חירום', sector: 'commercial', value: 4600, dur: 280, caps: ['diagnostic', 'welding'], skill: 58, risk: 0.10 },
    { id: 'signage', label: 'Aerial Signage Install', label_he: 'התקנת שילוט בגובה', sector: 'commercial', value: 3160, dur: 200, caps: ['aerial'], skill: 44, risk: 0.11 },

    { id: 'conveyor', label: 'Conveyor Drive Rebuild', label_he: 'שיקום מנגנון מסוע', sector: 'industrial', value: 7600, dur: 330, caps: ['hydraulic', 'welding'], skill: 62, risk: 0.12 },
    { id: 'press', label: 'Hydraulic Press Overhaul', label_he: 'שיפוץ מכבש הידראולי', sector: 'industrial', value: 9900, dur: 400, caps: ['hydraulic'], skill: 70, risk: 0.13 },
    { id: 'placement', label: 'Heavy Equipment Placement', label_he: 'הצבת ציוד כבד', sector: 'industrial', value: 15400, dur: 420, caps: ['heavy_lift'], skill: 68, risk: 0.14 },
    { id: 'vessel_weld', label: 'Pressure Vessel Weld', label_he: 'ריתוך מיכל לחץ', sector: 'industrial', value: 11400, dur: 375, caps: ['welding', 'thermal'], skill: 74, risk: 0.15 },

    { id: 'splice', label: 'Fiber Splice & Test', label_he: 'ריתוך ובדיקת סיבים', sector: 'telecom', value: 5700, dur: 240, caps: ['fiber'], skill: 60, risk: 0.08 },
    { id: 'tower', label: 'Tower Antenna Alignment', label_he: 'כיוון אנטנה במגדל', sector: 'telecom', value: 8900, dur: 300, caps: ['aerial', 'fiber'], skill: 72, risk: 0.14 },
    { id: 'ups_swap', label: 'Data Centre UPS Swap', label_he: 'החלפת UPS במרכז נתונים', sector: 'telecom', value: 12600, dur: 355, caps: ['diagnostic', 'hv'], skill: 76, risk: 0.13 },

    { id: 'substation', label: 'Substation Fault Clearance', label_he: 'טיפול בתקלה בתחנת השנאה', sector: 'energy', value: 18800, dur: 395, caps: ['hv', 'thermal'], skill: 80, risk: 0.17 },
    { id: 'transformer', label: 'Transformer Replacement', label_he: 'החלפת שנאי', sector: 'energy', value: 24500, dur: 480, caps: ['hv', 'heavy_lift'], skill: 84, risk: 0.18 },
    { id: 'pipeline', label: 'Pipeline Leak Isolation', label_he: 'בידוד נזילה בצנרת', sector: 'energy', value: 16200, dur: 415, caps: ['leak', 'welding'], skill: 78, risk: 0.16 },
    { id: 'inverter', label: 'Solar Inverter Repair', label_he: 'תיקון ממיר סולארי', sector: 'energy', value: 9600, dur: 295, caps: ['diagnostic', 'thermal'], skill: 66, risk: 0.10 }
  ];

  /* Priority tiers modify pay, SLA window and reputation stakes. */
  C.PRIORITIES = {
    routine:   { label: 'Routine', label_he: 'שגרתי',   pay: 1.00, sla: 1440, weight: 58, csat: 1.0, color: '#64748b' },
    urgent:    { label: 'Urgent', label_he: 'דחוף',    pay: 1.45, sla: 480,  weight: 30, csat: 1.6, color: '#f59e0b' },
    emergency: { label: 'EMERGENCY', label_he: 'חירום', pay: 2.30, sla: 180,  weight: 12, csat: 2.6, color: '#f43f5e' }
  };

  /* ── Territories ───────────────────────────────────────────────────────── */
  C.TERRITORIES = [
    { id: 'northgate', name: 'Northgate Metro', name_he: 'נורת׳גייט מטרו', x: 430, y: 330, r: 215, price: 0, demand: 1.0,
      mix: { residential: 6, commercial: 3, industrial: 1, telecom: 1, energy: 0 },
      blurb: 'Dense housing and small commercial strips. Your home turf.', blurb_he: 'שכונות מגורים צפופות ורצועות מסחר קטנות. המגרש הביתי שלכם.' },
    { id: 'harbor', name: 'Harbor Industrial', name_he: 'אזור התעשייה בנמל', x: 1075, y: 265, r: 235, price: 135000, demand: 1.25, unlock: 'm_fleet',
      mix: { residential: 1, commercial: 3, industrial: 6, telecom: 2, energy: 1 },
      blurb: 'Port logistics, warehousing and heavy plant. High ticket value.', blurb_he: 'לוגיסטיקת נמל, מחסנים וציוד כבד. עבודות בערך גבוה.' },
    { id: 'eastfield', name: 'Eastfield Commercial', name_he: 'איסטפילד מסחרי', x: 780, y: 690, r: 210, price: 260000, demand: 1.18, unlock: 'm_reputation',
      mix: { residential: 3, commercial: 6, industrial: 1, telecom: 3, energy: 1 },
      blurb: 'Office parks and data halls. Tight SLAs, loyal clients.', blurb_he: 'פארקי משרדים וחוות שרתים. SLA הדוק, לקוחות נאמנים.' },
    { id: 'ridgeline', name: 'Ridgeline Energy Corridor', name_he: 'מסדרון האנרגיה רידג׳ליין', x: 1310, y: 720, r: 225, price: 560000, demand: 1.42, unlock: 'm_grid',
      mix: { residential: 0, commercial: 1, industrial: 3, telecom: 2, energy: 7 },
      blurb: 'Substations, solar farms and transmission. The big money.', blurb_he: 'תחנות השנאה, שדות סולאריים והולכה. הכסף הגדול.' },
    { id: 'southport', name: 'Southport Logistics', name_he: 'סאות׳פורט לוגיסטיקה', x: 245, y: 780, r: 195, price: 840000, demand: 1.34, unlock: 'm_regional',
      mix: { residential: 2, commercial: 3, industrial: 5, telecom: 4, energy: 2 },
      blurb: 'Rail interchange and distribution megasheds. Volume play.', blurb_he: 'מסוף רכבות ומרכזי הפצה ענקיים. משחק של נפחים.' }
  ];

  C.HQ = { x: 430, y: 330 };

  /* ── Personnel ─────────────────────────────────────────────────────────── */
  C.ROLES = [
    { id: 'apprentice', label: 'Apprentice', label_he: 'חניך', skill: [18, 36], wage: 330, hireFee: 1800 },
    { id: 'technician', label: 'Technician', label_he: 'טכנאי', skill: [38, 58], wage: 560, hireFee: 4600 },
    { id: 'senior', label: 'Senior Technician', label_he: 'טכנאי בכיר', skill: [58, 76], wage: 880, hireFee: 9500 },
    { id: 'specialist', label: 'Field Specialist', label_he: 'מומחה שטח', skill: [74, 92], wage: 1290, hireFee: 17500 }
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

  C.FIRST_NAMES_he = ['אביב', 'נועה', 'איתי', 'שירה', 'עומר', 'ליאור', 'תמר', 'יונתן', 'הילה', 'רותם',
    'אורי', 'מאיה', 'דניאל', 'יעל', 'גיא', 'נטע', 'אסף', 'שני', 'עידו', 'רוני',
    'אמיר', 'ליהי', 'נדב', 'סהר', 'ארז', 'טל', 'מור', 'יובל', 'אלון', 'דנה'];
  C.LAST_NAMES_he = ['לוי', 'כהן', 'מזרחי', 'פרץ', 'ביטון', 'אזולאי', 'שפירא', 'דיין', 'הרוש', 'אברהמי',
    'גולן', 'ברקוביץ׳', 'סבן', 'נחום', 'אשכנזי', 'רוזן', 'עמר', 'זילברמן', 'טל', 'חדד',
    'שרעבי', 'פרידמן', 'ניסים', 'בן דוד'];
  C.CLIENTS_he = ['אחזקות בלוויתר', 'מזון קסטרל', 'שיכון נורת׳וייל', 'אוריון דאטה', 'פאלאס לוגיסטיקה',
    'רדסטון תעשיות', 'רשת סילברליין', 'כימיקלים טאראנט', 'רכבת יוניון', 'ורטקס בריאות',
    'נכסי ויילדמור', 'מלונות אשקרופט', 'ברייטליין אנרגיה', 'קורביד מדיה', 'קירור דנמור',
    'אוורליין תקשורת', 'בתי ספר פיירהייבן', 'מרינה גרניט ביי', 'הליוס סולארי', 'משרדי אייבורי'];

  C.CLIENTS = ['Bellweather Holdings', 'Kestrel Foods', 'Northvale Housing', 'Orion Data', 'Pallas Logistics',
    'Redstone Manufacturing', 'Silverline Retail', 'Tarrant Chemicals', 'Union Rail', 'Vertex Health',
    'Wildmoor Estates', 'Ashcroft Hotels', 'Brightline Energy', 'Corvid Media', 'Dunmore Cold Storage',
    'Everline Telecom', 'Fairhaven Schools', 'Granite Bay Marina', 'Helios Solar', 'Ivory Tower Offices'];

  /* ── Contract templates ────────────────────────────────────────────────── */
  C.CONTRACT_TIERS = [
    { id: 'local', label: 'Local Service Agreement', label_he: 'הסכם שירות מקומי', term: 60, retainer: [220, 480], volume: [0.6, 1.1],
      sla: 1.0, minCsat: 0, mult: [1.02, 1.12], penalty: 900, tier: 1 },
    { id: 'regional', label: 'Regional Framework', label_he: 'הסכם מסגרת אזורי', term: 90, retainer: [780, 1450], volume: [0.8, 1.4],
      sla: 0.85, minCsat: 70, mult: [1.12, 1.28], penalty: 3200, tier: 2, unlock: 'm_reputation' },
    { id: 'enterprise', label: 'Enterprise Master Contract', label_he: 'חוזה מסגרת ארגוני', term: 120, retainer: [2100, 3900], volume: [1.2, 2.0],
      sla: 0.7, minCsat: 82, mult: [1.25, 1.5], penalty: 9000, tier: 3, unlock: 'm_regional' }
  ];

  /* ── Milestones ────────────────────────────────────────────────────────── */
  C.MILESTONES = [
    { id: 'm_first', name: 'Open for Business', name_he: 'פותחים עסק', desc: 'Complete 5 service jobs.', desc_he: 'השלימו 5 קריאות שירות.',
      goal: function (s) { return { have: s.stats.jobsDone, need: 5 }; },
      reward: 'Local service agreements and an extra headcount slot', reward_he: 'הסכמי שירות מקומיים ותקן כוח אדם נוסף', staff: 1 },
    { id: 'm_fleet', name: 'Fleet Builder', name_he: 'בונים צי', desc: 'Operate 3 field units simultaneously.', desc_he: 'הפעילו 3 יחידות שטח במקביל.',
      goal: function (s) { return { have: s.fleet.length, need: 3 }; },
      reward: 'Commercial sector, heavy vehicles, welding rig, Harbor Industrial', reward_he: 'מגזר מסחרי, רכבים כבדים, יחידת ריתוך ואזור התעשייה בנמל', staff: 2 },
    { id: 'm_reputation', name: 'Trusted Operator', name_he: 'ספק אמין', desc: 'Reach 82 CSAT with 45 completed jobs.', desc_he: 'הגיעו ל‑82 שביעות רצון עם 45 עבודות שהושלמו.',
      goal: function (s) { return { have: Math.min(s.ops.csat, 82) / 82 * Math.min(s.stats.jobsDone, 45), need: 45 }; },
      reward: 'Regional Frameworks + Eastfield Commercial territory', reward_he: 'הסכמי מסגרת אזוריים ואזור איסטפילד מסחרי', staff: 2 },
    { id: 'm_revenue', name: 'Half a Million', name_he: 'חצי מיליון', desc: 'Bank $500,000 in lifetime revenue.', desc_he: 'צברו הכנסות מצטברות של 500,000$.',
      goal: function (s) { return { have: s.stats.revenue, need: 500000 }; },
      reward: 'Industrial sector, welding & leak detection equipment', reward_he: 'מגזר תעשייה, ציוד ריתוך ואיתור נזילות', staff: 2 },
    { id: 'm_certified', name: 'Certified Crew', name_he: 'צוות מוסמך', desc: 'Train a technician to skill 78.', desc_he: 'הכשירו טכנאי למיומנות 78.',
      goal: function (s) { return { have: s.staff.reduce(function (m, p) { return Math.max(m, p.skill); }, 0), need: 78 }; },
      reward: 'Telecom sector, fiber tooling and HV gear', reward_he: 'מגזר תקשורת, ציוד סיבים וציוד מתח גבוה', staff: 2 },
    { id: 'm_heavy', name: 'Heavy Iron', name_he: 'ברזל כבד', desc: 'Reach $1.8M lifetime revenue.', desc_he: 'הגיעו להכנסות מצטברות של 1.8 מיליון $.',
      goal: function (s) { return { have: s.stats.revenue, need: 1800000 }; },
      reward: 'Mobile Crane Rig and heavy lift rigging', reward_he: 'מנוף נייד וערכת ריגוט להרמה כבדה', staff: 3 },
    { id: 'm_grid', name: 'Grid Partner', name_he: 'שותף לרשת', desc: '$4M lifetime revenue while holding 85 CSAT.', desc_he: '4 מיליון $ הכנסות מצטברות תוך שמירה על 85 שביעות רצון.',
      goal: function (s) { return { have: s.ops.csat >= 85 ? s.stats.revenue : 0, need: 4000000 }; },
      reward: 'Energy sector, HV gear, Ridgeline corridor', reward_he: 'מגזר אנרגיה, ציוד מתח גבוה ומסדרון רידג׳ליין', staff: 3 },
    { id: 'm_regional', name: 'Regional Operator', name_he: 'מפעיל אזורי', desc: 'Hold licences in 3 territories.', desc_he: 'החזיקו רישיונות ב‑3 אזורי פעילות.',
      goal: function (s) { return { have: s.territories.length, need: 3 }; },
      reward: 'Enterprise contracts + Southport Logistics', reward_he: 'חוזים ארגוניים וסאות׳פורט לוגיסטיקה', staff: 4 },
    { id: 'm_bluechip', name: 'Blue Chip', name_he: 'שחקן בכיר', desc: 'Grow net worth to $12,000,000.', desc_he: 'הגדילו את השווי הנקי ל‑12,000,000$.',
      goal: function (s) { return { have: s.netWorth || 0, need: 12000000 }; },
      reward: 'Industry benchmark status. You have made it.', reward_he: 'אמת מידה לענף כולו. הגעתם לפסגה.', staff: 4 }
  ];

  /* ── Random world events ───────────────────────────────────────────────── */
  C.EVENTS = [
    { id: 'fuel_spike', title: 'Fuel Market Shock', title_he: 'זעזוע בשוק הדלק', weight: 10, minDay: 3,
      body: 'Regional refinery outage. Diesel wholesale is up sharply and your card is on file at every pump.', body_he: 'השבתה בבית זיקוק אזורי. מחיר הסולר הסיטונאי זינק, והכרטיס שלכם רשום בכל תחנת דלק.',
      options: [
        { label: 'Absorb the cost', label_he: 'לספוג את העלות', detail: 'Fuel price +18% for two weeks.', detail_he: 'מחיר הדלק +18% למשך שבועיים.', effect: 'fuel_absorb' },
        { label: 'Pre-buy 30 days', label_he: 'רכישה מראש ל‑30 יום', detail: 'Pay $9,500 now, lock current price.', detail_he: 'תשלום 9,500$ עכשיו, נעילת המחיר הנוכחי.', effect: 'fuel_hedge', cost: 9500 }
      ] },
    { id: 'poach', title: 'Rival Poaching Attempt', title_he: 'ניסיון חטיפת עובד ממתחרה', weight: 9, minDay: 12, needStaff: true,
      body: 'A competitor has made an offer to one of your best technicians. They are waiting on your answer.', body_he: 'מתחרה הגיש הצעה לאחד הטכנאים הטובים שלכם. הם מחכים לתשובה שלכם.',
      options: [
        { label: 'Counter-offer', label_he: 'הצעה נגדית', detail: 'Pay a $6,000 retention bonus, +12 morale.', detail_he: 'בונוס שימור של 6,000$, מורל +12.', effect: 'poach_pay', cost: 6000 },
        { label: 'Let them walk', label_he: 'לתת לו/ה ללכת', detail: 'Lose the technician. Remaining crew morale dips.', detail_he: 'הטכנאי עוזב. המורל של שאר הצוות יורד.', effect: 'poach_lose' }
      ] },
    { id: 'storm', title: 'Severe Weather Front', title_he: 'חזית מזג אוויר קשה', weight: 12, minDay: 6,
      body: 'A storm cell is crossing your territories. Emergency call volume is about to spike — and so is risk.', body_he: 'תא סופה חוצה את אזורי הפעילות שלכם. נפח קריאות החירום עומד לזנק — וגם הסיכון.',
      options: [
        { label: 'Surge staffing', label_he: 'תגבור כוח אדם', detail: 'Pay overtime, +3 emergency calls at 1.5x value.', detail_he: 'תשלום שעות נוספות, +3 קריאות חירום בערך כפול 1.5.', effect: 'storm_surge' },
        { label: 'Ride it out', label_he: 'לספוג את הסערה', detail: 'Normal operations. Two calls go to a rival.', detail_he: 'פעילות רגילה. שתי קריאות עוברות למתחרה.', effect: 'storm_pass' }
      ] },
    { id: 'audit', title: 'Compliance Audit', title_he: 'ביקורת רגולטורית', weight: 8, minDay: 20,
      body: 'The regulator has scheduled a safety and records audit of your operation.', body_he: 'הרגולטור קבע ביקורת בטיחות ורישומים על הפעילות שלכם.',
      options: [
        { label: 'Full cooperation', label_he: 'שיתוף פעולה מלא', detail: 'Costs $12,000 in prep time. +6 CSAT.', detail_he: 'עלות של 12,000$ בזמן הכנה. שביעות רצון +6.', effect: 'audit_pass', cost: 12000 },
        { label: 'Minimum compliance', label_he: 'עמידה מינימלית', detail: 'Free, but 45% chance of a $28,000 fine.', detail_he: 'ללא עלות, אך 45% סיכוי לקנס של 28,000$.', effect: 'audit_risk' }
      ] },
    { id: 'breakdown', title: 'Unscheduled Breakdown', title_he: 'תקלה לא מתוכננת', weight: 11, minDay: 8, needFleet: true,
      body: 'A unit has thrown a fault code mid-route. The shop can take it today or you can nurse it along.', body_he: 'יחידה הציגה קוד תקלה באמצע הנסיעה. המוסך יכול לקלוט אותה היום, או שתמשיכו איתה בזהירות.',
      options: [
        { label: 'Full workshop repair', label_he: 'תיקון מלא במוסך', detail: 'Unit offline 1 day, condition restored to 100%.', detail_he: 'היחידה מושבתת ליום, המצב המכני חוזר ל‑100%.', effect: 'break_fix' },
        { label: 'Field patch', label_he: 'תיקון זמני בשטח', detail: 'Stay in service at −22% condition and higher failure risk.', detail_he: 'נשארת בשירות במצב מכני −22% ובסיכון כשל גבוה יותר.', effect: 'break_patch' }
      ] },
    { id: 'bulk_offer', title: 'Liquidation Auction', title_he: 'מכירת חיסול', weight: 7, minDay: 15,
      body: 'A failed competitor is liquidating. Their tooling is going for well under book value.', body_he: 'מתחרה שקרס מוכר את נכסיו. הציוד שלו נמכר הרבה מתחת לשווי בספרים.',
      options: [
        { label: 'Buy the lot', label_he: 'לרכוש את כל המכלול', detail: 'Random tool package at 55% of list price.', detail_he: 'מקבץ ציוד אקראי ב‑55% ממחיר המחירון.', effect: 'auction_buy' },
        { label: 'Pass', label_he: 'לוותר', detail: 'Preserve cash.', detail_he: 'שמירה על המזומן.', effect: 'none' }
      ] },
    { id: 'referral', title: 'Client Referral', title_he: 'הפניה מלקוח', weight: 13, minDay: 4,
      body: 'A satisfied client has referred you to their parent company. They want a proposal today.', body_he: 'לקוח מרוצה הפנה אתכם לחברת האם שלו. הם רוצים הצעה עוד היום.',
      options: [
        { label: 'Bid aggressively', label_he: 'להגיש הצעה אגרסיבית', detail: 'Spend $4,500 on the proposal for a premium contract offer.', detail_he: 'השקעה של 4,500$ בהצעה עבור חוזה פרימיום.', effect: 'ref_bid', cost: 4500 },
        { label: 'Standard quote', label_he: 'הצעת מחיר סטנדרטית', detail: 'Free. A routine contract offer appears.', detail_he: 'ללא עלות. תופיע הצעת חוזה רגילה.', effect: 'ref_std' }
      ] },
    { id: 'insurance', title: 'Insurance Renewal', title_he: 'חידוש ביטוח', weight: 8, minDay: 25,
      body: 'Your fleet policy is up for renewal. The broker has two structures on the table.', body_he: 'פוליסת הצי שלכם עומדת לחידוש. הסוכן הניח שתי חלופות על השולחן.',
      options: [
        { label: 'Comprehensive', label_he: 'ביטוח מקיף', detail: 'Pay $18,000 upfront. Vehicle wear −25% for 30 days.', detail_he: 'תשלום 18,000$ מראש. בלאי הרכבים −25% ל‑30 יום.', effect: 'ins_full', cost: 18000 },
        { label: 'Third party only', label_he: 'צד שלישי בלבד', detail: 'Save the premium, accept the exposure.', detail_he: 'חיסכון בפרמיה, תוך נטילת הסיכון.', effect: 'ins_min' }
      ] }
  ];

  FST.Config = C;
})(window.FST = window.FST || {});
