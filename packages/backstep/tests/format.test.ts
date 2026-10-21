import { describe, expect, it } from "vitest";
import {
  DEFAULT_REDACT_KEYS,
  type FormatOptions,
  formatShort,
  formatValue,
} from "../src/format.js";

const options: FormatOptions = {
  maxDepth: 3,
  maxItems: 6,
  maxStringLength: 80,
  redactKeys: DEFAULT_REDACT_KEYS,
};

describe("formatValue", () => {
  it("renders primitives unambiguously", () => {
    expect(formatValue("hi", options)).toBe('"hi"');
    expect(formatValue(-0, options)).toBe("-0");
    expect(formatValue(Number.NaN, options)).toBe("NaN");
    expect(formatValue(10n, options)).toBe("10n");
    expect(formatValue(undefined, options)).toBe("undefined");
    expect(formatValue(null, options)).toBe("null");
    expect(formatValue(Symbol("tag"), options)).toBe("Symbol(tag)");
    expect(formatValue(function named() {}, options)).toBe("[Function named]");
  });

  it("renders objects, class instances, and collections", () => {
    class Order {
      id = 1;
    }
    expect(formatValue({ id: "a1", "item-count": 2 }, options)).toBe('{id: "a1", "item-count": 2}');
    expect(formatValue(new Order(), options)).toBe("Order {id: 1}");
    expect(formatValue(Object.create(null), options)).toBe("{}");
    expect(formatValue(new Map([[1, 2]]), options)).toBe("Map(1)");
    expect(formatValue(new Set([1]), options)).toBe("Set(1)");
    expect(formatValue(/x/g, options)).toBe("/x/g");
    expect(formatValue(new Date(0), options)).toBe("1970-01-01T00:00:00.000Z");
    expect(formatValue(new Date(Number.NaN), options)).toBe("Invalid Date");
    expect(formatValue(new RangeError("out"), options)).toBe("RangeError: out");
  });

  it("truncates long arrays, long objects, and long strings", () => {
    expect(formatValue([1, 2, 3, 4], { ...options, maxItems: 2 })).toBe("[1, 2, …+2]");
    expect(formatValue({ a: 1, b: 2, c: 3 }, { ...options, maxItems: 1 })).toBe("{a: 1, …+2}");
    expect(formatValue("abcdef", { ...options, maxStringLength: 3 })).toBe('"abc…"');
  });

  it("bounds nesting depth", () => {
    expect(formatValue({ a: { b: { c: { d: 1 } } } }, options)).toBe("{a: {b: {c: {…}}}}");
    expect(formatValue([[[[1]]]], options)).toBe("[[[[…1]]]]".replace("[…1]", "[…1]"));
  });

  it("marks cycles instead of recursing", () => {
    const node: Record<string, unknown> = { name: "root" };
    node.self = node;
    expect(formatValue(node, options)).toBe('{name: "root", self: [Circular]}');
  });

  it("redacts sensitive keys", () => {
    expect(formatValue({ apiKey: "y", name: "z", password: "x" }, options)).toBe(
      '{apiKey: "[redacted]", name: "z", password: "[redacted]"}',
    );
  });

  it("renders keys in insertion order", () => {
    const entries = Object.fromEntries([
      ["zeta", 1],
      ["alpha", 2],
    ]);
    expect(formatValue(entries, options)).toBe("{zeta: 1, alpha: 2}");
  });

  it("shows throwing getters as unreadable and keeps going", () => {
    const hostile = {
      get bad() {
        throw new Error("no");
      },
      ok: 1,
    };
    expect(formatValue(hostile, options)).toBe("{bad: [unreadable], ok: 1}");
  });

  it("formats invalid dates and nested arrays of objects", () => {
    expect(formatValue([{ id: 1 }], options)).toBe("[{id: 1}]");
  });
});

describe("formatShort", () => {
  it("is compact for step labels and findings", () => {
    expect(formatShort({ id: "a1", nested: { deep: true }, stock: 0 }, DEFAULT_REDACT_KEYS)).toBe(
      '{id: "a1", nested: {…}, stock: 0}',
    );
    expect(formatShort([1, 2, 3, 4, 5], DEFAULT_REDACT_KEYS)).toBe("[1, 2, 3, …+2]");
  });
});
