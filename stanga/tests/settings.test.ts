import { describe, expect, it } from 'vitest';
import {
  SETTINGS_STORAGE_KEY,
  clearSettings,
  defaultAccessibility,
  defaultSettings,
  isLegacyRecord,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  type StorageLike,
} from '../src/core/Settings';
import { defaultLeftKeyMap, defaultRightKeyMap } from '../src/input/KeyBindings';
import { GameConfig } from '../src/config/GameConfig';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('blocked');
  }
  setItem(): void {
    throw new Error('blocked');
  }
  removeItem(): void {
    throw new Error('blocked');
  }
}

describe('settings persistence', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings(new MemoryStorage())).toEqual(defaultSettings());
  });

  it('saves and loads a round trip', () => {
    const storage = new MemoryStorage();
    const settings = {
      ...defaultSettings(),
      masterVolume: 0.25,
      musicVolume: 0,
      sensitivity: 1.6,
      quality: 'high' as const,
      vibration: false,
      difficulty: 'hard' as const,
    };
    expect(saveSettings(settings, storage)).toBe(true);
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).not.toBeNull();
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('survives corrupted stored data', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_STORAGE_KEY, '{not json');
    expect(loadSettings(storage)).toEqual(defaultSettings());
  });

  it('clamps and repairs out-of-range values', () => {
    const repaired = sanitizeSettings({
      masterVolume: 12,
      musicVolume: -4,
      sensitivity: 99,
      // 'ultra' became a real preset in 0.4.0, so the unknown value here has
      // to be one that genuinely is not a level.
      quality: 'cinematic',
      vibration: 'yes',
      difficulty: 'impossible',
    });
    expect(repaired.masterVolume).toBe(1);
    expect(repaired.musicVolume).toBe(0);
    expect(repaired.sensitivity).toBe(GameConfig.input.sensitivityMax);
    expect(repaired.quality).toBe('medium');
    // Vibration ships off: support across browsers is not reliable enough.
    expect(repaired.vibration).toBe(false);
    expect(repaired.difficulty).toBe('normal');
  });

  it('ignores non-object payloads', () => {
    expect(sanitizeSettings(null)).toEqual(defaultSettings());
    expect(sanitizeSettings(42)).toEqual(defaultSettings());
    expect(sanitizeSettings('nope')).toEqual(defaultSettings());
  });

  it('never throws when storage is unavailable', () => {
    const storage = new ThrowingStorage();
    expect(loadSettings(storage)).toEqual(defaultSettings());
    expect(saveSettings(defaultSettings(), storage)).toBe(false);
  });

  it('upgrades a 0.1.0 record in place without losing anything', () => {
    const storage = new MemoryStorage();
    // Exactly what version 0.1.0 wrote: no accessibility, bindings or profiles.
    const legacy = {
      masterVolume: 0.45,
      musicVolume: 0.1,
      sensitivity: 1.4,
      quality: 'high',
      vibration: true,
      difficulty: 'hard',
    };
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(legacy));
    expect(isLegacyRecord(legacy)).toBe(true);

    const loaded = loadSettings(storage);

    // Everything the player had chosen in 0.1.0 survives.
    expect(loaded.masterVolume).toBeCloseTo(0.45);
    expect(loaded.musicVolume).toBeCloseTo(0.1);
    expect(loaded.sensitivity).toBeCloseTo(1.4);
    expect(loaded.quality).toBe('high');
    expect(loaded.vibration).toBe(true);
    expect(loaded.difficulty).toBe('hard');

    // And the new options arrive at their defaults rather than undefined.
    expect(loaded.accessibility).toEqual(defaultAccessibility());
    expect(loaded.keyBindings.left).toEqual(defaultLeftKeyMap());
    expect(loaded.keyBindings.right).toEqual(defaultRightKeyMap());
    expect(loaded.cameraShake).toBe('subtle');
    expect(loaded.profiles.player1.name).toBe('שחקן 1');
    expect(loaded.seenControlsPrimer).toBe(false);
  });

  it('writes the upgraded record back to the same storage key', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ masterVolume: 0.3 }));
    const loaded = loadSettings(storage);
    saveSettings(loaded, storage);

    const stored = JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(isLegacyRecord(stored)).toBe(false);
    expect(stored.keyBindings).toBeDefined();
    expect(loadSettings(storage).masterVolume).toBeCloseTo(0.3);
  });

  it('repairs a corrupted key map instead of leaving a player unable to move', () => {
    const repaired = sanitizeSettings({
      keyBindings: {
        left: { up: [], down: 'nope', left: ['KeyA'], right: null },
        right: 'not an object',
      },
    });
    expect(repaired.keyBindings.left.up).toEqual(defaultLeftKeyMap().up);
    expect(repaired.keyBindings.left.down).toEqual(defaultLeftKeyMap().down);
    expect(repaired.keyBindings.left.left).toEqual(['KeyA']);
    expect(repaired.keyBindings.right).toEqual(defaultRightKeyMap());
  });

  it('clamps the dead zone and the aim assist', () => {
    const repaired = sanitizeSettings({ deadZone: 5, aimAssist: -3 });
    expect(repaired.deadZone).toBe(GameConfig.input.deadZoneMax);
    expect(repaired.aimAssist).toBe(0);
  });

  it('trims and bounds player names', () => {
    const repaired = sanitizeSettings({
      profiles: {
        player1: { name: '   ', colorId: 99 },
        player2: { name: '  שם ארוך מאוד מאוד מאוד מאוד  ', colorId: -2 },
      },
    });
    expect(repaired.profiles.player1.name).toBe('שחקן 1');
    expect(repaired.profiles.player1.colorId).toBeLessThan(GameConfig.kits.length);
    expect(repaired.profiles.player2.name.length).toBeLessThanOrEqual(16);
    expect(repaired.profiles.player2.colorId).toBeGreaterThanOrEqual(0);
  });

  it('clears stored settings', () => {
    const storage = new MemoryStorage();
    saveSettings(defaultSettings(), storage);
    clearSettings(storage);
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
  });
});
