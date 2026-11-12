import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** AES-256-GCM. Output format: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptSecret(plain: string, keyB64: string): string {
  const key = parseKey(keyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(blob: string, keyB64: string): string {
  const [v, ivS, tagS, ctS] = blob.split(".");
  if (v !== "v1" || !ivS || !tagS || !ctS) throw new Error("Unsupported secret format");
  const decipher = createDecipheriv("aes-256-gcm", parseKey(keyB64), Buffer.from(ivS, "base64url"));
  decipher.setAuthTag(Buffer.from(tagS, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctS, "base64url")), decipher.final()]).toString("utf8");
}

function parseKey(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return key;
}

const SCRYPT = { N: 16384, r: 8, p: 1 } as const;

/**
 * Password hash format: scrypt.<salt b64url>.<hash b64url>
 * (No "$" characters — .env loaders expand "$name" as a variable and would corrupt the hash.)
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, SCRYPT);
  return `scrypt.${salt.toString("base64url")}.${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, saltB64, hashB64] = stored.trim().split(".");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  if (expected.length < 32) return false;
  const actual = scryptSync(password, Buffer.from(saltB64, "base64url"), expected.length, SCRYPT);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
