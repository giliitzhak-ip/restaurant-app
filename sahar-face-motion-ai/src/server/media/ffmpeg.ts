import { spawn } from "node:child_process";

/**
 * Runs ffmpeg with machine-readable progress. `onProgress` receives 0..1
 * computed from out_time against the known input duration.
 */
export function runFfmpeg(
  args: string[],
  opts: { durationSec?: number | null; onProgress?: (fraction: number) => void; timeoutMs?: number } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-nostdin", "-y", "-progress", "pipe:1", "-nostats", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let buf = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), opts.timeoutMs ?? 20 * 60_000);

    proc.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        const m = line.match(/^out_time_us=(\d+)/);
        if (m && opts.durationSec && opts.onProgress) {
          opts.onProgress(Math.min(1, Number(m[1]) / 1e6 / opts.durationSec));
        }
      }
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${signal ?? code}): ${stderr.split("\n").slice(-6).join(" | ")}`));
    });
  });
}

/** Even dimension capped so the shorter side is at most `maxShort` px (keeps aspect ratio). */
export function scaleShortSide(maxShort: number): string {
  return `scale='if(gte(iw,ih),-2,trunc(min(${maxShort},iw)/2)*2)':'if(gte(iw,ih),trunc(min(${maxShort},ih)/2)*2,-2)'`;
}

export function videoPreviewArgs(input: string, output: string, hasAudio: boolean): string[] {
  return [
    "-i", input,
    "-map", "0:v:0", ...(hasAudio ? ["-map", "0:a:0"] : []),
    "-vf", scaleShortSide(720),
    "-fpsmax", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-profile:v", "high",
    ...(hasAudio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : []),
    "-movflags", "+faststart",
    output,
  ];
}

export function posterArgs(input: string, output: string, atSec: number, maxWidth = 640): string[] {
  return ["-ss", atSec.toFixed(2), "-i", input, "-frames:v", "1", "-vf", `scale='min(${maxWidth},iw)':-2`, "-q:v", "4", output];
}

export function imagePreviewArgs(input: string, output: string, maxSide: number): string[] {
  return [
    "-i", input, "-frames:v", "1",
    "-vf", `scale='if(gte(iw,ih),min(${maxSide},iw),-2)':'if(gte(iw,ih),-2,min(${maxSide},ih))'`,
    "-q:v", "3", output,
  ];
}

export function audioPreviewArgs(input: string, output: string): string[] {
  return ["-i", input, "-vn", "-map", "0:a:0", "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", output];
}
