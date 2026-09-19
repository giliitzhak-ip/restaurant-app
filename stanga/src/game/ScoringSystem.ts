/**
 * ScoringSystem — pure rules, no engine dependency.
 *
 * Contracts it guarantees:
 *  - every shot (shotId) produces at most one scoring event;
 *  - when several contacts belong to the same shot, the highest-value one wins
 *    (junction > crossbar > post > goal);
 *  - the same collider cannot re-trigger for the same ball inside a cooldown;
 *  - slow, accidental contacts never score.
 */
import { GameConfig, pointsFor, priorityOf, type ScoreKind } from '../config/GameConfig';
import type { ScoreEventRecord, TeamId } from './MatchState';

export interface ContactInput {
  /** Identifies the shot this contact belongs to. Null means "not from a kick". */
  shotId: string | null;
  kind: ScoreKind;
  /** Team credited if this contact scores. Null means the contact cannot score. */
  team: TeamId | null;
  /** Stable id of the collider that was hit (e.g. "away:crossbar"). */
  colliderId: string;
  ballId: string;
  /** Impact speed in m/s. */
  speed: number;
  /** Simulation time in seconds. */
  time: number;
  tick: number;
}

export type ContactRejection =
  | 'accepted'
  | 'no-shot'
  | 'no-team'
  | 'too-slow'
  | 'already-awarded'
  | 'collider-cooldown'
  | 'lower-priority';

interface PendingShot {
  shotId: string;
  kind: ScoreKind;
  team: TeamId;
  tick: number;
  deadline: number;
}

/** Frame hits need real pace; crossing the goal line does not. */
export function minSpeedFor(kind: ScoreKind): number {
  return kind === 'goal' ? GameConfig.scoring.minGoalSpeed : GameConfig.scoring.minContactSpeed;
}

export class ScoringSystem {
  private readonly pending = new Map<string, PendingShot>();
  private readonly awarded = new Set<string>();
  private readonly colliderCooldowns = new Map<string, number>();

  /**
   * Feeds a physical contact into the scoring rules.
   * Returns why the contact was accepted or ignored — useful for tests and debugging.
   */
  registerContact(contact: ContactInput): ContactRejection {
    if (contact.shotId === null) return 'no-shot';
    if (contact.team === null) return 'no-team';
    if (contact.speed < minSpeedFor(contact.kind)) return 'too-slow';
    if (this.awarded.has(contact.shotId)) return 'already-awarded';

    const cooldownKey = `${contact.ballId}|${contact.colliderId}`;
    const lastHit = this.colliderCooldowns.get(cooldownKey);
    if (
      lastHit !== undefined &&
      contact.time - lastHit < GameConfig.scoring.colliderCooldownSeconds
    ) {
      return 'collider-cooldown';
    }
    this.colliderCooldowns.set(cooldownKey, contact.time);

    const existing = this.pending.get(contact.shotId);
    if (!existing) {
      this.pending.set(contact.shotId, {
        shotId: contact.shotId,
        kind: contact.kind,
        team: contact.team,
        tick: contact.tick,
        deadline: contact.time + GameConfig.scoring.windowSeconds,
      });
      return 'accepted';
    }

    if (priorityOf(contact.kind) < priorityOf(existing.kind)) {
      existing.kind = contact.kind;
      existing.team = contact.team;
      existing.tick = contact.tick;
      return 'accepted';
    }
    return 'lower-priority';
  }

  /**
   * Resolves every shot whose decision window has closed.
   * Call once per simulation tick with the current simulation time.
   */
  update(time: number): ScoreEventRecord[] {
    const resolved: ScoreEventRecord[] = [];
    for (const [shotId, shot] of this.pending) {
      if (time < shot.deadline) continue;
      this.pending.delete(shotId);
      this.awarded.add(shotId);
      resolved.push({
        shotId: shot.shotId,
        kind: shot.kind,
        team: shot.team,
        points: pointsFor(shot.kind),
        tick: shot.tick,
      });
    }
    return resolved;
  }

  /** True while a shot still has an undecided contact window. */
  hasPending(shotId: string): boolean {
    return this.pending.has(shotId);
  }

  /** True once a shot has produced its single scoring event. */
  hasAwarded(shotId: string): boolean {
    return this.awarded.has(shotId);
  }

  /** Clears per-shot bookkeeping. Cooldowns are dropped too, since the ball is reset. */
  reset(): void {
    this.pending.clear();
    this.awarded.clear();
    this.colliderCooldowns.clear();
  }

  /** Drops cooldown entries older than the window so the map cannot grow forever. */
  prune(time: number): void {
    for (const [key, when] of this.colliderCooldowns) {
      if (time - when > GameConfig.scoring.colliderCooldownSeconds * 4) {
        this.colliderCooldowns.delete(key);
      }
    }
  }
}
