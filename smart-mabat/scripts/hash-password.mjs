// Usage: npm run hash-password -- "your-strong-password"
// Output format has no "$" characters so it is safe in .env files and in Vercel.
import { randomBytes, scryptSync } from "node:crypto";

const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error('Provide a password of at least 10 characters: npm run hash-password -- "..."');
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
console.log(`scrypt.${salt.toString("base64url")}.${hash.toString("base64url")}`);
