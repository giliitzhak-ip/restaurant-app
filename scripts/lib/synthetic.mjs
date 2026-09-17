/**
 * Deterministic synthetic provider generation (spec §21–§30).
 *
 * Every value derives from a seeded PRNG, so the same SEED always produces
 * the same network. That is what makes matching regressions debuggable: a
 * ranking that changes means the CODE changed, not the data.
 *
 * Nothing here is a real person. Names are assembled from common Hebrew
 * given/family names, and the module never produces a photograph — avatars
 * are initials rendered client-side (spec §20, §60).
 */

/** mulberry32 — small, fast, well-distributed, and reproducible. */
export function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** Integer in [min, max]. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** Float in [min, max). */
    float: (min, max) => min + next() * (max - min),
    /** Uniform pick. */
    pick: (items) => items[Math.floor(next() * items.length)],
    /** True with probability p. */
    chance: (p) => next() < p,
    /**
     * Weighted pick. `entries` is [[value, weight], …] — used wherever the
     * distribution matters more than the range (ratings, availability shapes).
     */
    weighted: (entries) => {
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    /** Normal-ish via central limit; clamped. */
    gaussian: (mean, stdDev, min, max) => {
      const sum = next() + next() + next() + next() + next() + next();
      const value = mean + ((sum - 3) / 3) * stdDev * 1.75;
      return Math.min(max, Math.max(min, value));
    },
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

/* ────────────────────────────── Names ─────────────────────────────────── */

const GIVEN_M = [
  'יוסי', 'אבי', 'משה', 'דוד', 'עמית', 'איתי', 'רן', 'גיא', 'תומר', 'ניר',
  'שי', 'אורי', 'רועי', 'מאור', 'נדב', 'עידן', 'ליאור', 'יניב', 'אלון', 'כפיר',
  'סהר', 'זיו', 'עומר', 'בר', 'דן', 'רם', 'שגיא', 'נועם', 'אסף', 'ברק',
  'חיים', 'יעקב', 'שלמה', 'מרדכי', 'אליהו', 'יצחק', 'שמעון', 'רפאל', 'בנימין', 'נתן',
];
const GIVEN_F = [
  'דנה', 'שירה', 'נועה', 'מיכל', 'יעל', 'אורלי', 'הילה', 'תמר', 'רותם', 'ליאת',
  'סיגל', 'מירב', 'אדווה', 'קרן', 'ענת', 'שני', 'מאיה', 'עדי', 'גלית', 'אפרת',
  'לימור', 'רונית', 'חן', 'טל', 'אביגיל', 'אסתר', 'רחל', 'לאה', 'שרה', 'מלכה',
];
const FAMILY = [
  'לוי', 'כהן', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אברהם', 'פרידמן', 'אזולאי', 'גבאי',
  'חדד', 'אוחיון', 'עמר', 'שלום', 'בן דוד', 'מלכה', 'סבן', 'אלבז', 'זוהר', 'טל',
  'אדרי', 'שרעבי', 'נחום', 'ברששת', 'וקנין', 'סיסו', 'אלימלך', 'הרוש', 'קדם', 'נגר',
  'שמש', 'רביבו', 'אסולין', 'בוזגלו', 'יוספי', 'גולן', 'אופיר', 'רגב', 'נאמן', 'כץ',
  'אביטן', 'לוינסון', 'שפירא', 'רוזן', 'ברקוביץ', 'גרינברג', 'הלוי', 'סגל', 'אדלר', 'פישר',
];

/* ──────────────────────── Geography (Israel) ──────────────────────────── */

/**
 * Real Israeli localities with deliberately uneven weights, so the seeded
 * network has dense urban cores, ordinary suburbs and thin peripheries —
 * the conditions that make radius expansion and "no provider found" testable
 * (spec §24).
 *
 * Coordinates are approximate city centres. Providers are scattered around
 * them with a spread proportional to the locality, and no synthetic provider
 * is ever given a real street address.
 */
export const REGIONS = [
  { name: 'תל אביב',        lat: 32.0853, lon: 34.7818, spreadKm: 5.5, weight: 170, density: 'urban' },
  { name: 'רמת גן',         lat: 32.0684, lon: 34.8248, spreadKm: 3.0, weight: 60,  density: 'urban' },
  { name: 'גבעתיים',        lat: 32.0723, lon: 34.8122, spreadKm: 2.0, weight: 28,  density: 'urban' },
  { name: 'בת ים',          lat: 32.0171, lon: 34.7457, spreadKm: 2.5, weight: 30,  density: 'urban' },
  { name: 'חולון',          lat: 32.0117, lon: 34.7745, spreadKm: 3.5, weight: 45,  density: 'urban' },
  { name: 'ראשון לציון',    lat: 31.9730, lon: 34.7925, spreadKm: 4.5, weight: 62,  density: 'suburban' },
  { name: 'פתח תקווה',      lat: 32.0870, lon: 34.8882, spreadKm: 4.0, weight: 58,  density: 'suburban' },
  { name: 'הרצליה',         lat: 32.1624, lon: 34.8447, spreadKm: 3.5, weight: 40,  density: 'suburban' },
  { name: 'רעננה',          lat: 32.1848, lon: 34.8713, spreadKm: 3.0, weight: 30,  density: 'suburban' },
  { name: 'כפר סבא',        lat: 32.1750, lon: 34.9070, spreadKm: 3.0, weight: 28,  density: 'suburban' },
  { name: 'נתניה',          lat: 32.3215, lon: 34.8532, spreadKm: 4.5, weight: 45,  density: 'suburban' },
  { name: 'ירושלים',        lat: 31.7683, lon: 35.2137, spreadKm: 6.5, weight: 120, density: 'urban' },
  { name: 'בית שמש',        lat: 31.7497, lon: 34.9885, spreadKm: 3.0, weight: 20,  density: 'suburban' },
  { name: 'חיפה',           lat: 32.7940, lon: 34.9896, spreadKm: 5.5, weight: 85,  density: 'urban' },
  { name: 'קריות',          lat: 32.8300, lon: 35.0800, spreadKm: 4.0, weight: 30,  density: 'suburban' },
  { name: 'עכו',            lat: 32.9281, lon: 35.0818, spreadKm: 2.5, weight: 14,  density: 'periphery' },
  { name: 'נהריה',          lat: 33.0058, lon: 35.0950, spreadKm: 2.5, weight: 12,  density: 'periphery' },
  { name: 'באר שבע',        lat: 31.2518, lon: 34.7913, spreadKm: 5.0, weight: 48,  density: 'suburban' },
  { name: 'אשדוד',          lat: 31.8014, lon: 34.6435, spreadKm: 4.0, weight: 40,  density: 'suburban' },
  { name: 'אשקלון',         lat: 31.6688, lon: 34.5742, spreadKm: 3.5, weight: 26,  density: 'suburban' },
  { name: 'רחובות',         lat: 31.8928, lon: 34.8113, spreadKm: 3.0, weight: 26,  density: 'suburban' },
  { name: 'מודיעין',        lat: 31.8928, lon: 35.0104, spreadKm: 3.0, weight: 22,  density: 'suburban' },
  { name: 'טבריה',          lat: 32.7922, lon: 35.5312, spreadKm: 2.5, weight: 10,  density: 'periphery' },
  { name: 'צפת',            lat: 32.9646, lon: 35.4960, spreadKm: 2.0, weight: 7,   density: 'periphery' },
  { name: 'קרית שמונה',     lat: 33.2075, lon: 35.5695, spreadKm: 2.0, weight: 6,   density: 'periphery' },
  { name: 'אילת',           lat: 29.5577, lon: 34.9519, spreadKm: 3.0, weight: 8,   density: 'periphery' },
  { name: 'דימונה',         lat: 31.0686, lon: 35.0333, spreadKm: 2.0, weight: 6,   density: 'periphery' },
  { name: 'עפולה',          lat: 32.6078, lon: 35.2897, spreadKm: 2.5, weight: 10,  density: 'periphery' },
  { name: 'חדרה',           lat: 32.4340, lon: 34.9196, spreadKm: 3.0, weight: 18,  density: 'suburban' },
  { name: 'לוד',            lat: 31.9515, lon: 34.8953, spreadKm: 2.5, weight: 16,  density: 'suburban' },
  { name: 'רמלה',           lat: 31.9293, lon: 34.8663, spreadKm: 2.5, weight: 15,  density: 'suburban' },
  { name: 'נצרת',           lat: 32.6996, lon: 35.3035, spreadKm: 3.0, weight: 16,  density: 'periphery' },
];

/** Category mix, deliberately uneven — plumbers and electricians dominate. */
export const CATEGORY_WEIGHTS = [
  ['plumbing', 26],
  ['electrical', 22],
  ['air_conditioning', 16],
  ['locksmith', 9],
  ['pest_control', 8],
  ['cleaning', 12],
  ['gardening', 7],
];

/**
 * Availability shapes. Each produces a different eligibility profile, which
 * is the point: matching tests need providers who are online now, providers
 * who only work mornings, providers on holiday, and providers whose phone
 * stopped reporting an hour ago (spec §28).
 */
export const AVAILABILITY_SHAPES = [
  ['online_now', 30],        // switched on, broad weekly hours
  ['online_narrow', 10],     // switched on, but narrow planned hours
  ['offline_scheduled', 18], // off now, real hours later — the §52 case
  ['busy', 6],               // mid-job
  ['mornings', 7],
  ['evenings', 6],
  ['weekend_only', 4],
  ['split_shift', 5],
  ['on_vacation', 4],        // date overrides covering the next days
  ['temporary_today', 4],    // a short window today only
  ['stale_location', 4],     // online but last fix is old
  ['no_schedule', 2],        // never declared hours; realtime switch only
];

const DAY_PATTERNS = {
  // Israeli working week: Sunday–Thursday, short Friday, Saturday off.
  standard:    [[0, '08:00', '18:00'], [1, '08:00', '18:00'], [2, '08:00', '18:00'], [3, '08:00', '18:00'], [4, '08:00', '18:00'], [5, '08:00', '13:00']],
  long:        [[0, '07:00', '20:00'], [1, '07:00', '20:00'], [2, '07:00', '20:00'], [3, '07:00', '20:00'], [4, '07:00', '20:00'], [5, '07:00', '14:00']],
  mornings:    [[0, '06:00', '12:00'], [1, '06:00', '12:00'], [2, '06:00', '12:00'], [3, '06:00', '12:00'], [4, '06:00', '12:00']],
  evenings:    [[0, '16:00', '23:00'], [1, '16:00', '23:00'], [2, '16:00', '23:00'], [3, '16:00', '23:00'], [4, '16:00', '23:00']],
  weekend:     [[4, '16:00', '23:00'], [5, '07:00', '14:00'], [6, '19:00', '23:00']],
  split:       [[0, '08:00', '13:00'], [0, '16:00', '20:00'], [1, '08:00', '13:00'], [1, '16:00', '20:00'], [2, '08:00', '13:00'], [2, '16:00', '20:00'], [3, '08:00', '13:00'], [3, '16:00', '20:00']],
  narrow:      [[0, '09:00', '12:00'], [2, '09:00', '12:00'], [4, '09:00', '12:00']],
  emergency:   [[0, '00:00', '23:59'], [1, '00:00', '23:59'], [2, '00:00', '23:59'], [3, '00:00', '23:59'], [4, '00:00', '23:59'], [5, '00:00', '23:59'], [6, '00:00', '23:59']],
};

export function scheduleFor(shape, random) {
  switch (shape) {
    case 'mornings': return DAY_PATTERNS.mornings;
    case 'evenings': return DAY_PATTERNS.evenings;
    case 'weekend_only': return DAY_PATTERNS.weekend;
    case 'split_shift': return DAY_PATTERNS.split;
    case 'online_narrow': return DAY_PATTERNS.narrow;
    case 'no_schedule': return [];
    default:
      return random.weighted([
        [DAY_PATTERNS.standard, 5],
        [DAY_PATTERNS.long, 3],
        [DAY_PATTERNS.emergency, 1],
      ]);
  }
}

/**
 * Rating and review count, generated together so they stay consistent
 * (spec §26): a long record cannot carry a wild average, and a brand-new
 * provider gets no rating at all rather than a misleading 0.0.
 */
export function reputationFor(random) {
  const tier = random.weighted([
    ['new', 8],        // no jobs, no reviews, no rating
    ['fresh', 12],     // a handful of jobs
    ['solid', 34],
    ['strong', 28],
    ['excellent', 14],
    ['struggling', 4],
  ]);

  switch (tier) {
    case 'new':
      return { tier, ratingAvg: null, ratingCount: 0, completedJobs: 0, cancelledJobs: 0, years: random.int(0, 3) };
    case 'fresh': {
      const count = random.int(1, 9);
      return {
        tier,
        ratingAvg: Number(random.gaussian(4.6, 0.45, 3.2, 5).toFixed(2)),
        ratingCount: count,
        completedJobs: count + random.int(0, 4),
        cancelledJobs: random.int(0, 1),
        years: random.int(0, 4),
      };
    }
    case 'solid': {
      const count = random.int(10, 120);
      return {
        tier,
        ratingAvg: Number(random.gaussian(4.5, 0.3, 3.6, 5).toFixed(2)),
        ratingCount: count,
        completedJobs: Math.round(count * random.float(1.1, 1.6)),
        cancelledJobs: random.int(1, 12),
        years: random.int(2, 12),
      };
    }
    case 'strong': {
      const count = random.int(120, 600);
      return {
        tier,
        ratingAvg: Number(random.gaussian(4.7, 0.2, 4.0, 5).toFixed(2)),
        ratingCount: count,
        completedJobs: Math.round(count * random.float(1.1, 1.5)),
        cancelledJobs: random.int(4, 40),
        years: random.int(5, 20),
      };
    }
    case 'excellent': {
      const count = random.int(600, 2400);
      return {
        tier,
        ratingAvg: Number(random.gaussian(4.85, 0.1, 4.5, 5).toFixed(2)),
        ratingCount: count,
        completedJobs: Math.round(count * random.float(1.1, 1.4)),
        cancelledJobs: random.int(10, 90),
        years: random.int(8, 30),
      };
    }
    case 'struggling':
    default: {
      const count = random.int(15, 200);
      return {
        tier,
        ratingAvg: Number(random.gaussian(3.7, 0.4, 2.6, 4.3).toFixed(2)),
        ratingCount: count,
        completedJobs: Math.round(count * random.float(1.0, 1.3)),
        cancelledJobs: random.int(15, 70),
        years: random.int(1, 15),
      };
    }
  }
}

/** Scatter a point around a locality centre. */
export function scatter(region, random) {
  // Uniform over the disc, not over the radius, so providers do not bunch at
  // the centre.
  const angle = random.float(0, Math.PI * 2);
  const distanceKm = region.spreadKm * Math.sqrt(random.next());
  const dLat = (distanceKm / 111.32) * Math.cos(angle);
  const dLon = (distanceKm / (111.32 * Math.cos((region.lat * Math.PI) / 180))) * Math.sin(angle);
  return {
    lat: Number((region.lat + dLat).toFixed(6)),
    lon: Number((region.lon + dLon).toFixed(6)),
  };
}

export function nameFor(random) {
  const feminine = random.chance(0.22);
  const given = random.pick(feminine ? GIVEN_F : GIVEN_M);
  return { fullName: `${given} ${random.pick(FAMILY)}`, feminine };
}

export function weightedRegion(random) {
  return random.weighted(REGIONS.map((r) => [r, r.weight]));
}

export function weightedCategory(random) {
  return random.weighted(CATEGORY_WEIGHTS);
}
