/**
 * Who sits where.
 *
 * Teams and slots are the server's alone. A client can *ask* to change team;
 * it can never state which team it is on, and nothing it sends is ever used to
 * work out where a player belongs.
 *
 * The manager knows nothing about sockets or Colyseus: it deals in opaque
 * session ids, which makes it straightforward to test and impossible for it to
 * reach into the room by accident.
 */
import type { TeamId } from '../game/MatchState';
import type { MatchConfig, Seat } from '../game/MatchConfig';

export interface SeatAssignment {
  readonly seat: Seat;
  sessionId: string | null;
}

export type TeamSwitchResult =
  | 'ok'
  /** The team the player asked for already has its full complement. */
  | 'teamFull'
  /** Teams are locked once the countdown has begun. */
  | 'locked'
  /** That session does not hold a seat here. */
  | 'noSeat'
  /** Already there; nothing to do. */
  | 'unchanged';

export class TeamManager {
  private readonly assignments: SeatAssignment[];

  constructor(private readonly config: MatchConfig) {
    this.assignments = config.seats.map((seat) => ({ seat, sessionId: null }));
  }

  get seats(): readonly SeatAssignment[] {
    return this.assignments;
  }

  /** Seats with somebody in them, in seat order. */
  occupied(): SeatAssignment[] {
    return this.assignments.filter((assignment) => assignment.sessionId !== null);
  }

  freeSeatCount(): number {
    return this.assignments.length - this.occupied().length;
  }

  seatFor(sessionId: string): SeatAssignment | undefined {
    return this.assignments.find((assignment) => assignment.sessionId === sessionId);
  }

  seatOf(playerId: string): SeatAssignment | undefined {
    return this.assignments.find((assignment) => assignment.seat.playerId === playerId);
  }

  /**
   * Puts a session in a seat, preferring the team that is short-handed so a
   * room fills up balanced rather than three against one.
   */
  claim(sessionId: string): SeatAssignment | null {
    if (this.seatFor(sessionId)) return null;

    const byTeam = this.countByTeam();
    const preferred: TeamId = byTeam.home <= byTeam.away ? 'home' : 'away';

    const free = this.assignments.filter((assignment) => assignment.sessionId === null);
    const inPreferred = free.find((assignment) => assignment.seat.team === preferred);
    const chosen = inPreferred ?? free[0];
    if (!chosen) return null;

    chosen.sessionId = sessionId;
    return chosen;
  }

  release(sessionId: string): SeatAssignment | null {
    const assignment = this.seatFor(sessionId);
    if (!assignment) return null;
    assignment.sessionId = null;
    return assignment;
  }

  /**
   * Moves a player to the other team, if there is room and the match has not
   * started. The player keeps their identity and simply occupies a different
   * seat, which is what lets the simulation stay ignorant of lobbies.
   */
  requestSwitch(sessionId: string, team: TeamId, teamsLocked: boolean): TeamSwitchResult {
    if (teamsLocked) return 'locked';
    const current = this.seatFor(sessionId);
    if (!current) return 'noSeat';
    if (current.seat.team === team) return 'unchanged';

    const target = this.assignments.find(
      (assignment) => assignment.seat.team === team && assignment.sessionId === null,
    );
    if (!target) return 'teamFull';

    target.sessionId = sessionId;
    current.sessionId = null;
    return 'ok';
  }

  /**
   * Redeals at random into the seats that are already taken, so the teams keep
   * exactly the sizes they had and nobody is moved into an empty room.
   *
   * A session in `frozen` keeps its seat: the host may propose a shuffle, but
   * somebody who has already said they are ready is not dragged across the
   * pitch under them. Only the rest are dealt, among the seats they held.
   */
  shuffle(random: () => number, frozen: ReadonlySet<string> = new Set()): void {
    const movable = this.occupied().filter(
      (assignment) => assignment.sessionId !== null && !frozen.has(assignment.sessionId),
    );
    const sessions = movable.map((assignment) => assignment.sessionId);
    for (let i = sessions.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const a = sessions[i] ?? null;
      sessions[i] = sessions[j] ?? null;
      sessions[j] = a;
    }
    for (let i = 0; i < movable.length; i += 1) {
      const assignment = movable[i];
      if (assignment) assignment.sessionId = sessions[i] ?? null;
    }
  }

  /** True when every team has exactly the right number of players. */
  teamsComplete(): boolean {
    const byTeam = this.countByTeam();
    return byTeam.home === this.config.playersPerTeam && byTeam.away === this.config.playersPerTeam;
  }

  countByTeam(): Record<TeamId, number> {
    const counts: Record<TeamId, number> = { home: 0, away: 0 };
    for (const assignment of this.occupied()) counts[assignment.seat.team] += 1;
    return counts;
  }
}
