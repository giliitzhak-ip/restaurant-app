/**
 * Ready state and who owns the room.
 *
 * Small on purpose: the room already has enough to do, and keeping "is
 * everybody ready" and "who is the host" out of it means both can be tested
 * without starting a server.
 */
export class LobbyManager {
  private readonly ready = new Set<string>();
  private hostSessionId: string | null = null;

  get host(): string | null {
    return this.hostSessionId;
  }

  isHost(sessionId: string): boolean {
    return this.hostSessionId === sessionId;
  }

  /** The first player through the door owns the room until they leave. */
  add(sessionId: string): void {
    this.hostSessionId ??= sessionId;
  }

  remove(sessionId: string, remaining: readonly string[]): void {
    this.ready.delete(sessionId);
    if (this.hostSessionId !== sessionId) return;
    // The room outlives its host: the next player in seat order takes over.
    this.hostSessionId = remaining.find((id) => id !== sessionId) ?? null;
  }

  setReady(sessionId: string, ready: boolean): void {
    if (ready) this.ready.add(sessionId);
    else this.ready.delete(sessionId);
  }

  isReady(sessionId: string): boolean {
    return this.ready.has(sessionId);
  }

  /** The sessions that have said yes. A shuffle leaves these where they are. */
  get readySessions(): ReadonlySet<string> {
    return this.ready;
  }

  clearReady(): void {
    this.ready.clear();
  }

  /** True when every seated player has said yes. */
  everyoneReady(sessions: readonly string[]): boolean {
    return sessions.length > 0 && sessions.every((id) => this.ready.has(id));
  }
}
