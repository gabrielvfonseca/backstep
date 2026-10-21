import { describe, expect, it, vi } from "vitest";
import { configure, resetConfig, trace, traceReport } from "../src/index.js";
import { transformSource } from "../src/transform/index.js";

/** Runs transformed source with `trace` bound to the library, returning the module's `result`. */
function runTransformed(source: string): unknown {
  const body = source.replace(/^import .*$/m, "");
  return new Function("trace", `${body}\nreturn result;`)(trace);
}

describe("transformed code behaves like the hand-written explicit form", () => {
  it("returns the same value as the explicit form", () => {
    const transformed = transformSource(
      'import { trace } from "@gabrielvfonseca/backstep";\nconst items = [{ p: 2, ok: true }, { p: 5, ok: false }];\nconst result = trace("sum", () => items.filter((i) => i.ok).map((i) => i.p).reduce((a, b) => a + b, 0));',
      "a.ts",
    ).code;
    const explicit = [
      { ok: true, p: 2 },
      { ok: false, p: 5 },
    ]
      .filter((i) => i.ok)
      .map((i) => i.p)
      .reduce((a, b) => a + b, 0);
    expect(runTransformed(transformed)).toBe(explicit);
  });

  it("produces a report that points at the dropping step", () => {
    const sink = vi.fn();
    configure({ enabled: true, onReport: sink });
    try {
      const source = transformSource(
        'import { trace } from "@gabrielvfonseca/backstep";\nconst order = { items: [{ ok: false }, { ok: false }] };\nconst result = trace("order.total", () => order.items.filter((i) => i.ok).map((i) => i.ok).reduce((a, b) => a + b, 0));',
        "a.ts",
      ).code;
      expect(runTransformed(source)).toBe(0);
      expect(sink).toHaveBeenCalledTimes(1);
      expect(sink.mock.calls[0]?.[0].divergedAt).toBe(0);
      expect(sink.mock.calls[0]?.[0].steps[0].kind).toBe("filter");
    } finally {
      resetConfig();
    }
  });

  it("traceReport is still usable on the explicit input", () => {
    const { value } = traceReport("x", [1, 2], (xs) => xs.map((x) => x * 2));
    expect(value).toEqual([2, 4]);
  });
});
