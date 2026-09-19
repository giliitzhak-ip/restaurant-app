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
import type { ScoreEventRecord, ShotRecord, TeamId } from './MatchState';

export interface ContactInput {
  /**
   * The shot this contact belongs to. Null means the ball was not struck by a
   * player, and the contact can never score.
   */
  shot: ShotRecord | null;
  kind: ScoreKind;
  /** Team credited if this contact scores. Null means the contact cannot score. */
  team: TeamId | null;
  /** True when the ball entered the net of the team that struck it. */
  ownGoal: boolean;
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
  shot: ShotRecord;
  kind: ScoreKind;
  team: TeamId;
  ownGoal: boolean;
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
    if (contact.shot === null) return 'no-shot';
    if (contact.team === null) return 'no-team';
    if (contact.speed < minSpeedFor(contact.kind)) return 'too-slow';
    const shotId = contact.shot.shotId;
    if (this.awarded.has(shotId)) return 'already-awarded';

    const cooldownKey = `${contact.ballId}|${contact.colliderId}`;
    const lastHit = this.colliderCooldowns.get(cooldownKey);
    if (
      lastHit !== undefined &&
      contact.time - lastHit < GameConfig.scoring.colliderCooldownSeconds
    ) {
      return 'collider-cooldown';
    }
    this.colliderCooldowns.set(cooldownKey, contact.time);

    const existing = this.pending.get(shotId);
    if (!existing) {
      this.pending.set(shotId, {
        shot: contact.shot,
        kind: contact.kind,
        team: contact.team,
        ownGoal: contact.ownGoal,
        tick: contact.tick,
        deadline: contact.time + GameConfig.scoring.windowSeconds,
      });
      return 'accepted';
    }

    if (priorityOf(contact.kind) < priorityOf(existing.kind)) {
      existing.kind = contact.kind;
      existing.team = contact.team;
      existing.ownGoal = contact.ownGoal;
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
    for (const [shotId, pending] of this.pending) {
      if (time < pending.deadline) continue;
      this.pending.delete(shotId);
      this.awarded.add(shotId);
      resolved.push({
        shotId,
        kind: pending.kind,
        team: pending.team,
        // An own goal is credited to the opponent's team but to no player.
        playerId: pending.ownGoal ? null : pending.shot.playerId,
        points: pointsFor(pending.kind),
        tick: pending.tick,
        ownGoal: pending.ownGoal,
        shotType: pending.shot.shotType,
        power: pending.shot.power,
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
