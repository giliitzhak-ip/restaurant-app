// Downloads the face-detection models into ai/models/ and verifies their SHA-256.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "ai/models.json"), "utf8"));
const dir = path.join(root, "ai/models");
fs.mkdirSync(dir, { recursive: true });

for (const [name, m] of Object.entries(manifest)) {
  const dest = path.join(dir, m.file);
  if (fs.existsSync(dest) && createHash("sha256").update(fs.readFileSync(dest)).digest("hex") === m.sha256) {
    console.log(`✓ ${name} already present`);
    continue;
  }
  process.stdout.write(`↓ ${name} (${m.license}) … `);
  const res = await fetch(m.url);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const sum = createHash("sha256").update(buf).digest("hex");
  if (sum !== m.sha256) throw new Error(`${name}: checksum mismatch (${sum})`);
  fs.writeFileSync(dest, buf);
  console.log(`ok (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
}
