import type { GameEvent, Snapshot } from './game';
import { type PaddleInput, sanitizeInput } from './paddle';

export const PROTOCOL_VERSION = 1;
export const PADDLE_STYLES = ['red', 'blue', 'black', 'green', 'purple', 'gold'] as const;
export type PaddleStyle = (typeof PADDLE_STYLES)[number];
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MAX_NAME = 16;
export const MAX_MESSAGE_BYTES = 2048;

export interface RoomSettings {
  bestOf: 1 | 3;
  assist: 'arcade' | 'advanced';
}

export interface PlayerInfo {
  name: string;
  paddle: PaddleStyle;
  ready: boolean;
  connected: boolean;
}

// ───────────── client → server ─────────────
export type ClientMsg =
  | { t: 'create'; v: number; name: string; paddle: PaddleStyle; settings: RoomSettings }
  | { t: 'join'; v: number; code: string; name: string; paddle: PaddleStyle }
  | { t: 'resume'; v: number; code: string; token: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'profile'; name: string; paddle: PaddleStyle }
  | { t: 'input'; seq: number; i: PaddleInput }
  | { t: 'ping'; id: number }
  | { t: 'rematch' }
  | { t: 'leave' };

// ───────────── server → client ─────────────
export type ErrorCode =
  | 'ROOM_FULL'
  | 'ROOM_NOT_FOUND'
  | 'BAD_MESSAGE'
  | 'RATE_LIMITED'
  | 'SERVER_FULL'
  | 'VERSION_MISMATCH'
  | 'SESSION_EXPIRED';

export type RoomPhase = 'lobby' | 'playing' | 'finished';

export type ServerMsg =
  | { t: 'joined'; code: string; side: 0 | 1; token: string; settings: RoomSettings }
  | { t: 'room'; code: string; phase: RoomPhase; players: (PlayerInfo | null)[]; settings: RoomSettings; rematch: [boolean, boolean] }
  | { t: 'start'; seed: number; firstServer: 0 | 1; settings: RoomSettings }
  | { t: 'state'; s: Snapshot; ev: GameEvent[]; st: number }
  | { t: 'paused'; reason: 'opponentDisconnected'; until: number }
  | { t: 'resumed' }
  | { t: 'pong'; id: number; st: number }
  | { t: 'error'; code: ErrorCode; msg?: string }
  | { t: 'closed'; reason: 'opponentLeft' | 'abandoned' | 'timeout' };

// ───────────── validation ─────────────
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
const isInt = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;

export function cleanName(x: unknown): string | null {
  if (!isStr(x, 64)) return null;
  // Strip control / bidi-override characters; collapse whitespace.
  const s = x
    .replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
  return s.length >= 1 ? s : null;
}

export const isPaddleStyle = (x: unknown): x is PaddleStyle => typeof x === 'string' && (PADDLE_STYLES as readonly string[]).includes(x);

export const normalizeCode = (x: unknown): string | null => {
  if (typeof x !== 'string') return null;
  const c = x.trim().toUpperCase();
  if (c.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of c) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return c;
};

function cleanSettings(x: unknown): RoomSettings | null {
  if (!isObj(x)) return null;
  const bestOf = x.bestOf === 3 ? 3 : x.bestOf === 1 ? 1 : null;
  const assist = x.assist === 'advanced' ? 'advanced' : x.assist === 'arcade' ? 'arcade' : null;
  if (!bestOf || !assist) return null;
  return { bestOf, assist };
}

/** Parse and validate an untrusted client message. Returns null if invalid. */
export function parseClientMsg(raw: string): ClientMsg | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(m) || typeof m.t !== 'string') return null;
  switch (m.t) {
    case 'create': {
      const name = cleanName(m.name);
      const settings = cleanSettings(m.settings);
      if (!isInt(m.v, 0, 1000) || !name || !isPaddleStyle(m.paddle) || !settings) return null;
      return { t: 'create', v: m.v, name, paddle: m.paddle, settings };
    }
    case 'join': {
      const name = cleanName(m.name);
      const code = normalizeCode(m.code);
      if (!isInt(m.v, 0, 1000) || !name || !code || !isPaddleStyle(m.paddle)) return null;
      return { t: 'join', v: m.v, code, name, paddle: m.paddle };
    }
    case 'resume': {
      const code = normalizeCode(m.code);
      if (!isInt(m.v, 0, 1000) || !code || !isStr(m.token, 64) || !/^[A-Za-z0-9_-]{16,64}$/.test(m.token)) return null;
      return { t: 'resume', v: m.v, code, token: m.token };
    }
    case 'ready':
      return typeof m.ready === 'boolean' ? { t: 'ready', ready: m.ready } : null;
    case 'profile': {
      const name = cleanName(m.name);
      return name && isPaddleStyle(m.paddle) ? { t: 'profile', name, paddle: m.paddle } : null;
    }
    case 'input': {
      if (!isInt(m.seq, 0, 2 ** 31) || !isObj(m.i)) return null;
      const i = m.i;
      for (const k of ['x', 'y', 'tilt', 'spin', 'act'] as const) {
        if (typeof i[k] !== 'number' || !Number.isFinite(i[k])) return null;
      }
      if (typeof i.power !== 'boolean') return null;
      return { t: 'input', seq: m.seq, i: sanitizeInput(i as Partial<PaddleInput>) };
    }
    case 'ping':
      return isInt(m.id, 0, 2 ** 31) ? { t: 'ping', id: m.id } : null;
    case 'rematch':
      return { t: 'rematch' };
    case 'leave':
      return { t: 'leave' };
    default:
      return null;
  }
}
