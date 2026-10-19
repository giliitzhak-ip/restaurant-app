import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const DEFAULT_PARAMS = { N: 2 ** 15, r: 8, p: 1 };
// 128 * N * r bytes = 32 MiB for the defaults; allow headroom above Node's 32 MiB default.
const MAX_MEMORY = 128 * 1024 * 1024;

/** Hash format: scrypt$N$r$p$<salt base64>$<key base64> — self-describing for future upgrades. */
export async function hashPassword(password: string, params = DEFAULT_PARAMS): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    ...params,
    maxmem: MAX_MEMORY,
  });
  return [
    'scrypt',
    params.N,
    params.r,
    params.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const N = Number(n);
  const rr = Number(r);
  const pp = Number(p);
  if (![N, rr, pp].every((value) => Number.isInteger(value) && value > 0)) return false;

  const expected = Buffer.from(keyB64 ?? '', 'base64');
  if (expected.length === 0) return false;
  const actual = await scrypt(
    password.normalize('NFKC'),
    Buffer.from(saltB64 ?? '', 'base64'),
    expected.length,
    {
      N,
      r: rr,
      p: pp,
      maxmem: MAX_MEMORY,
    },
  );
  return timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same CPU time as a real verification. Used when the account does not exist so
 * response timing does not reveal which emails are registered.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await dummyHash);
  return false;
}
