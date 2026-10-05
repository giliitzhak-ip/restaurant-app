import type { Lang } from './i18n';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface Settings {
  lang: Lang;
  volume: number;
  sensitivity: number;
  quality: Quality;
  dynamicRes: boolean;
  reduceEffects: boolean;
  showFps: boolean;
  leftHanded: boolean;
  name: string;
  paddle: string;
  tutorialDone: boolean;
}

const KEY = 'pingpong3d.settings.v1';

export function defaultQuality(): Quality {
  if (typeof window === 'undefined') return 'high';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (coarse) return cores >= 8 ? 'medium' : 'low';
  return cores >= 8 ? 'high' : 'medium';
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'he',
  volume: 0.8,
  sensitivity: 1,
  quality: defaultQuality(),
  dynamicRes: true,
  reduceEffects: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  showFps: false,
  leftHanded: false,
  name: '',
  paddle: 'red',
  tutorialDone: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
