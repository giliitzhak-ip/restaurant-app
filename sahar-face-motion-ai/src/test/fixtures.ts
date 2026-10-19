import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Generates small real media files with FFmpeg for tests. */
export function makeFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sahar-fixtures-"));
  const ff = (...args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "ignore" });
  const f = (name: string) => path.join(dir, name);

  ff("-f", "lavfi", "-i", "testsrc=size=640x480", "-frames:v", "1", f("photo.jpg"));
  ff("-f", "lavfi", "-i", "testsrc=size=320x240", "-frames:v", "1", f("photo.png"));
  ff("-f", "lavfi", "-i", "testsrc=size=32x32", "-frames:v", "1", f("tiny.png"));
  ff("-f", "lavfi", "-i", "testsrc=size=1280x720:rate=30", "-f", "lavfi", "-i", "sine=frequency=440",
    "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", f("dance.mp4"));
  ff("-f", "lavfi", "-i", "testsrc=size=640x360:rate=30", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", f("silent.mp4"));
  // iPhone-style: HEVC in MOV, stored landscape with a 90° display rotation (portrait).
  ff("-f", "lavfi", "-i", "testsrc=size=640x360:rate=30", "-f", "lavfi", "-i", "sine=frequency=330",
    "-t", "1", "-c:v", "libx265", "-x265-params", "log-level=none", "-tag:v", "hvc1", "-c:a", "aac", "-shortest", f("raw.mov"));
  ff("-display_rotation", "90", "-i", f("raw.mov"), "-c", "copy", f("iphone.mov"));
  ff("-f", "lavfi", "-i", "sine=frequency=440", "-t", "1.5", "-c:a", "libmp3lame", f("voice.mp3"));
  ff("-f", "lavfi", "-i", "sine=frequency=440", "-t", "1", f("voice.wav"));
  fs.writeFileSync(f("fake.mp4"), "this is not a video, just text pretending to be one");

  return { dir, f, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
