/**
 * biomes.js — map definitions. Pure data: terrain parameters, palettes,
 * landmark placement rules, weather options and mission objectives.
 */
'use strict';

const NO_SNOW = 1e6;

/** Weather presets, selectable per flight. */
export const WEATHER = {
  clear: {
    id: 'clear', name: 'Clear', icon: '☀',
    blurb: 'Crisp air, long sightlines. Best conditions for detail work.',
    windBase: 2.2, windGust: 1.6, fog: 0.45, cloudCover: 0.28, visibility: 2600,
    scoreBonus: 1.0,
  },
  breeze: {
    id: 'breeze', name: 'Sea Breeze', icon: '🍃',
    blurb: 'Steady lateral push. Rewards smooth counter-steering.',
    windBase: 6.5, windGust: 3.2, fog: 0.5, cloudCover: 0.42, visibility: 2300,
    scoreBonus: 1.08,
  },
  windy: {
    id: 'windy', name: 'High Wind', icon: '🌬',
    blurb: 'Strong gusts. Stability points are hard-won and worth more.',
    windBase: 11.5, windGust: 7.5, fog: 0.50, cloudCover: 0.5, visibility: 2300,
    scoreBonus: 1.22,
  },
  foggy: {
    id: 'foggy', name: 'Valley Fog', icon: '🌫',
    blurb: 'Short visibility, dreamy layers. Close-in framing scores big.',
    windBase: 1.2, windGust: 0.8, fog: 1.30, cloudCover: 0.62, visibility: 1250,
    scoreBonus: 1.18,
  },
  overcast: {
    id: 'overcast', name: 'Overcast', icon: '☁',
    blurb: 'Soft, even light. Forgiving exposure, muted colour.',
    windBase: 4.0, windGust: 2.4, fog: 0.80, cloudCover: 0.86, visibility: 1900,
    scoreBonus: 1.04,
  },
};

/** Time-of-day presets. `elev` is sun elevation in degrees. */
export const TIMES = {
  dawn: {
    id: 'dawn', name: 'Blue Dawn', icon: '🌒', elev: 3, azim: 65,
    blurb: 'Cold ambient light before sunrise.', lightBonus: 1.12,
  },
  golden: {
    id: 'golden', name: 'Golden Hour', icon: '🌅', elev: 9, azim: 105,
    blurb: 'Low warm rake across the terrain. Peak cinematography light.',
    lightBonus: 1.35,
  },
  midday: {
    id: 'midday', name: 'Midday', icon: '🌞', elev: 62, azim: 165,
    blurb: 'Flat, contrasty light. Hardest to score well in.', lightBonus: 0.85,
  },
  sunset: {
    id: 'sunset', name: 'Sunset', icon: '🌇', elev: 2, azim: 255,
    blurb: 'Deep amber sky with long shadows.', lightBonus: 1.3,
  },
  blue: {
    id: 'blue', name: 'Blue Hour', icon: '🌌', elev: -5, azim: 285,
    blurb: 'Post-sunset dusk. Moody, low contrast, aurora possible.',
    lightBonus: 1.2,
  },
};

