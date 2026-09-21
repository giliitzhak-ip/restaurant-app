import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONSENT_VERSION,
  DENIED_ALL,
  allowAll,
  hasDecided,
  parseConsent,
  rejectOptional,
  serialiseConsent,
} from "../../src/lib/consent";

/*
 * The consent model has one property that matters more than all the others:
 * every ambiguous input must resolve to "no". A bug that reads a corrupted
 * cookie as consent is not a rendering glitch — it is tracking someone who
 * did not agree to be tracked. So most of these tests are about the failure
 * directions rather than the happy path.
 */

describe("consent: defaults", () => {
  it("starts with every optional category off", () => {
    assert.equal(DENIED_ALL.functional, false);
    assert.equal(DENIED_ALL.analytics, false);
    assert.equal(DENIED_ALL.marketing, false);
  });

  it("treats the default as undecided, not as a rejection", () => {
    // The distinction matters: undecided means "still ask", rejected means
    // "they answered and the answer was no".
    assert.equal(hasDecided(DENIED_ALL), false);
    assert.equal(hasDecided(rejectOptional()), true);
  });

  it("rejectOptional leaves everything optional off", () => {
    const choice = rejectOptional();
    assert.equal(choice.functional, false);
    assert.equal(choice.analytics, false);
    assert.equal(choice.marketing, false);
  });
});

describe("consent: parsing", () => {
  it("round-trips a real choice", () => {
    const original = allowAll(new Date("2026-09-21T10:00:00.000Z"));
    const parsed = parseConsent(serialiseConsent(original));
    assert.deepEqual(parsed, original);
  });

  it("reads both the plain and the percent-encoded form", () => {
    /*
     * Regression. `cookies().set()` encodes the value it is given, a raw
     * `document.cookie` write does not, and both paths write this cookie. When
     * serialiseConsent also encoded, the server produced a double-encoded
     * value that decoded once into "%7B%22version%22…" — not JSON — so a
     * recorded choice read back as "no decision" and the visitor was asked
     * again on the next page load.
     */
    const original = allowAll(new Date("2026-09-21T10:00:00.000Z"));
    const plain = serialiseConsent(original);

    assert.ok(plain.startsWith("{"), "serialiseConsent must not percent-encode");
    assert.deepEqual(parseConsent(plain), original, "plain form failed");
    assert.deepEqual(
      parseConsent(encodeURIComponent(plain)),
      original,
      "percent-encoded form failed",
    );
  });

  it("refuses a double-encoded value rather than half-reading it", () => {
    const twice = encodeURIComponent(encodeURIComponent(serialiseConsent(allowAll())));
    assert.deepEqual(parseConsent(twice), DENIED_ALL);
  });

  for (const [name, raw] of [
    ["empty", ""],
    ["undefined", undefined],
    ["not JSON", "not-json-at-all"],
    ["JSON that is not an object", encodeURIComponent('"yes"')],
    ["null", encodeURIComponent("null")],
    ["truncated", encodeURIComponent('{"version":1,"analytics":tr')],
    ["an array", encodeURIComponent("[1,2,3]")],
  ] as const) {
    it(`reads ${name} as no consent`, () => {
      assert.deepEqual(parseConsent(raw), DENIED_ALL);
    });
  }

  it("refuses a choice from an older category set", () => {
    // Consent to three categories is not consent to a fourth one added later.
    const stale = encodeURIComponent(
      JSON.stringify({
        version: CONSENT_VERSION - 1,
        decidedAt: "2026-01-01T00:00:00.000Z",
        functional: true,
        analytics: true,
        marketing: true,
      }),
    );
    assert.deepEqual(parseConsent(stale), DENIED_ALL);
  });

  it("refuses a record with no decision timestamp", () => {
    const undated = encodeURIComponent(
      JSON.stringify({ version: CONSENT_VERSION, decidedAt: "", analytics: true }),
    );
    assert.deepEqual(parseConsent(undated), DENIED_ALL);
  });

  it("coerces truthy-but-not-true values to false", () => {
    // "1", "yes" and 1 are not `true`. A category is on only when it is
    // literally true, so a hand-edited cookie cannot opt someone in.
    const fuzzy = encodeURIComponent(
      JSON.stringify({
        version: CONSENT_VERSION,
        decidedAt: "2026-09-21T10:00:00.000Z",
        functional: 1,
        analytics: "yes",
        marketing: {},
      }),
    );
    const parsed = parseConsent(fuzzy);
    assert.equal(hasDecided(parsed), true);
    assert.equal(parsed.functional, false);
    assert.equal(parsed.analytics, false);
    assert.equal(parsed.marketing, false);
  });
});
