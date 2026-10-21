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
      message: "[unprintable value]",
      name: "Error",
    });
  });

  it("summarises an Error and a plain thrown value", () => {
    expect(summarizeError(new TypeError("bad"))).toEqual({ message: "bad", name: "TypeError" });
    expect(summarizeError("text")).toEqual({ message: "text", name: "Error" });
  });

  it("renders class instances using the inferred class name", () => {
    const Inferred = class {};
    expect(formatValue(new Inferred(), opts)).toBe("Inferred {}");
  });

  it("renders an object with a non-function constructor as plain", () => {
    expect(formatValue(Object.assign(Object.create(null), { a: 2, constructor: 1 }), opts)).toBe(
      "{a: 2, constructor: 1}",
    );
  });

  it("truncates at depth for arrays and objects", () => {
    expect(formatValue([[[[1]]]], { ...opts, maxDepth: 1 })).toBe("[[…1]]");
  });

  it("renders objects with unusual keys", () => {
    expect(formatValue({ $ok: 2, "a b": 1 }, opts)).toBe('{$ok: 2, "a b": 1}');
  });
});
