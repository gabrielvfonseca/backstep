import { beforeEach, describe, expect, it } from "vitest";
import { getReport } from "../src/index.js";
import { resetForTest, run } from "./helpers.js";

const codes = (report: { findings: readonly { code: string }[] }) =>
  report.findings.map((f) => f.code);

describe("divergence rules", () => {
  beforeEach(() => {
    resetForTest();
  });

  it("flags a filter that removes everything, with its most common reason", () => {
    const { report } = run([1, 2, 3], (xs) => xs.filter((x) => x > 10));
    expect(report.findings[0]).toMatchObject({
      severity: "error",
      code: "collapsed",
      step: 0,
      message: "removed all 3 element(s) (<anonymous> → false)",
    });
    expect(report.divergedAt).toBe(0);
  });

  it("flags a slice that removes everything", () => {
    const { report } = run([1, 2], (xs) => xs.slice(5));
    expect(codes(report)).toContain("collapsed");
  });

  it("warns when a filter drops at least 90% of a multi-element input", () => {
    const { report } = run([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], (xs) => xs.filter((x) => x === 10));
    expect(report.findings.map((f) => f.code)).toEqual(["dropped-majority"]);
    expect(report.findings[0]?.severity).toBe("warning");
  });

  it("does not warn for ordinary filtering", () => {
    const { report } = run([1, 2, 3, 4], (xs) => xs.filter((x) => x > 1));
    expect(report.hasProblem).toBe(false);
  });

  it("flags a map callback that forgot to return", () => {
    const { report } = run([1, 2, 3], (xs) =>
      // biome-ignore lint/suspicious/useIterableCallbackReturn: the missing return is the bug under test
      xs.map((x) => {
        void x;
      }),
    );
    expect(report.findings[0]).toMatchObject({ code: "non-finite", severity: "error", step: 0 });
    expect(report.findings[0]?.message).toBe("3 of 3 result(s) are undefined, null or NaN");
  });

  it("does not flag undefined results when the inputs were already undefined", () => {
    const { report } = run([undefined, null], (xs) => xs.map((x) => x ?? undefined));
    expect(codes(report)).not.toContain("non-finite");
  });

  it("flags a reduce that produces NaN from finite inputs", () => {
    const { report } = run([1, 2], (xs) => xs.reduce((a, b) => a + (b as number) * Number("x"), 0));
    expect(report.findings.map((f) => f.code)).toContain("non-finite");
    expect(report.findings.find((f) => f.code === "non-finite")?.message).toBe(
      "reduce produced NaN from finite inputs",
    );
  });

  it("flags a map that returns one identical value for distinct inputs", () => {
    const { report } = run([1, 2, 3], (xs) => xs.map(() => "ok"));
    expect(codes(report)).toContain("identical-outputs");
  });

  it("does not flag a map over identical inputs", () => {
    const { report } = run([7, 7, 7], (xs) => xs.map(() => "ok"));
    expect(codes(report)).not.toContain("identical-outputs");
  });

  it("warns when reduce returns its initial value because nothing reached it", () => {
    const { report } = run([] as number[], (xs) => xs.reduce((a, b) => a + b, 0));
    expect(report.findings.find((f) => f.code === "returned-initial")).toMatchObject({
      severity: "warning",
      step: 0,
      message: "had no elements to combine and returned its initial value 0",
    });
  });

  it("reports the native TypeError for reduce on an empty array without an initial value", () => {
    let caught: unknown;
    try {
      run([] as number[], (xs) => xs.reduce((a, b) => a + b));
    } catch (error) {
      caught = error;
    }
    const report = getReport(caught);
    expect(report?.findings[0]).toMatchObject({ code: "threw", severity: "error", step: 0 });
    expect(report?.findings[0]?.message).toMatch(/^reduce\(<anonymous>\) threw TypeError/);
  });

  it("warns when a sort comparator returns a boolean", () => {
    const { report } = run([3, 1, 2], (xs) => xs.toSorted((a, b) => (a > b) as unknown as number));
    expect(codes(report)).toContain("non-numeric-comparator");
  });

  it("does not warn for numeric comparators", () => {
    const { report } = run([3, 1, 2], (xs) => xs.toSorted((a, b) => a - b));
    expect(codes(report)).not.toContain("non-numeric-comparator");
  });

  it("warns when numeric-looking strings are concatenated into a string", () => {
    const { report } = run(["1", "2", "3"], (xs) => xs.reduce((a, b) => a + b, ""));
    expect(codes(report)).toContain("numeric-string-concat");
  });

  it("does not warn when strings are not numeric", () => {
    const { report } = run(["a", "b"], (xs) => xs.reduce((a, b) => a + b, ""));
    expect(codes(report)).not.toContain("numeric-string-concat");
  });

  it("records a find that matched nothing as informational only", () => {
    const { report } = run([1, 2], (xs) => xs.find((x) => x > 9));
    expect(report.findings).toEqual([
      expect.objectContaining({ code: "no-match", severity: "info" }),
    ]);
    expect(report.hasProblem).toBe(false);
    expect(report.divergedAt).toBeUndefined();
  });

  it("reports the first divergent step, ignoring later problems", () => {
    const { report } = run([1, 2, 3, 4], (xs) =>
      xs
        .map((x) => x * 2)
        .filter((x) => x > 100)
        .map((x) => x + 1)
        .reduce((a, b) => a + b, 0),
    );
    expect(report.divergedAt).toBe(1);
  });
});
