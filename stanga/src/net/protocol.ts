/**
 * The wire contract between the STANGA client and the authoritative server.
 *
 * Both sides import this one file, so a change can never be applied to only
 * half of the conversation. Anything arriving from the network is untrusted:
 * every inbound shape has a `sanitize*` function here, and the server uses it
 * before the value reaches the simulation.
 */
import { createPlayerCommand, type PlayerCommand } from '../input/PlayerCommand';
import type { TeamId } from '../game/MatchState';

/**
 * Bumped whenever the wire format or the simulation rules change in a way that
 * would make an older client disagree with the server. Clients that send a
 * different value are rejected with a Hebrew "please refresh" message.
 */
export const PROTOCOL_VERSION = 1;

/** Colyseus room name for online 1×1. Stage 4 adds a second name for 2×2. */
export const ROOM_ONE_VS_ONE = 'stanga_1v1';

/** Online modes. `twoVsTwo` is deliberately absent until stage 4 ships it. */
export type OnlineMode = 'oneVsOne';

/** How a client wants to be placed into a room. */
export type JoinIntent =
  /** Matchmaking: any public room with a free slot, otherwise a new one. */
  | 'quick'
  /** Create a private room and receive its invite code. */
  | 'create'
  /** Join a specific private room by its invite code. */
  | 'join';

export interface JoinOptions {
  protocolVersion: number;
  intent: JoinIntent;
  displayName: string;
  /** Required for `intent: 'join'`, ignored otherwise. */
  inviteCode?: string;
  /** Preferred kit. The server still decides, so two players never clash. */
  colorId?: number;
}

// ── Message names ─────────────────────────────────────────────────────────────
// Short strings: these travel on every tick, and Colyseus sends the name itself.

export const ClientMessage = {
  /** One tick of intent. The only message that can move a player. */
  Input: 'i',
  /** Lobby: this client is ready to kick off. */
  Ready: 'r',
  /** Round-trip time probe. */
  Ping: 'p',
  /** Vote to play again after the final whistle. */
  Rematch: 'm',
} as const;
export type ClientMessageName = (typeof ClientMessage)[keyof typeof ClientMessage];

export const ServerMessage = {
  /** Sent once, right after a successful join. */
  Welcome: 'w',
  /** Answer to Ping, echoing the client's own clock. */
  Pong: 'q',
  /** A gameplay event worth a sound or a banner (goal, post, tackle…). */
  Event: 'e',
  /** The client's simulation is too far from the server's; hard-reset it. */
  Resync: 'y',
} as const;
export type ServerMessageName = (typeof ServerMessage)[keyof typeof ServerMessage];

/** Why a join or a session was refused. The client maps these to Hebrew text. */
export const RejectReason = {
  ProtocolMismatch: 'protocolMismatch',
  RoomNotFound: 'roomNotFound',
  RoomFull: 'roomFull',
  MatchInProgress: 'matchInProgress',
  RateLimited: 'rateLimited',
  InvalidName: 'invalidName',
} as const;
export type RejectReasonCode = (typeof RejectReason)[keyof typeof RejectReason];

/** Thrown by the server so Colyseus delivers the code to the client. */
export interface RejectPayload {
  reason: RejectReasonCode;
  protocolVersion: number;
}

// ── Input ─────────────────────────────────────────────────────────────────────

/** Bit positions inside `NetInput.f`. */
export const InputFlag = {
  Sprint: 1 << 0,
  ShootPressed: 1 << 1,
  ShootHeld: 1 << 2,
  ShootReleased: 1 << 3,
  TacklePressed: 1 << 4,
  LobToggle: 1 << 5,
} as const;

const ALL_FLAGS =
  InputFlag.Sprint |
  InputFlag.ShootPressed |
  InputFlag.ShootHeld |
  InputFlag.ShootReleased |
  InputFlag.TacklePressed |
  InputFlag.LobToggle;

/**
 * One tick of intent on the wire. Short keys because this is the only message
 * sent at tick rate; the flags are packed so the payload stays under 32 bytes.
 */
export interface NetInput {
  /** Monotonic per-client sequence number; the server acknowledges the last one. */
  n: number;
  /** Movement on the ground plane, world space, already inside the unit disc. */
  mx: number;
  my: number;
  /** Facing request, world space. Zero length means "keep facing". */
  ax: number;
  ay: number;
  /** Packed InputFlag bits. */
  f: number;
}

/** The client's clock probe. Echoed verbatim so RTT needs no server clock. */
export interface NetPing {
  t: number;
}

export interface NetPong {
  /** The `t` the client sent. */
  t: number;
  /** Server tick when the pong was produced, for clock estimation. */
  tick: number;
}

