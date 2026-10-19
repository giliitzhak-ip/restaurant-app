import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { allProviderStatuses } from "@/providers/registry";

const run = promisify(execFile);

export type Check = { ok: boolean; detail: string };

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

async function checkDb(): Promise<Check> {
  try {
    await withTimeout(db.$queryRaw`SELECT 1`, 3000);
    return { ok: true, detail: "PostgreSQL מחובר" };
  } catch (e) {
    return { ok: false, detail: `PostgreSQL לא זמין: ${(e as Error).message}` };
  }
}

async function checkRedis(): Promise<Check> {
  try {
    const pong = await withTimeout(redis().ping(), 3000);
    return { ok: pong === "PONG", detail: "Redis מחובר" };
  } catch (e) {
    return { ok: false, detail: `Redis לא זמין: ${(e as Error).message}` };
  }
}

async function checkBinary(bin: string): Promise<Check> {
  try {
    const { stdout } = await withTimeout(run(bin, ["-version"]), 5000);
    const first = stdout.split("\n")[0] ?? "";
    return { ok: true, detail: first.match(/^\S+ version \S+/)?.[0] ?? first.slice(0, 40) };
  } catch {
    return { ok: false, detail: `${bin} לא נמצא` };
  }
}

export async function systemStatus() {
  const [database, queue, ffmpeg, ffprobe] = await Promise.all([
    checkDb(),
    checkRedis(),
    checkBinary(process.env.FFMPEG_PATH || "ffmpeg"),
    checkBinary(process.env.FFPROBE_PATH || "ffprobe"),
  ]);
  return {
    checks: { database, queue, ffmpeg, ffprobe },
    providers: allProviderStatuses(),
    storageConfigured: Boolean(process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID),
  };
}
