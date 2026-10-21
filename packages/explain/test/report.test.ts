import { beforeEach, describe, expect, it } from "vitest";
import { getReport } from "../src/index.js";
import { resetForTest, run } from "./helpers.js";

describe("TraceReport", () => {
  beforeEach(() => {
    resetForTest();
  });

  it("renders the documented tree for the order-total bug", () => {
    const items = [
      { id: "a1", stock: 0 },
      { id: "b2", stock: 0 },
    ];
    const { report } = run(items, (xs) =>
      xs
        .filter((i) => i.stock > 0)
        .map((i) => i.id)
        .reduce((a, b) => a + b, ""),
    );
    const text = report.toString();
    expect(text.split("\n")[0]).toBe('value = ""   ⚠ diverged at step 1');
    expect(text).toContain("├ input");
    expect(text).toContain("2 items");
    expect(text).toContain("filter(<anonymous>)");
    expect(text).toContain('e.g. #0 {id: "a1", stock: 0}');
    expect(text).toContain("removed all 2 element(s)");
    expect(text).toContain('└ reduce(<anonymous>, "")');
  });

  it("emits ANSI colours only when asked", () => {
    const { report } = run([1, 2], (xs) => xs.filter(() => false));
    expect(report.toString()).not.toContain("\u001b[");
    expect(report.toString({ color: true })).toContain("\u001b[31m");
  });

  it("prints a clean verdict for healthy traces", () => {
    const { report } = run([1, 2], (xs) => xs.map((x) => x * 2));
    expect(report.toString().split("\n")[0]).toBe("value = [2, 4]   ✔ no divergence detected");
  });

  it("prints the error for a throwing trace", () => {
    let caught: unknown;
    try {
      run([1], (xs) =>
        xs.map(() => {
          throw new RangeError("out of range");
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect(getReport(caught)?.toString()).toContain("threw RangeError: out of range");
  });

  it("summarises dropped elements beyond the shown sample", () => {
    const { report } = run([1, 2, 3, 4, 5, 6, 7], (xs) => xs.filter(() => false));
    expect(report.toString()).toContain("…+4");
  });

  it("serialises to plain JSON with display strings and no proxies", () => {
    const { report } = run([{ id: "x", password: "hunter2" }], (xs) => xs.filter(() => false));
    const json = JSON.parse(JSON.stringify(report)) as {
      divergedAt: number;
      steps: Array<{ dropped: Array<{ value: string }> }>;
    };
    expect(json.divergedAt).toBe(0);
    expect(json.steps[0]?.dropped[0]?.value).toBe('{id: "x", password: "[redacted]"}');
  });

  it("reports a non-array input's value rather than an item count", () => {
    const { report } = run(new Map([["a", 1]]), (m) => m.size);
    expect(report.toString().split("\n")[1]).toContain("Map(1)");
  });

  it("exposes the step facts used by the analysis", () => {
    const { report } = run([1, 2], (xs) => xs.map(() => "same"));
    expect(report.steps[0]?.facts).toMatchObject({ identicalOutputs: true, matchedOrigin: -1 });
  });
});
