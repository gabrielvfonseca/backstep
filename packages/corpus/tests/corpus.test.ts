import { describe, expect, it } from "vitest";
import { cases } from "../src/cases.js";

describe("bug corpus: backstep points at the real cause", () => {
  for (const testCase of cases) {
    it(`${testCase.id}: ${testCase.title}`, () => {
      const report = testCase.run();
      expect(report.divergedAt, "divergedAt").toBe(testCase.expected.step);
      expect(
        report.findings.some(
          (finding) =>
            finding.step === testCase.expected.step && finding.code === testCase.expected.code,
        ),
        `finding ${testCase.expected.code} at step ${testCase.expected.step}`,
      ).toBe(true);
    });
  }

  it("covers at least ten bugs across several distinct finding kinds", () => {
    expect(new Set(cases.map((c) => c.expected.code)).size).toBeGreaterThanOrEqual(5);
    expect(cases.length).toBeGreaterThanOrEqual(10);
  });
});
