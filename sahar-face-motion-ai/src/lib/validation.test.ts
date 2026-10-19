import { describe, expect, it } from "vitest";
import { firstError, loginSchema, registerSchema } from "./validation";

const valid = { name: "סהר", email: "Sahar@Example.com ", password: "secret12345", acceptTerms: true };

describe("registerSchema", () => {
  it("accepts valid input and normalises email", () => {
    const r = registerSchema.parse(valid);
    expect(r.email).toBe("sahar@example.com");
  });

  it("requires accepting terms, with a Hebrew message", () => {
    const r = registerSchema.safeParse({ ...valid, acceptTerms: false });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstError(r.error)).toContain("תנאי השימוש");
  });

  it("rejects weak passwords", () => {
    expect(registerSchema.safeParse({ ...valid, password: "short1" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: "onlyletterslong" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: "סיסמהארוכה12" }).success).toBe(true);
  });

  it("rejects invalid email", () => {
    const r = loginSchema.safeParse({ email: "nope", password: "x" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstError(r.error)).toBe("כתובת האימייל אינה תקינה");
  });
});
