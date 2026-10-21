import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BackstepError,
  configure,
  getReport,
  resetConfig,
  trace,
  traceAsync,
} from "../src/index.js";
import { resetForTest } from "./helpers.js";

const delay = (value: number) =>
  new Promise<number>((resolve) => setTimeout(() => resolve(value), 1));

describe("traceAsync", () => {
  beforeEach(() => {
    resetForTest();
  });
  afterEach(() => {
    resetConfig();
    vi.restoreAllMocks();
  });

  it("awaits the callback and returns its resolved value", async () => {
    const total = await traceAsync("total", [1, 2, 3], async (xs) => {
      const factor = await delay(2);
      return xs.map((x) => x * factor).reduce((a, b) => a + b, 0);
    });
    expect(total).toBe(12);
  });

  it("records steps that run after an await", async () => {
    const sink = vi.fn();
    configure({ onReport: sink });
    await traceAsync("late", [1, 2], async (xs) => {
      await delay(1);
      return xs.filter((x) => x > 9);
    });
    expect(sink).toHaveBeenCalledTimes(1);
    const report = sink.mock.calls[0]?.[0];
    expect(report.divergedAt).toBe(0);
  });

  it("rethrows a rejection with the report attached", async () => {
    const boom = new Error("network down");
    let caught: unknown;
    try {
      await traceAsync("fetch", [1], async (xs) => {
        await delay(1);
        xs.map(() => {
          throw boom;
        });
        return xs;
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(boom);
    expect(getReport(caught)?.error?.message).toBe("network down");
  });

  it("runs the callback without tracing when disabled", async () => {
    configure({ enabled: false });
    const input = [1, 2];
    const value = await traceAsync("off", input, async (xs) => xs.length);
    expect(value).toBe(2);
  });

  it("points sync callers that return a promise to traceAsync", () => {
    expect(() => trace("sync-async", [1], async (xs) => xs.length)).toThrow(/Use traceAsync/);
    expect(() => trace("sync-async", [1], async (xs) => xs.length)).toThrow(BackstepError);
  });

  it("applies expect to the resolved value", async () => {
    const sink = vi.fn();
    configure({ onReport: sink });
    await traceAsync("expect", [1], async (xs) => xs, {
      expect: (value) => (value as number[]).length > 5,
      expectMessage: "enough items",
    });
    expect(sink.mock.calls[0]?.[0].findings[0].code).toBe("expectation-failed");
  });
});
