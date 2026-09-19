/**
 * Player settings with validated persistence.
 * Storage is injectable so the rules can be tested without a browser.
 */
import { GameConfig, type Difficulty, type QualityLevel } from '../config/GameConfig';
import { clamp } from './math';

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sensitivity: number;
  quality: QualityLevel;
  vibration: boolean;
  difficulty: Difficulty;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SETTINGS_STORAGE_KEY = 'stanga.settings.v1';

const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export function defaultSettings(): GameSettings {
  return {
    masterVolume: GameConfig.audio.masterVolumeDefault,
    musicVolume: GameConfig.audio.musicVolumeDefault,
    sensitivity: GameConfig.input.sensitivityDefault,
    quality: 'medium',
    vibration: true,
    difficulty: 'normal',
  };
}

function coerceNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function coerceEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Normalizes any untrusted object into a valid settings record. */
export function sanitizeSettings(raw: unknown): GameSettings {
  const defaults = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return defaults;
  const source = raw as Record<string, unknown>;
  return {
    masterVolume: coerceNumber(source.masterVolume, defaults.masterVolume, 0, 1),
    musicVolume: coerceNumber(source.musicVolume, defaults.musicVolume, 0, 1),
    sensitivity: coerceNumber(
      source.sensitivity,
      defaults.sensitivity,
      GameConfig.input.sensitivityMin,
      GameConfig.input.sensitivityMax,
    ),
    quality: coerceEnum(source.quality, QUALITY_LEVELS, defaults.quality),
    vibration: typeof source.vibration === 'boolean' ? source.vibration : defaults.vibration,
    difficulty: coerceEnum(source.difficulty, DIFFICULTIES, defaults.difficulty),
  };
}

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Private browsing modes can throw on access.
    return null;
  }
}

export function loadSettings(storage?: StorageLike): GameSettings {
  const target = resolveStorage(storage);
  if (!target) return defaultSettings();
  try {
    const raw = target.getItem(SETTINGS_STORAGE_KEY);
    if (raw === null) return defaultSettings();
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: GameSettings, storage?: StorageLike): boolean {
  const target = resolveStorage(storage);
  if (!target) return false;
  try {
    target.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

export function clearSettings(storage?: StorageLike): void {
  resolveStorage(storage)?.removeItem(SETTINGS_STORAGE_KEY);
}