export const MAPS = [
  {
    id: 'aiguille',
    name: 'Aiguille Ridge',
    subtitle: 'High Alpine · 3 200 m massif',
    seed: 20481,
    difficulty: 3,
    accent: '#8fc6ff',
    brief:
      'A granite massif above the treeline. Thin air, hard light and a ' +
      'thousand metres of vertical relief between the glacial tarns and the ' +
      'summit cross. Watch your battery on the climbs.',
    weather: ['clear', 'windy', 'overcast'],
    times: ['golden', 'dawn', 'midday', 'sunset'],
    defaultWeather: 'clear',
    defaultTime: 'golden',
    terrain: {
      waterLevel: 0,
      base: 58, warp: 95, warpFreq: 0.00085,
      contFreq: 0.00042, contLo: 0.33, contHi: 0.63, oceanDepth: 70,
      hillFreq: 0.00115, hillAmp: 88,
      ridgeFreq: 0.00082, ridgeAmp: 640, ridgeOct: 6, ridgeSharp: 1.65, ridgeMasked: true,
      carveFreq: 0.00068, carveAmp: 78, carveWidth: 0.12,
      detFreq: 0.021, detAmp: 10,
      terrace: 0, terraceMix: 0,
      colorLo: 0, colorHi: 520,
      rockSlopeLo: 0.28, rockSlopeHi: 0.60,
      snowLo: 330, snowHi: 470,
      beachWidth: 7,
      treeDensity: 0.55, treeLo: 15, treeHi: 300, treeKind: 'conifer',
    },
    palette: {
      low: [74, 100, 66], mid: [110, 116, 88], high: [136, 132, 124],
      rock: [116, 114, 112], snow: [244, 248, 253], sand: [174, 168, 150],
      deep: [24, 54, 78], shallow: [66, 126, 146], foam: [226, 240, 246],
    },
    landmarks: [
      { kind: 'summit_cross', count: 2, place: 'peak', value: 230, ideal: 90 },
      { kind: 'alpine_hut', count: 3, place: 'bench', value: 130, ideal: 70 },
      { kind: 'waterfall', count: 3, place: 'cliff', value: 190, ideal: 110 },
      { kind: 'tarn', count: 3, place: 'water', value: 150, ideal: 150 },
      { kind: 'cable_tower', count: 3, place: 'ridge', value: 120, ideal: 80 },
      { kind: 'eagle', count: 4, place: 'air', value: 200, ideal: 60 },
    ],
    objectives: [
      { id: 'cross', type: 'photoOf', kind: 'summit_cross', minAlt: 420,
        text: 'Photograph a summit cross from above 420 m', points: 450 },
      { id: 'fall', type: 'photoOf', kind: 'waterfall',
        text: 'Frame an alpine waterfall', points: 300 },
      { id: 'reel', type: 'clip', minDuration: 22,
        text: 'Bank one continuous clip of 22 s or more', points: 350 },
      { id: 'grade', type: 'photoGrade', count: 5, minScore: 620,
        text: 'Deliver 5 photos rated B or better', points: 400 },
    ],
  },

  {
    id: 'vellum',
    name: 'Cape Vellum',
    subtitle: 'Atlantic Coast · sea stacks & cliffs',
    seed: 77341,
    difficulty: 2,
    accent: '#5fd6c8',
    brief:
      'Basalt headlands dropping two hundred metres into the swell. The ' +
      'lighthouse is the money shot, but the arch and the stack colony reward ' +
      'anyone willing to fly low over the water.',
    weather: ['breeze', 'clear', 'windy', 'foggy'],
    times: ['sunset', 'golden', 'dawn', 'midday'],
    defaultWeather: 'breeze',
    defaultTime: 'sunset',
    terrain: {
      waterLevel: 0,
      base: 26, warp: 70, warpFreq: 0.00095,
      contFreq: 0.00050, contLo: 0.455, contHi: 0.565, oceanDepth: 150,
      hillFreq: 0.00165, hillAmp: 58,
      ridgeFreq: 0.00125, ridgeAmp: 175, ridgeOct: 5, ridgeSharp: 2.1, ridgeMasked: true,
      carveFreq: 0.00090, carveAmp: 34, carveWidth: 0.10,
      detFreq: 0.026, detAmp: 8,
      terrace: 0, terraceMix: 0,
      colorLo: -10, colorHi: 190,
      rockSlopeLo: 0.26, rockSlopeHi: 0.55,
      snowLo: NO_SNOW, snowHi: NO_SNOW,
      beachWidth: 11,
      treeDensity: 0.32, treeLo: 8, treeHi: 170, treeKind: 'wind_pine',
    },
    palette: {
      low: [74, 106, 64], mid: [126, 138, 86], high: [166, 154, 116],
      rock: [122, 116, 108], snow: [250, 250, 250], sand: [226, 210, 172],
      deep: [10, 42, 70], shallow: [44, 134, 150], foam: [236, 248, 250],
    },
    landmarks: [
      { kind: 'lighthouse', count: 1, place: 'coast', value: 300, ideal: 120 },
      { kind: 'sea_stack', count: 7, place: 'water', value: 150, ideal: 90 },
      { kind: 'arch', count: 2, place: 'coast', value: 240, ideal: 85 },
      { kind: 'shipwreck', count: 2, place: 'water', value: 210, ideal: 60 },
      { kind: 'cottage', count: 4, place: 'bench', value: 110, ideal: 65 },
      { kind: 'gulls', count: 5, place: 'air', value: 170, ideal: 55 },
    ],
    objectives: [
      { id: 'light', type: 'photoOf', kind: 'lighthouse',
        text: 'Photograph the Vellum lighthouse', points: 450 },
      { id: 'low', type: 'photoAlt', maxAlt: 35, count: 3,
        text: 'Take 3 photos below 35 m over the water', points: 350 },
      { id: 'reel', type: 'clip', minDuration: 18,
        text: 'Bank one continuous clip of 18 s or more', points: 300 },
      { id: 'arch', type: 'photoOf', kind: 'arch',
        text: 'Frame the sea arch', points: 350 },
    ],
  },

  {
    id: 'ferngrove',
    name: 'Ferngrove Basin',
    subtitle: 'Temperate Rainforest · river gorge',
    seed: 13907,
    difficulty: 3,
    accent: '#8ede7a',
    brief:
      'Old-growth conifers packed into a river gorge that holds fog until ' +
      'mid-morning. Tight flying between the canopy and the walls — the ' +
      'gorge run is where showreels are won or written off.',
    weather: ['foggy', 'clear', 'overcast', 'breeze'],
    times: ['dawn', 'golden', 'midday', 'sunset'],
    defaultWeather: 'foggy',
    defaultTime: 'dawn',
    terrain: {
      waterLevel: 0,
      base: 46, warp: 60, warpFreq: 0.0011,
      contFreq: 0.00055, contLo: 0.30, contHi: 0.60, oceanDepth: 45,
      hillFreq: 0.00170, hillAmp: 120,
      ridgeFreq: 0.00110, ridgeAmp: 270, ridgeOct: 5, ridgeSharp: 2.2, ridgeMasked: true,
      carveFreq: 0.00052, carveAmp: 105, carveWidth: 0.165,
      detFreq: 0.024, detAmp: 11,
      terrace: 0, terraceMix: 0,
      colorLo: 0, colorHi: 300,
      rockSlopeLo: 0.34, rockSlopeHi: 0.66,
      snowLo: 420, snowHi: 520,
      beachWidth: 6,
      treeDensity: 1.0, treeLo: 4, treeHi: 400, treeKind: 'redwood',
    },
    palette: {
      low: [50, 82, 50], mid: [62, 92, 56], high: [92, 104, 74],
      rock: [108, 104, 96], snow: [248, 250, 255], sand: [172, 160, 126],
      deep: [26, 58, 60], shallow: [72, 124, 112], foam: [232, 246, 242],
    },
    landmarks: [
      { kind: 'waterfall', count: 5, place: 'cliff', value: 240, ideal: 100 },
      { kind: 'ruins', count: 3, place: 'bench', value: 200, ideal: 70 },
      { kind: 'fire_tower', count: 2, place: 'ridge', value: 190, ideal: 80 },
      { kind: 'cottage', count: 3, place: 'bench', value: 110, ideal: 60 },
      { kind: 'deer', count: 5, place: 'ground', value: 220, ideal: 45 },
      { kind: 'heron', count: 4, place: 'air', value: 180, ideal: 50 },
    ],
    objectives: [
      { id: 'fall', type: 'photoOf', kind: 'waterfall',
        text: 'Photograph a gorge waterfall', points: 400 },
      { id: 'wild', type: 'photoOf', kind: 'deer',
        text: 'Capture wildlife without spooking it', points: 400 },
      { id: 'reel', type: 'clip', minDuration: 25,
        text: 'Bank one continuous clip of 25 s or more', points: 400 },
      { id: 'grade', type: 'photoGrade', count: 4, minScore: 650,
        text: 'Deliver 4 photos rated B or better', points: 350 },
    ],
  },

  {
    id: 'ochre',
    name: 'Ochre Mesa',
    subtitle: 'High Desert · canyon country',
    seed: 55219,
    difficulty: 2,
    accent: '#f0a35e',
    brief:
      'Layered sandstone benches cut by a dry canyon system. Nothing here ' +
      'blocks the light, so composition and altitude carry the whole score.',
    weather: ['clear', 'windy', 'breeze'],
    times: ['sunset', 'golden', 'midday', 'dawn'],
    defaultWeather: 'clear',
    defaultTime: 'sunset',
    terrain: {
      waterLevel: -28,
      base: 62, warp: 46, warpFreq: 0.0009,
      contFreq: 0.00048, contLo: 0.26, contHi: 0.58, oceanDepth: 40,
      hillFreq: 0.00140, hillAmp: 74,
      ridgeFreq: 0.00098, ridgeAmp: 300, ridgeOct: 5, ridgeSharp: 2.4, ridgeMasked: false,
      carveFreq: 0.00048, carveAmp: 165, carveWidth: 0.095,
      detFreq: 0.019, detAmp: 9,
      terrace: 26, terraceMix: 0.55,
      colorLo: -20, colorHi: 330,
      rockSlopeLo: 0.22, rockSlopeHi: 0.52,
      snowLo: NO_SNOW, snowHi: NO_SNOW,
      beachWidth: 8,
      treeDensity: 0.10, treeLo: 10, treeHi: 260, treeKind: 'juniper',
    },
    palette: {
      low: [186, 138, 96], mid: [178, 116, 78], high: [212, 172, 126],
      rock: [148, 96, 64], snow: [255, 255, 255], sand: [226, 196, 146],
      deep: [44, 72, 78], shallow: [96, 142, 138], foam: [240, 244, 236],
    },
    landmarks: [
      { kind: 'arch', count: 3, place: 'ridge', value: 260, ideal: 80 },
      { kind: 'hoodoo', count: 8, place: 'bench', value: 130, ideal: 55 },
      { kind: 'ruins', count: 3, place: 'cliff', value: 230, ideal: 60 },
      { kind: 'windmill', count: 3, place: 'bench', value: 140, ideal: 70 },
      { kind: 'condor', count: 4, place: 'air', value: 190, ideal: 55 },
    ],
    objectives: [
      { id: 'arch', type: 'photoOf', kind: 'arch',
        text: 'Photograph a sandstone arch', points: 420 },
      { id: 'high', type: 'photoAlt', minAlt: 260, count: 3,
        text: 'Take 3 photos from above 260 m', points: 330 },
      { id: 'reel', type: 'clip', minDuration: 20,
        text: 'Bank one continuous clip of 20 s or more', points: 320 },
      { id: 'ruins', type: 'photoOf', kind: 'ruins',
        text: 'Frame the cliff dwellings', points: 380 },
    ],
  },

  {
    id: 'nordfjell',
    name: 'Nordfjell Fjords',
    subtitle: 'Arctic Fjord · sheer walls, black water',
    seed: 90613,
    difficulty: 4,
    accent: '#b39dff',
    brief:
      'Drowned glacial valleys with walls that go from black water to snow ' +
      'in under a kilometre. Katabatic wind pours off the plateau without ' +
      'warning. The hardest map in the catalogue, and the best looking.',
    weather: ['windy', 'clear', 'foggy', 'overcast'],
    times: ['blue', 'dawn', 'golden', 'sunset'],
    defaultWeather: 'windy',
    defaultTime: 'blue',
    terrain: {
      waterLevel: 0,
      base: 34, warp: 110, warpFreq: 0.00070,
      contFreq: 0.00044, contLo: 0.445, contHi: 0.530, oceanDepth: 230,
      hillFreq: 0.00130, hillAmp: 66,
      ridgeFreq: 0.00076, ridgeAmp: 500, ridgeOct: 6, ridgeSharp: 1.55, ridgeMasked: true,
      carveFreq: 0.00050, carveAmp: 130, carveWidth: 0.135,
      detFreq: 0.020, detAmp: 9,
      terrace: 0, terraceMix: 0,
      colorLo: 0, colorHi: 420,
      rockSlopeLo: 0.24, rockSlopeHi: 0.56,
      snowLo: 255, snowHi: 385,
      beachWidth: 5,
      treeDensity: 0.5, treeLo: 6, treeHi: 260, treeKind: 'conifer',
    },
    palette: {
      low: [64, 86, 70], mid: [82, 92, 84], high: [122, 126, 128],
      rock: [100, 104, 110], snow: [238, 244, 252], sand: [148, 150, 148],
      deep: [8, 30, 46], shallow: [34, 88, 106], foam: [226, 240, 248],
    },
    landmarks: [
      { kind: 'waterfall', count: 6, place: 'cliff', value: 250, ideal: 120 },
      { kind: 'village', count: 2, place: 'coast', value: 240, ideal: 110 },
      { kind: 'sea_stack', count: 4, place: 'water', value: 150, ideal: 85 },
      { kind: 'cottage', count: 5, place: 'coast', value: 120, ideal: 55 },
      { kind: 'shipwreck', count: 2, place: 'water', value: 220, ideal: 55 },
      { kind: 'eagle', count: 5, place: 'air', value: 210, ideal: 55 },
    ],
    objectives: [
      { id: 'fall', type: 'photoOf', kind: 'waterfall', minAlt: 150,
        text: 'Photograph a fjord waterfall from above 150 m', points: 450 },
      { id: 'village', type: 'photoOf', kind: 'village',
        text: 'Frame the fjord village', points: 400 },
      { id: 'reel', type: 'clip', minDuration: 25,
        text: 'Bank one continuous clip of 25 s or more', points: 400 },
      { id: 'grade', type: 'photoGrade', count: 5, minScore: 640,
        text: 'Deliver 5 photos rated B or better', points: 420 },
    ],
  },
];

export function getMap(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}
