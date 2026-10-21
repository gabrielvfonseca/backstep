import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as esbuild from "esbuild";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { valueLineage } from "../src/transform/esbuild.js";

const libraryEntry = resolve(import.meta.dirname, "../src/index.ts");

describe("valueLineage esbuild plugin", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "backstep-"));
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
    vi.restoreAllMocks();
  });

  it("rewrites inline chains in a bundled app and the bundle reports the divergence", async () => {
    const entry = join(dir, "app.ts");
    await writeFile(
      entry,
      [
        'import { trace } from "backstep";',
        "const order = { items: [{ stock: 0 }, { stock: 0 }] };",
        'export const total = trace("order.total", () =>',
        "  order.items.filter((i) => i.stock > 0).map((i) => i.stock).reduce((a, b) => a + b, 0),",
        ");",
        "",
      ].join("\n"),
    );

    const result = await esbuild.build({
      alias: { backstep: libraryEntry },
      bundle: true,
      entryPoints: [entry],
      format: "cjs",
      logLevel: "silent",
      platform: "node",
      plugins: [valueLineage()],
      write: false,
    });
    const code = result.outputFiles[0]?.text ?? "";
    expect(code).toContain("__backstep_input");

    const warn = vi.fn();
    const originalWarn = console.warn;
    console.warn = warn;
    try {
      const module = { exports: {} as Record<string, unknown> };
      new Function("module", "exports", "require", code)(module, module.exports, require);
      expect(module.exports).toHaveProperty("total", 0);
    } finally {
      console.warn = originalWarn;
    }
    const printed = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(printed).toContain("diverged at step 1");
    expect(printed).toContain("removed all 2 element(s)");
  });

  it("leaves node_modules and non-matching files untouched", async () => {
    const entry = join(dir, "plain.js");
    await writeFile(entry, "export const v = [1, 2].map((x) => x * 2);\n");
    const result = await esbuild.build({
      bundle: true,
      entryPoints: [entry],
      format: "esm",
      logLevel: "silent",
      plugins: [valueLineage()],
      write: false,
    });
    expect(result.outputFiles[0]?.text).toContain("x * 2");
    expect(result.outputFiles[0]?.text).not.toContain("__backstep_input");
  });
});
