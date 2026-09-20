/**
 * The wire contract. Everything here is about refusing bad input rather than
 * accepting good input: the server hands whatever arrives on the socket to
 * these functions before the simulation ever sees it.
 */
import { describe, expect, it } from 'vitest';
import { createPlayerCommand } from '../src/input/PlayerCommand';
import {
  InputFlag,
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  isInviteCodeShape,
  normalizeInviteCode,
  PROTOCOL_VERSION,
  sanitizeDisplayName,
  sanitizeInput,
  toNetInput,
  toPlayerCommand,
} from '../src/net/protocol';

describe('protocol version', () => {
  it('is a whole number so a client can only match or mismatch', () => {
    expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
  });
});

describe('sanitizeInput', () => {
  const valid = {
    n: 4,
    mx: 0.5,
    my: -0.5,
    ax: 0,
    ay: 1,
    va: 0.25,
    sn: -0.5,
    pt: 1,
    f: InputFlag.Sprint,
  };

  it('accepts a well-formed input unchanged', () => {
    expect(sanitizeInput(valid)).toEqual(valid);
  });

  it('rejects anything that is not an input at all', () => {
    for (const bad of [null, undefined, 42, 'i', [], {}, { n: -1 }, { n: 1.5 }]) {
      expect(sanitizeInput(bad)).toBeNull();
    }
  });

  it('never lets a NaN or an Infinity reach the simulation', () => {
    const result = sanitizeInput({
      n: 1,
      mx: NaN,
      my: Infinity,
      ax: -Infinity,
      ay: NaN,
      va: NaN,
      sn: Infinity,
      pt: NaN,
      f: NaN,
    });
    expect(result).not.toBeNull();
    for (const value of Object.values(result ?? {})) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('clamps a stick that claims to be outside the unit disc', () => {
    const result = sanitizeInput({ n: 1, mx: 50, my: 50, ax: -90, ay: 0, f: 0 });
    expect(Math.hypot(result?.mx ?? 0, result?.my ?? 0)).toBeCloseTo(1, 6);
    expect(Math.hypot(result?.ax ?? 0, result?.ay ?? 0)).toBeCloseTo(1, 6);
  });

  it('drops flag bits that are not part of the protocol', () => {
    const result = sanitizeInput({ n: 1, mx: 0, my: 0, ax: 0, ay: 0, f: 0xffff });
    const known = Object.values(InputFlag).reduce((all, flag) => all | flag, 0);
    expect(result?.f).toBe(known);
    // And the unknown bits really were dropped rather than passed through.
    expect(result?.f).toBeLessThan(0xffff);
  });

  it('clamps the aim height and the spin, and refuses a nonsense pass target', () => {
    const result = sanitizeInput({ n: 1, mx: 0, my: 0, ax: 0, ay: 0, va: 9, sn: -9, pt: 99, f: 0 });
    expect(result?.va).toBe(1);
    expect(result?.sn).toBe(-1);
    expect(result?.pt).toBe(-1);

    const fractional = sanitizeInput({ n: 1, mx: 0, my: 0, ax: 0, ay: 0, pt: 1.5, f: 0 });
    expect(fractional?.pt).toBe(-1);

    const legal = sanitizeInput({ n: 1, mx: 0, my: 0, ax: 0, ay: 0, pt: 1, f: 0 });
    expect(legal?.pt).toBe(1);
  });
});

describe('command packing', () => {
  it('round-trips every field a controller can produce', () => {
    const command = createPlayerCommand('home-1', 7);
    Object.assign(command, {
      sequenceNumber: 12,
      moveX: 0.6,
      moveY: -0.8,
      aimX: 1,
      aimY: 0,
      sprintPressed: true,
      shootPressed: true,
      shootHeld: true,
      shootReleased: false,
      tacklePressed: true,
      lobToggle: true,
    });

    const restored = toPlayerCommand('home-1', 7, toNetInput(command));

    expect(restored).toEqual(command);
  });
});

describe('invite codes', () => {
  it('uses an alphabet without characters that are misread aloud', () => {
    for (const confusable of ['0', 'O', '1', 'I', 'L']) {
      expect(INVITE_ALPHABET).not.toContain(confusable);
    }
    expect(INVITE_CODE_LENGTH).toBeGreaterThanOrEqual(5);
  });

  it('accepts a code in any case and refuses anything else', () => {
    const code = INVITE_ALPHABET.slice(0, INVITE_CODE_LENGTH);
    expect(normalizeInviteCode(code.toLowerCase())).toBe(code);
    expect(normalizeInviteCode(`  ${code}  `)).toBe(code);
    expect(isInviteCodeShape(code)).toBe(true);

    for (const bad of ['', 'ABC', 'ABCDEF', 'ABC0D', '../etc', 42, null]) {
      expect(normalizeInviteCode(bad)).toBeNull();
    }
  });
});

describe('display names', () => {
  it('trims, caps the length and strips control characters', () => {
    expect(sanitizeDisplayName('  גיל  ')).toBe('גיל');
    expect(sanitizeDisplayName('א'.repeat(50))?.length).toBe(16);
    expect(sanitizeDisplayName('גי\u0000ל\u001b')).toBe('גיל');
  });

  it('refuses an empty name rather than inventing one', () => {
    for (const bad of ['', '   ', '\u0000', 7, null, undefined]) {
      expect(sanitizeDisplayName(bad)).toBeNull();
    }
  });
});
