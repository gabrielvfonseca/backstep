import { afterEach, describe, expect, it, vi } from "vitest";
import { BackstepError, configure, disable, enable, resetConfig, trace } from "../src/index.js";

type Env = Record<string, string | undefined>;

function withProcess(env: Env, isTTY: boolean, fn: () => void): void {
  const original = (globalThis as { process?: unknown }).process;
  (globalThis as { process?: unknown }).process = { env, stdout: { isTTY } };
  try {
    fn();
  } finally {
    (globalThis as { process?: unknown }).process = original;
  }
}

describe("configuration", () => {
  afterEach(() => {
    resetConfig();
    vi.restoreAllMocks();
  });

  it("is enabled under NODE_ENV=development and test, disabled in production", () => {
    withProcess({ NODE_ENV: "development" }, false, () => {
      resetConfig();
      expect(configure().enabled).toBe(true);
    });
    withProcess({ NODE_ENV: "production" }, false, () => {
      resetConfig();
      expect(configure().enabled).toBe(false);
    });
  });

  it("is disabled when NODE_ENV is unset, so production deployments stay quiet", () => {
    withProcess({}, false, () => {
      resetConfig();
      expect(configure().enabled).toBe(false);
    });
  });

  it("lets BACKSTEP override NODE_ENV in both directions", () => {
    withProcess({ BACKSTEP: "1", NODE_ENV: "production" }, false, () => {
      resetConfig();
      expect(configure().enabled).toBe(true);
    });
    withProcess({ BACKSTEP: "off", NODE_ENV: "development" }, false, () => {
      resetConfig();
      expect(configure().enabled).toBe(false);
    });
  });

  it("is disabled without a process object, such as in browsers", () => {
    const original = (globalThis as { process?: unknown }).process;
    (globalThis as { process?: unknown }).process = undefined;
    try {
      resetConfig();
      expect(configure().enabled).toBe(false);
    } finally {
      (globalThis as { process?: unknown }).process = original;
    }
  });

  it("merges options and validates them", () => {
    configure({ maxSamples: 2 });
    expect(configure().maxSamples).toBe(2);
    expect(() => configure({ maxSamples: -1 })).toThrow(BackstepError);
    expect(() => configure({ maxDepth: 1.5 })).toThrow(/integer/);
    expect(() => configure({ maxItems: 1_000_000 })).toThrow(BackstepError);
    expect(() => configure({ onReport: "nope" as unknown as null })).toThrow(/onReport/);
    expect(() => configure({ redactKeys: "x" as unknown as RegExp })).toThrow(/RegExp/);
  });

  it("removes the g and y flags from redaction patterns so matching is stateless", () => {
    const config = configure({ redactKeys: /token/gy });
    expect(config.redactKeys.flags).toBe("");
    expect(config.redactKeys.test("token")).toBe(true);
    expect(config.redactKeys.test("token")).toBe(true);
  });

  it("enable and disable toggle tracing", () => {
    const sink = vi.fn();
    configure({ onReport: sink });
    disable();
    trace("off", [1], (xs) => xs.filter(() => false));
    expect(sink).not.toHaveBeenCalled();
    enable();
    trace("on", [1], (xs) => xs.filter(() => false));
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("prints a coloured report to the console by default", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    resetConfig();
    configure({ enabled: true });
    withProcess({}, true, () => {
      trace("default-sink", [1, 2], (xs) => xs.filter(() => false));
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("\u001b[");
  });

  it("uses console.log for a healthy trace when always is set", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    resetConfig();
    configure({ always: true, enabled: true });
    trace("healthy", [1], (xs) => xs.map((x) => x));
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toContain("no divergence detected");
  });
});
