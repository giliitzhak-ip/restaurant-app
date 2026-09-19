import { describe, expect, it } from 'vitest';
import {
  SETTINGS_STORAGE_KEY,
  clearSettings,
  defaultSettings,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  type StorageLike,
} from '../src/core/Settings';
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
      quality: 'ultra',
      vibration: 'yes',
      difficulty: 'impossible',
    });
    expect(repaired.masterVolume).toBe(1);
    expect(repaired.musicVolume).toBe(0);
    expect(repaired.sensitivity).toBe(GameConfig.input.sensitivityMax);
    expect(repaired.quality).toBe('medium');
    expect(repaired.vibration).toBe(true);
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

  it('clears stored settings', () => {
    const storage = new MemoryStorage();
    saveSettings(defaultSettings(), storage);
    clearSettings(storage);
    expect(storage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
  });
});
