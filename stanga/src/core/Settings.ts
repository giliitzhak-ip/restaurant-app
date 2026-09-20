/**
 * Player settings with validated persistence and a safe upgrade path.
 *
 * Version 0.1.0 stored a flat object under `stanga.settings.v1`. Version 0.2.0
 * adds accessibility options, key bindings and player profiles to the SAME key:
 * an unknown field is filled from the defaults, so a returning player keeps
 * their volumes, difficulty and quality and simply gains the new options.
 */
import {
  GameConfig,
  type Difficulty,
  type HudScale,
  type QualityLevel,
  type ShakeLevel,
} from '../config/GameConfig';
import {
  defaultLeftKeyMap,
  defaultRightKeyMap,
  sanitizeKeyMap,
  type KeyMap,
} from '../input/KeyBindings';
import { clamp } from './math';

export interface AccessibilitySettings {
  /** Stronger HUD contrast and heavier outlines. */
  highContrast: boolean;
  /** Suppresses screen flashes and the frame glow. */
  reduceFlashes: boolean;
  /** Slows camera movement and disables the zoom pulse. */
  reduceCameraMotion: boolean;
  hudScale: HudScale;
  /** Shows a written caption for important audio cues. */
  audioCaptions: boolean;
  /** Hides quick-chat phrases from other players. */
  muteQuickChat: boolean;
}

export interface PlayerProfile {
  name: string;
  colorId: number;
}

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sensitivity: number;
  quality: QualityLevel;
  vibration: boolean;
  difficulty: Difficulty;
  /** Gamepad and virtual-stick dead zone. */
  deadZone: number;
  cameraShake: ShakeLevel;
  /** Shot-direction assist strength, 0..1. Zero switches it off entirely. */
  aimAssist: number;
  accessibility: AccessibilitySettings;
  keyBindings: { left: KeyMap; right: KeyMap };
  profiles: { player1: PlayerProfile; player2: PlayerProfile };
  /** False until the player has seen the controls primer once. */
  seenControlsPrimer: boolean;
  /** Separate flag: the 2×2 primer teaches things 1×1 never mentions. */
  seenTeamPrimer: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SETTINGS_STORAGE_KEY = 'stanga.settings.v1';

const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high', 'ultra'];
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const SHAKE_LEVELS: readonly ShakeLevel[] = ['off', 'subtle', 'normal'];
const HUD_SCALES: readonly HudScale[] = ['small', 'normal', 'large'];

export function defaultAccessibility(): AccessibilitySettings {
  return {
    highContrast: false,
    reduceFlashes: false,
    reduceCameraMotion: false,
    hudScale: 'normal',
    audioCaptions: false,
    muteQuickChat: false,
  };
}

export function defaultSettings(): GameSettings {
  return {
    masterVolume: GameConfig.audio.masterVolumeDefault,
    musicVolume: GameConfig.audio.musicVolumeDefault,
    sensitivity: GameConfig.input.sensitivityDefault,
    quality: 'medium',
    // Vibration support is unreliable across browsers, so it stays off unless asked for.
    vibration: false,
    difficulty: 'normal',
    deadZone: GameConfig.input.deadZone,
    cameraShake: 'subtle',
    aimAssist: 0.6,
    accessibility: defaultAccessibility(),
    keyBindings: { left: defaultLeftKeyMap(), right: defaultRightKeyMap() },
    profiles: {
      player1: { name: 'שחקן 1', colorId: 0 },
      player2: { name: 'שחקן 2', colorId: 1 },
    },
    seenControlsPrimer: false,
    seenTeamPrimer: false,
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

function coerceBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function coerceName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : fallback;
}

function sanitizeProfile(raw: unknown, fallback: PlayerProfile): PlayerProfile {
  if (typeof raw !== 'object' || raw === null) return { ...fallback };
  const source = raw as Record<string, unknown>;
  return {
    name: coerceName(source.name, fallback.name),
    colorId: Math.round(
      coerceNumber(source.colorId, fallback.colorId, 0, GameConfig.kits.length - 1),
    ),
  };
}

/** Normalizes any untrusted object into a valid settings record. */
export function sanitizeSettings(raw: unknown): GameSettings {
  const defaults = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return defaults;
  const source = raw as Record<string, unknown>;

  const accessibilityRaw =
    typeof source.accessibility === 'object' && source.accessibility !== null
      ? (source.accessibility as Record<string, unknown>)
      : {};
  const bindingsRaw =
    typeof source.keyBindings === 'object' && source.keyBindings !== null
      ? (source.keyBindings as Record<string, unknown>)
      : {};
  const profilesRaw =
    typeof source.profiles === 'object' && source.profiles !== null
      ? (source.profiles as Record<string, unknown>)
      : {};

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
    vibration: coerceBool(source.vibration, defaults.vibration),
    difficulty: coerceEnum(source.difficulty, DIFFICULTIES, defaults.difficulty),
    deadZone: coerceNumber(
      source.deadZone,
      defaults.deadZone,
      GameConfig.input.deadZoneMin,
      GameConfig.input.deadZoneMax,
    ),
    cameraShake: coerceEnum(source.cameraShake, SHAKE_LEVELS, defaults.cameraShake),
    aimAssist: coerceNumber(source.aimAssist, defaults.aimAssist, 0, 1),
    accessibility: {
      highContrast: coerceBool(accessibilityRaw.highContrast, defaults.accessibility.highContrast),
      reduceFlashes: coerceBool(
        accessibilityRaw.reduceFlashes,
        defaults.accessibility.reduceFlashes,
      ),
      reduceCameraMotion: coerceBool(
        accessibilityRaw.reduceCameraMotion,
        defaults.accessibility.reduceCameraMotion,
      ),
      hudScale: coerceEnum(accessibilityRaw.hudScale, HUD_SCALES, defaults.accessibility.hudScale),
      audioCaptions: coerceBool(
        accessibilityRaw.audioCaptions,
        defaults.accessibility.audioCaptions,
      ),
      muteQuickChat: coerceBool(
        accessibilityRaw.muteQuickChat,
        defaults.accessibility.muteQuickChat,
      ),
    },
    keyBindings: {
      left: sanitizeKeyMap(bindingsRaw.left, defaults.keyBindings.left),
      right: sanitizeKeyMap(bindingsRaw.right, defaults.keyBindings.right),
    },
    profiles: {
      player1: sanitizeProfile(profilesRaw.player1, defaults.profiles.player1),
      player2: sanitizeProfile(profilesRaw.player2, defaults.profiles.player2),
    },
    seenControlsPrimer: coerceBool(source.seenControlsPrimer, defaults.seenControlsPrimer),
    seenTeamPrimer: coerceBool(source.seenTeamPrimer, defaults.seenTeamPrimer),
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
    // sanitizeSettings is the migration: unknown fields fall back to defaults,
    // so a 0.1.0 record upgrades in place without losing anything.
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

/** True when the stored record predates 0.2.0 and was upgraded on load. */
export function isLegacyRecord(raw: unknown): boolean {
  return (
    typeof raw === 'object' && raw !== null && !('keyBindings' in (raw as Record<string, unknown>))
  );
}