/**
 * Note what is *not* here: a reconnect token. Colyseus already hands the client
 * its own `room.reconnectionToken`, and keeping the two apart is deliberate —
 * an invite code is meant to be shared, a reconnect token proves identity and
 * must never be shared, pasted into a chat, or written to a log.
 */
export interface WelcomePayload {
  protocolVersion: number;
  /** Simulation identity inside the match, e.g. `home-1`. */
  playerId: string;
  team: TeamId;
  mode: OnlineMode;
  /** Private-room code. Empty for a matchmade room. */
  inviteCode: string;
  /** Fixed tick length in seconds, so the client predicts on the same clock. */
  tickSeconds: number;
}

/** A gameplay event, already reduced to what a client needs to react to. */
export interface NetEvent {
  kind: 'kick' | 'tackle' | 'frameHit' | 'wallHit' | 'scored' | 'kickoff' | 'matchEnd';
  playerId?: string;
  team?: TeamId | null;
  /** Free-form detail: goal part, score kind, outcome. */
  detail?: string;
  points?: number;
  speed?: number;
}

// ── Validation ────────────────────────────────────────────────────────────────

const MAX_NAME_LENGTH = 16;

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampToUnitDisc(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (length <= 1 || length === 0) return { x, y };
  return { x: x / length, y: y / length };
}

/**
 * Turns whatever arrived on the socket into a NetInput, or null if it is not
 * one. Never throws, never trusts a magnitude, and never lets a NaN through —
 * a NaN reaching the physics body would corrupt the whole match.
 */
export function sanitizeInput(raw: unknown): NetInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Partial<Record<keyof NetInput, unknown>>;

  const sequence = finite(value.n, -1);
  if (sequence < 0 || !Number.isInteger(sequence)) return null;

  const move = clampToUnitDisc(finite(value.mx), finite(value.my));
  const aim = clampToUnitDisc(finite(value.ax), finite(value.ay));
  const flags = finite(value.f) & ALL_FLAGS;

  return { n: sequence, mx: move.x, my: move.y, ax: aim.x, ay: aim.y, f: flags };
}

/** Expands a validated NetInput into the command the simulation consumes. */
export function toPlayerCommand(
  playerId: string,
  tickId: number,
  input: NetInput,
  target = createPlayerCommand(playerId, tickId),
): PlayerCommand {
  target.playerId = playerId;
  target.tickId = tickId;
  target.sequenceNumber = input.n;
  target.moveX = input.mx;
  target.moveY = input.my;
  target.aimX = input.ax;
  target.aimY = input.ay;
  target.sprintPressed = (input.f & InputFlag.Sprint) !== 0;
  target.shootPressed = (input.f & InputFlag.ShootPressed) !== 0;
  target.shootHeld = (input.f & InputFlag.ShootHeld) !== 0;
  target.shootReleased = (input.f & InputFlag.ShootReleased) !== 0;
  target.tacklePressed = (input.f & InputFlag.TacklePressed) !== 0;
  target.lobToggle = (input.f & InputFlag.LobToggle) !== 0;
  return target;
}

/** Packs a local command for the wire. The inverse of `toPlayerCommand`. */
export function toNetInput(command: PlayerCommand): NetInput {
  let flags = 0;
  if (command.sprintPressed) flags |= InputFlag.Sprint;
  if (command.shootPressed) flags |= InputFlag.ShootPressed;
  if (command.shootHeld) flags |= InputFlag.ShootHeld;
  if (command.shootReleased) flags |= InputFlag.ShootReleased;
  if (command.tacklePressed) flags |= InputFlag.TacklePressed;
  if (command.lobToggle) flags |= InputFlag.LobToggle;
  return {
    n: command.sequenceNumber,
    mx: command.moveX,
    my: command.moveY,
    ax: command.aimX,
    ay: command.aimY,
    f: flags,
  };
}

/**
 * Invite codes avoid characters that are easy to misread aloud or to confuse
 * in a Hebrew-RTL text field (0/O, 1/I/L).
 */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 5;

export function isInviteCodeShape(code: string): boolean {
  if (code.length !== INVITE_CODE_LENGTH) return false;
  for (const character of code) {
    if (!INVITE_ALPHABET.includes(character)) return false;
  }
  return true;
}

export function normalizeInviteCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return isInviteCodeShape(code) ? code : null;
}

/**
 * Display names are shown to the other player, so they are trimmed, length
 * capped and stripped of control characters. An empty result is rejected
 * rather than silently replaced, so the UI can say what went wrong.
 */
export function sanitizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, MAX_NAME_LENGTH);
}
