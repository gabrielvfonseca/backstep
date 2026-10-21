// biome-ignore-all lint/suspicious/noSparseArray: sparse arrays are the inputs under test
import { beforeEach, describe, expect, it } from "vitest";
import { configure } from "../src/index.js";
import { resetForTest, run } from "./helpers.js";

const codes = (report: { findings: readonly { code: string }[] }) =>
  report.findings.map((f) => f.code);

describe("vacuous every()", () => {
  beforeEach(() => {
    resetForTest();
  });

  it("warns when every() runs over an empty array and returns true", () => {
    const { report } = run([] as Array<{ paid: boolean }>, (xs) => xs.every((o) => o.paid));
    expect(report.findings[0]).toMatchObject({
      code: "vacuous-every",
      severity: "warning",
      step: 0,
    });
  });

  it("stays quiet for a non-empty every() that passes", () => {
    const { report } = run([{ paid: true }], (xs) => xs.every((o) => o.paid));
    expect(codes(report)).not.toContain("vacuous-every");
  });
});

describe("default numeric sort", () => {
  beforeEach(() => {
    resetForTest();
  });

  it("warns when sort() without a comparator is given numbers", () => {
    const { report, value } = run([10, 9, 1], (xs) => xs.toSorted());
    expect(value).toEqual([1, 10, 9]);
    expect(codes(report)).toContain("default-numeric-sort");
  });

  it("does not warn for strings, or for numbers with a comparator", () => {
    expect(codes(run(["b", "a"], (xs) => xs.toSorted()).report)).not.toContain(
      "default-numeric-sort",
    );
    expect(codes(run([10, 9], (xs) => xs.toSorted((a, b) => a - b)).report)).not.toContain(
      "default-numeric-sort",
    );
  });
});

