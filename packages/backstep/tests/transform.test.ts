import { describe, expect, it } from "vitest";
import { transformSource } from "../src/transform/index.js";

const header = 'import { trace } from "backstep";\n';

describe("transformSource", () => {
  it("rewrites an expression-bodied chain to the explicit-input form", () => {
    const { code, changed } = transformSource(
      `${header}const total = trace("order.total", () => order.items.filter(isAvailable).map(getPrice));`,
      "app.ts",
    );
    expect(changed).toBe(true);
    expect(code).toContain(
      'trace("order.total", order.items, (__backstep_input) => __backstep_input.filter(isAvailable).map(getPrice))',
    );
  });

  it("rewrites a block body with a single return", () => {
    const { code } = transformSource(
      `${header}trace("x", () => { return data.map((d) => d.v); });`,
      "a.ts",
    );
    expect(code).toContain(
      'trace("x", data, (__backstep_input) => __backstep_input.map((d) => d.v))',
    );
  });

  it("keeps a trailing options argument", () => {
    const { code } = transformSource(
      `${header}trace("x", () => data.filter(ok), { always: true });`,
      "a.ts",
    );
    expect(code).toContain("(__backstep_input) => __backstep_input.filter(ok), { always: true })");
  });

  it("works through a namespace import", () => {
    const { code, changed } = transformSource(
      'import * as vl from "backstep";\nvl.trace("x", () => data.some(ok));',
      "a.js",
    );
    expect(changed).toBe(true);
    expect(code).toContain('vl.trace("x", data, (__backstep_input) => __backstep_input.some(ok))');
  });

  it("leaves calls alone when the chain does not start with an array method", () => {
    const source = `${header}trace("y", () => compute());\ntrace("z", () => obj.toString());`;
    const result = transformSource(source, "a.ts");
    expect(result.changed).toBe(false);
    expect(result.code).toBe(source);
  });

  it("leaves a trace that already takes an explicit input alone", () => {
    const source = `${header}trace("z", xs, (xs) => xs.length);`;
    expect(transformSource(source, "a.ts").changed).toBe(false);
  });

  it("ignores files that do not import backstep", () => {
    const source = 'import { trace } from "other";\ntrace("x", () => data.map(f));';
    expect(transformSource(source, "a.ts").changed).toBe(false);
  });

  it("skips async callbacks and callbacks with parameters", () => {
    const source = `${header}trace("a", async () => data.map(f));\ntrace("b", (x) => x.map(f));`;
    expect(transformSource(source, "a.ts").changed).toBe(false);
  });

  it("does not rewrite when the parameter name is already in use", () => {
    const source = `${header}const __backstep_input = 1;\ntrace("a", () => data.map(f));`;
    expect(transformSource(source, "a.ts").changed).toBe(false);
  });

  it("rewrites several calls in one file, leaving the others intact", () => {
    const { code } = transformSource(
      `${header}trace("a", () => xs.map(f));\ntrace("b", () => ys.filter(g));`,
      "a.ts",
    );
    expect(code).toContain('trace("a", xs, (__backstep_input) => __backstep_input.map(f))');
    expect(code).toContain('trace("b", ys, (__backstep_input) => __backstep_input.filter(g))');
  });

  it("parses TSX and plain JS as well as TypeScript", () => {
    expect(
      transformSource(`${header}const el = <div />;\ntrace("a", () => xs.map(f));`, "a.tsx")
        .changed,
    ).toBe(true);
    expect(transformSource(`${header}trace("a", () => xs.map(f));`, "a.js").changed).toBe(true);
  });

  it("reports a syntax error with the file in the message", () => {
    expect(() => transformSource(`${header}trace("a", () => (;`, "broken.ts")).toThrow();
  });
});
