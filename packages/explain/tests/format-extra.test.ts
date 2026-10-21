import { describe, expect, it } from "vitest";
import { summarizeError } from "../src/errors.js";
import { DEFAULT_REDACT_KEYS, formatValue } from "../src/format.js";

const opts = { maxDepth: 3, maxItems: 6, maxStringLength: 80, redactKeys: DEFAULT_REDACT_KEYS };

describe("format edge cases", () => {
  it("renders an error whose message cannot be stringified", () => {
    expect(
      summarizeError({
        toString: () => {
          throw new Error("nope");
        },
      }),
    ).toEqual({
      name: "Error",
      message: "[unprintable value]",
    });
  });

  it("summarises an Error and a plain thrown value", () => {
    expect(summarizeError(new TypeError("bad"))).toEqual({ name: "TypeError", message: "bad" });
    expect(summarizeError("text")).toEqual({ name: "Error", message: "text" });
  });

  it("renders class instances using the inferred class name", () => {
    const Inferred = class {};
    expect(formatValue(new Inferred(), opts)).toBe("Inferred {}");
  });

  it("renders an object with a non-function constructor as plain", () => {
    expect(formatValue(Object.assign(Object.create(null), { constructor: 1, a: 2 }), opts)).toBe(
      "{constructor: 1, a: 2}",
    );
  });

  it("truncates at depth for arrays and objects", () => {
    expect(formatValue([[[[1]]]], { ...opts, maxDepth: 1 })).toBe("[[…1]]");
  });

  it("renders objects with unusual keys", () => {
    expect(formatValue({ "a b": 1, $ok: 2 }, opts)).toBe('{"a b": 1, $ok: 2}');
  });
});
