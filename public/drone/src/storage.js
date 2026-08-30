/**
 * storage.js — settings and the local records table. Fails soft: private mode
 * or a blocked localStorage just means nothing persists.
 */
'use strict';

const SETTINGS_KEY = 'skyline.settings.v1';
const SCORES_KEY = 'skyline.records.v1';

const DEFAULT_SETTINGS = {
  quality: 'medium',
  touchControls: 'auto',
  firstRun: true,
  invertY: false,
  sensitivity: 1,
  guides: true,
  hud: true,
  grain: true,
  pilot: 'PILOT',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSettings() {
  return read(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export function saveSettings(s) {
  return write(SETTINGS_KEY, s);
}

export function loadRecords() {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

/** Returns { rank, isBest, records } for the map. */
export function saveRecord(mapId, entry) {
  const all = loadRecords();
  const list = all[mapId] || [];
  list.push(entry);
  list.sort((a, b) => b.total - a.total);
  const rank = list.indexOf(entry) + 1;
  all[mapId] = list.slice(0, 10);
  write(SCORES_KEY, all);
  return { rank, isBest: rank === 1, records: all[mapId] };
}

export function bestFor(mapId) {
  const all = loadRecords();
  const list = all[mapId];
  return list && list.length ? list[0] : null;
}

export function clearRecords() {
  write(SCORES_KEY, {});
}