describe("branch coverage of unusual inputs", () => {
  beforeEach(() => {
    resetForTest();
  });

  it("sorts holes and undefined values last, without a comparator", () => {
    const sparse = [3, undefined, , 1] as number[];
    const { report } = run(sparse, (xs) => xs.toSorted((a, b) => (a ?? 0) - (b ?? 0)));
    expect(report.steps[0]?.outputCount).toBe(4);
  });

  it("sorts in place with holes", () => {
    const { value } = run([2, , 1] as number[], (xs) => xs.sort((a, b) => a - b));
    expect(value.slice(0, 2)).toEqual([1, 2]);
    expect(value.length).toBe(3);
  });

  it("treats a NaN comparator result as equal", () => {
    const { value } = run([2, 1, 3], (xs) => xs.toSorted(() => Number.NaN));
    expect(value).toEqual([2, 1, 3]);
  });

  it("keeps origins across concat with plain and traced arrays", () => {
    const { report, value } = run([1, 2], (xs) => xs.concat([3], [4, 5]).filter((x) => x > 4));
    expect(value).toEqual([5]);
    expect(report.steps[0]?.dropped.map((d) => d.origin)).toEqual([0, 1, -1, -1]);
  });

  it("concat keeps the origins of a traced receiver and a traced argument", () => {
    const { report } = run([1, 2, 3], (xs) =>
      xs
        .filter((x) => x > 1)
        .concat(xs.filter((x) => x > 2))
        .filter(() => false),
    );
    // filter keeps origins [1, 2]; the argument keeps [2]; the final filter drops all three.
    expect(report.steps[2]?.dropped.map((d) => d.origin)).toEqual([1, 2, 2]);
  });

  it("concat of a single non-array value", () => {
    const { value } = run([1], (xs) => xs.concat(2 as unknown as number[]));
    expect(value).toEqual([1, 2]);
  });

  it("marks a value that was deleted as unknown origin", () => {
    const { report } = run([1, 2, 3], (xs) => {
      // biome-ignore lint/performance/noDelete: deleting an index is what creates the unknown-origin case under test
      delete (xs as Array<number | undefined>)[0];
      return xs.filter((x) => x !== 3);
    });
    expect(report.steps[0]?.dropped[0]?.origin).toBe(2);
  });

  it("flatMap keeps non-array results as single elements", () => {
    const { value } = run([1, 2], (xs) => xs.flatMap((x) => x * 10));
    expect(value).toEqual([10, 20]);
  });

  it("flatMap unwraps traced items inside a returned array", () => {
    const { value } = run([[1, 2], [3]], (xs) => xs.flatMap((inner) => inner.filter((x) => x > 1)));
    expect(value).toEqual([2, 3]);
  });

  it("slice with negative and out-of-range bounds", () => {
    const { value } = run([1, 2, 3, 4], (xs) => xs.slice(-2, 99));
    expect(value).toEqual([3, 4]);
  });

  it("reduceRight with and without an initial value", () => {
    expect(run([1, 2, 3], (xs) => xs.reduceRight((a, b) => a - b)).value).toBe(0);
    expect(run([1, 2, 3], (xs) => xs.reduceRight((a, b) => a - b, 10)).value).toBe(4);
  });

  it("findLast and findLastIndex match from the end", () => {
    const { value } = run([1, 2, 3, 4], (xs) => [
      xs.findLast((x) => x % 2 === 1),
      xs.findLastIndex((x) => x % 2 === 1),
      xs.findLastIndex((x) => x > 9),
    ]);
    expect(value).toEqual([3, 2, -1]);
  });

  it("every stops at the first failure and skips holes", () => {
    const { value } = run([1, , 3] as number[], (xs) => [
      xs.every((x) => x > 0),
      xs.every((x) => x > 1),
    ]);
    expect(value).toEqual([true, false]);
  });

  it("some over sparse input skips holes", () => {
    const { value } = run([, undefined] as unknown as number[], (xs) =>
      xs.some((x) => x === undefined),
    );
    expect(value).toBe(true);
  });

  it("reduce with no elements and an initial value records returned-initial", () => {
    const { report } = run([] as number[], (xs) => xs.reduce((a, b) => a + b, 7));
    expect(report.findings.map((f) => f.code)).toContain("returned-initial");
  });

  it("reports NaN produced by a reduce from finite inputs", () => {
    const { report } = run([1, 2], (xs) => xs.reduce((a, b) => a * Number.NaN + b, 0));
    expect(codes(report)).toContain("non-finite");
  });

  it("reduce over undefined values does not blame the reduce for NaN", () => {
    const { report } = run([undefined, 1] as number[], (xs) =>
      xs.reduce((a, b) => (a ?? 0) + (b ?? 0), 0),
    );
    expect(codes(report)).not.toContain("non-finite");
  });

  it("nonFinite on a map skips positions that were already undefined in the input", () => {
    const { report } = run([undefined, 2] as number[], (xs) => xs.map((x) => x ?? undefined));
    expect(codes(report)).not.toContain("non-finite");
  });

  it("a map over identical inputs does not warn about identical outputs", () => {
    const { report } = run([1, 1], (xs) => xs.map(() => 0));
    expect(codes(report)).not.toContain("identical-outputs");
  });

  it("find over an empty array records no-match", () => {
    const { report } = run([] as number[], (xs) => xs.findIndex((x) => x > 0));
    expect(codes(report)).toContain("no-match");
  });

  it("writes beyond the end extend the origin list", () => {
    const { value, report } = run([1], (xs) => {
      xs[3] = 4;
      return xs.filter((x) => x === undefined);
    });
    // Holes are skipped by filter, so only the value written at index 3 is visited.
    expect(value).toEqual([]);
    expect(report.steps[0]?.inputCount).toBe(4);
  });

  it("setting length truncates", () => {
    const { value } = run([1, 2, 3], (xs) => {
      xs.length = 1;
      return xs.slice();
    });
    expect(value).toEqual([1]);
  });

  it("a failed write (frozen target) reports the TypeError", () => {
    const frozen = Object.freeze([1, 2]) as number[];
    expect(() => run(frozen, (xs) => xs.push(3))).toThrow(TypeError);
  });

  it("toReversed and reverse keep origins without recording steps", () => {
    const { report, value } = run([1, 2, 3], (xs) => xs.toReversed().filter((x) => x !== 2));
    expect(value).toEqual([3, 1]);
    expect(report.steps[0]?.dropped[0]?.origin).toBe(1);
  });
});

describe("custom redaction applies to labels and drop reasons", () => {
  beforeEach(() => {
    resetForTest();
    configure({ redactKeys: /tenantId/ });
  });

  it("redacts a configured key inside a reduce label built from the initial value", () => {
    const { report } = run([1], (xs) =>
      xs.reduce((acc) => acc, { tenantId: "acme-secret" } as object),
    );
    expect(report.steps[0]?.label).toContain('tenantId: "[redacted]"');
    expect(report.steps[0]?.label).not.toContain("acme-secret");
  });
});
