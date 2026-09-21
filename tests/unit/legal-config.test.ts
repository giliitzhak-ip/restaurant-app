import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LEGAL_PLACEHOLDER,
  assertLegalFactsForProduction,
  isPlaceholder,
  legalDocuments,
  legalFacts,
  legalPlaceholders,
  legalValue,
} from "../../src/config/legal";

/*
 * These tests guard a property that is easy to break by accident: a legal page
 * must never render an empty string where a business fact belongs. An empty
 * span looks like a rendering bug and tells the reader nothing; the explicit
 * marker tells them the detail is outstanding.
 */

describe("legal facts", () => {
  it("never yields an empty value", () => {
    for (const key of Object.keys(legalFacts) as (keyof typeof legalFacts)[]) {
      const value = legalValue(key);
      assert.ok(value.length > 0, `${key} rendered an empty string`);
    }
  });

  it("renders the explicit marker for a fact nobody has supplied", () => {
    assert.equal(legalValue("companyId"), LEGAL_PLACEHOLDER);
    assert.equal(isPlaceholder("companyId"), true);
  });

  it("renders a supplied fact as itself", () => {
    // The trading name is genuinely known from the project.
    assert.equal(isPlaceholder("tradingName"), false);
    assert.equal(legalValue("tradingName"), "טרה נובה");
  });

  it("reports launch-blocking placeholders before conditional ones", () => {
    const report = legalPlaceholders();
    const firstConditional = report.findIndex((item) => item.required === "conditional");
    if (firstConditional === -1) return;
    const lateLaunch = report
      .slice(firstConditional)
      .some((item) => item.required === "launch");
    assert.equal(lateLaunch, false, "a launch-blocking item sorted after a conditional one");
  });

  it("gives every outstanding fact a note telling the owner what to supply", () => {
    for (const item of legalPlaceholders()) {
      assert.ok(item.note.length > 20, `${item.key} has no useful note`);
      assert.ok(item.label.length > 0, `${item.key} has no label`);
    }
  });

  it("does not invent a company id, address or phone number", () => {
    // Regression guard. A previous pass filled brand.ts with plausible-looking
    // placeholders ("03-0000000"); those are display stand-ins, and the legal
    // layer must not adopt them as if they were real.
    for (const key of ["companyId", "registeredAddress", "phone", "returnsAddress"] as const) {
      assert.equal(legalFacts[key].value, null, `${key} must stay unset until supplied`);
    }
  });
});

describe("production warning", () => {
  it("warns rather than throws, and names the blocking count", () => {
    const lines: string[] = [];
    const outstanding = assertLegalFactsForProduction(true, (message) => lines.push(message));

    assert.ok(outstanding.length > 0);
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /launch-blocking/);
    assert.match(lines[0]!, /LEGAL-PLACEHOLDERS/);
  });

  it("stays silent outside production", () => {
    const lines: string[] = [];
    assertLegalFactsForProduction(false, (message) => lines.push(message));
    assert.equal(lines.length, 0);
  });
});

describe("document versions", () => {
  it("gives every document a version and a date", () => {
    for (const [key, meta] of Object.entries(legalDocuments)) {
      assert.ok(meta.version.length > 0, `${key} has no version`);
      assert.ok(meta.date.length > 0, `${key} has no date`);
    }
  });

  it("marks every document as a draft", () => {
    // Consent records store these strings. Shipping a version that does not
    // say "draft" would imply a review that has not happened.
    for (const [key, meta] of Object.entries(legalDocuments)) {
      assert.match(meta.version, /draft/, `${key} is not marked as a draft`);
    }
  });
});
