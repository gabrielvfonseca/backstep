import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { traceReport } from "../src/index.js";
import { resetForTest } from "./helpers.js";

/** Operations a random pipeline can apply, paired with their native equivalent. */
const STAGES = [
  { apply: (xs: number[]) => xs.filter((x) => x % 2 === 1), name: "filter-odd" },
  { apply: (xs: number[]) => xs.filter((x) => x > 10), name: "filter-big" },
  { apply: (xs: number[]) => xs.map((x) => x + 1), name: "map-inc" },
  { apply: (xs: number[]) => xs.map((x) => x * 2), name: "map-double" },
  { apply: (xs: number[]) => xs.flatMap((x) => [x, -x]), name: "flatMap-pair" },
  { apply: (xs: number[]) => xs.toSorted((a, b) => a - b), name: "sort" },
  { apply: (xs: number[]) => xs.toReversed(), name: "reverse" },
  { apply: (xs: number[]) => xs.slice(1), name: "slice" },
  { apply: (xs: number[]) => xs.concat([0]), name: "concat" },
] as const;

describe("property: tracing never changes results", () => {
  beforeEach(() => {
    resetForTest();
  });

  it("matches native execution for random pipelines", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ max: 50, min: -50 }), { maxLength: 40 }),
        fc.array(fc.constantFrom(...STAGES), { maxLength: 6 }),
        (input, stages) => {
          const native = stages.reduce<number[]>((xs, stage) => stage.apply(xs), [...input]);
          const traced = traceReport("p", [...input], (xs) => {
            let current: number[] = xs;
            for (const stage of stages) {
              current = stage.apply(current);
            }
            return current;
          });
          expect(traced.value).toEqual(native);
          expect(traced.report.steps.every((step) => step.inputCount >= 0)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("keeps the number of surviving elements consistent with the recorded drops", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ max: 20, min: 0 }), { maxLength: 30 }), (input) => {
        const { report, value } = traceReport("count", input, (xs) =>
          xs.filter((x) => x % 3 === 0).filter((x) => x > 4),
        );
        const dropped = report.steps.reduce((sum, step) => sum + step.droppedCount, 0);
        expect(value.length + dropped).toBe(input.length);
      }),
      { numRuns: 300 },
    );
  });

  it("assigns every surviving element an origin inside the input", () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 25, minLength: 1 }), (input) => {
        const { report } = traceReport("origins", input, (xs) =>
          xs.map((x) => x).filter((x) => x % 2 === 0),
        );
        const [, step] = report.steps;
        expect(step).toBeDefined();
        for (const drop of step?.dropped ?? []) {
          expect(drop.origin).toBeGreaterThanOrEqual(0);
          expect(drop.origin).toBeLessThan(input.length);
          expect(input[drop.origin]).toBe(drop.value);
        }
      }),
      { numRuns: 200 },
    );
  });
});
