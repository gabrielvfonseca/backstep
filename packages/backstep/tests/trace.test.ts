import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKSTEP_REPORT,
  BackstepError,
  configure,
  getReport,
  resetConfig,
  trace,
  traceReport,
} from "../src/index.js";
import { resetForTest } from "./helpers.js";

describe("trace", () => {
  beforeEach(() => {
    resetForTest();
  });
  afterEach(() => {
    resetConfig();
    vi.restoreAllMocks();
  });

  it("returns exactly what the callback returns", () => {
    const value = trace("total", [1, 2, 3], (xs) =>
      xs.map((x) => x * 2).reduce((a, b) => a + b, 0),
    );
    expect(value).toBe(12);
  });

  it("returns plain values, never proxies", () => {
    const result = trace("items", [3, 1, 2], (xs) => xs.filter((x) => x > 1).sort());
    expect(result).toEqual([2, 3]);
    expect(Array.isArray(result)).toBe(true);
    expect(result).not.toBe(undefined);
  });

  it("unwraps proxies nested one level inside a returned object", () => {
    const result = trace("shape", [1, 2, 3], (xs) => ({ evens: xs.filter((x) => x % 2 === 0) }));
    expect(result).toEqual({ evens: [2] });
    expect(Array.isArray(result.evens)).toBe(true);
  });

  it("runs the callback directly when disabled", () => {
    configure({ enabled: false });
    const sink = vi.fn();
    configure({ onReport: sink });
    const input = [1, 2, 3];
    let seen: unknown;
    const value = trace("disabled", input, (xs) => {
      seen = xs;
      return xs.length;
    });
    expect(value).toBe(3);
    expect(seen).toBe(input);
    expect(sink).not.toHaveBeenCalled();
  });

  it("emits a report only when something diverged, unless always is set", () => {
    const sink = vi.fn();
    configure({ onReport: sink });
    trace("healthy", [1, 2], (xs) => xs.map((x) => x + 1));
    expect(sink).not.toHaveBeenCalled();

    trace("broken", [1, 2], (xs) => xs.filter(() => false));
    expect(sink).toHaveBeenCalledTimes(1);

    trace("healthy-always", [1, 2], (xs) => xs.map((x) => x + 1), { always: true });
    expect(sink).toHaveBeenCalledTimes(2);
  });

  it("honours the global always setting", () => {
    const sink = vi.fn();
    configure({ always: true, onReport: sink });
    trace("any", [1], (xs) => xs.map((x) => x));
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("does not let a throwing sink break the traced program", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    configure({
      onReport: () => {
        throw new Error("sink failure");
      },
    });
    expect(trace("sink", [1], (xs) => xs.filter(() => false))).toEqual([]);
    expect(logged).toHaveBeenCalled();
  });

  it("rethrows the original error with the partial report attached", () => {
    const boom = new TypeError("bad input");
    let caught: unknown;
    try {
      trace("throws", [1, 2], (xs) =>
        xs.map((x) => {
          if (x === 2) {
            throw boom;
          }
          return x;
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(boom);
    const report = getReport(caught);
    expect(report?.divergedAt).toBe(0);
    expect(report?.steps[0]?.error?.message).toBe("bad input");
    expect(Object.getOwnPropertySymbols(boom)).toContain(BACKSTEP_REPORT);
  });

  it("attaches a report to a thrown primitive without failing", () => {
    expect(() =>
      trace("primitive", [1], () => {
        throw "plain string";
      }),
    ).toThrow("plain string");
  });

  it("rejects async callbacks with a clear error", () => {
    expect(() => trace("async", [1], async (xs) => xs.length)).toThrow(BackstepError);
    expect(() => trace("async", [1], async (xs) => xs.length)).toThrow(/Use traceAsync/);
  });

  it("checks the expect predicate and reports a failure at the last step", () => {
    const { report, value } = traceReport("total", [1, -2], (xs) => xs.map((x) => x), {
      expect: (total) => (total as number[]).every((x) => x > 0),
      expectMessage: "every value is positive",
    });
    expect(value).toEqual([1, -2]);
    expect(report.findings).toEqual([
      expect.objectContaining({ code: "expectation-failed", severity: "error", step: 0 }),
    ]);
    expect(report.divergedAt).toBe(0);
  });

  it("treats an expect predicate that throws as a failure", () => {
    const { report } = traceReport("guard", [1], (xs) => xs, {
      expect: () => {
        throw new Error("predicate broke");
      },
    });
    expect(report.findings.map((f) => f.code)).toContain("expectation-failed");
  });

  it("does not run expect when the callback threw", () => {
    const expectSpy = vi.fn(() => true);
    expect(() =>
      traceReport(
        "skip",
        [1],
        () => {
          throw new Error("nope");
        },
        { expect: expectSpy },
      ),
    ).toThrow("nope");
    expect(expectSpy).not.toHaveBeenCalled();
  });

  it("supports non-array inputs by passing them through with no steps", () => {
    const map = new Map([["a", 1]]);
    const { value, report } = traceReport("map", map, (m) => m.get("a"));
    expect(value).toBe(1);
    expect(report.steps).toHaveLength(0);
    expect(report.input.count).toBeUndefined();
  });

  it("reports an empty pipeline without findings", () => {
    const { report } = traceReport("empty", [] as number[], (xs) => xs.map((x) => x));
    expect(report.findings).toEqual([]);
    expect(report.hasProblem).toBe(false);
  });

  it("keeps the report printable when the sink is null", () => {
    configure({ onReport: null });
    expect(trace("silent", [1], (xs) => xs.filter(() => false))).toEqual([]);
  });
});
