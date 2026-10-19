import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CACHE = path.resolve(".cache/test-faces");
// Standard computer-vision sample images from the OpenCV repository. Downloaded on
// demand into a git-ignored cache (not committed): they show real people.
const SAMPLES = {
  a: "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/lena.jpg",
  b: "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/messi5.jpg",
};

export async function faceSamples(): Promise<{ a: string; b: string } | null> {
  fs.mkdirSync(CACHE, { recursive: true });
  const out: Record<string, string> = {};
  for (const [k, url] of Object.entries(SAMPLES)) {
    const file = path.join(CACHE, `${k}.jpg`);
    if (!fs.existsSync(file)) {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      } catch {
        return null;
      }
    }
    out[k] = file;
  }
  return out as { a: string; b: string };
}

/** A 3 s, 25 fps clip with two people moving (and a soundtrack), plus a one-person clip. */
export function makeFaceVideos(dir: string, s: { a: string; b: string }) {
  const ff = (...args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "ignore" });
  const two = path.join(dir, "two-dancers.mp4");
  const one = path.join(dir, "one-dancer.mp4");
  ff(
    "-loop", "1", "-i", s.a, "-loop", "1", "-i", s.b, "-f", "lavfi", "-i", "sine=frequency=440",
    "-filter_complex",
    "[0]scale=480:480[a];[1]scale=-2:480,crop=480:480[b];[a][b]hstack,format=yuv420p,scale=960:480[s];[s]crop=w='iw-40':h='ih-20':x='20+20*sin(t*3)':y='10+10*cos(t*2)',scale=920:460[v]",
    "-map", "[v]", "-map", "2:a", "-t", "3", "-r", "25", "-c:v", "libx264", "-c:a", "aac", "-shortest", two,
  );
  ff("-loop", "1", "-i", s.a, "-vf", "scale=480:480,format=yuv420p", "-t", "2", "-r", "25", "-c:v", "libx264", one);
  return { two, one };
}
