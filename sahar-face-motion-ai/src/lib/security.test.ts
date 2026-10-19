import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "./tokens";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./password";
import { isSameOrigin } from "./http";

describe("tokens", () => {
  it("generates unique 256-bit tokens and stable hashes", () => {
    const a = generateToken();
    expect(a).not.toBe(generateToken());
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("password", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("secret12345");
    expect(await verifyPassword("secret12345", h)).toBe(true);
    expect(await verifyPassword("wrong123456", h)).toBe(false);
    expect(await verifyAgainstDummy("anything")).toBe(false);
  });
});

describe("isSameOrigin", () => {
  const req = (origin: string | null) =>
    new Request("http://app.test/api/x", { method: "POST", headers: { host: "app.test", ...(origin && { origin }) } });
  it("allows same origin and missing origin, rejects cross-site", () => {
    expect(isSameOrigin(req("http://app.test"))).toBe(true);
    expect(isSameOrigin(req(null))).toBe(true);
    expect(isSameOrigin(req("https://evil.test"))).toBe(false);
  });
});
