/**
 * Invite code ⇄ room id, stored in Colyseus Presence.
 *
 * Presence rather than a module-level Map on purpose: with the Redis presence
 * driver the very same code works across several server processes, so nothing
 * here has to be rewritten to scale out.
 *
 * An invite code is a *shareable* identifier. It is never a reconnect token,
 * and it never grants anything beyond "this is which room to knock on" — the
 * room still runs its own join checks.
 */
import { randomInt } from 'node:crypto';
import type { Presence } from '@colyseus/core';
import { INVITE_ALPHABET, INVITE_CODE_LENGTH } from '../net/protocol';

const HASH_KEY = 'stanga:invites';

function randomCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  }
  return code;
}

export class InviteRegistry {
  constructor(private readonly presence: Presence) {}

  /**
   * Claims an unused code for a room. Presence has no atomic set-if-absent, so
   * this reads before writing; with a 31^5 space and a handful of live rooms a
   * collision needs two rooms to draw the same code inside the same
   * millisecond, and the only consequence is that one invite resolves to the
   * other room, which the joining client then finds full.
   */
  async claim(roomId: string, attempts = 8): Promise<string> {
    for (let i = 0; i < attempts; i += 1) {
      const code = randomCode();
      const existing = await this.presence.hget(HASH_KEY, code);
      if (existing === null || existing === roomId) {
        await this.presence.hset(HASH_KEY, code, roomId);
        return code;
      }
    }
    throw new Error('could not allocate an invite code');
  }

  async resolve(code: string): Promise<string | null> {
    return (await this.presence.hget(HASH_KEY, code)) ?? null;
  }

  async release(code: string): Promise<void> {
    if (code.length === 0) return;
    await this.presence.hdel(HASH_KEY, code);
  }
}
