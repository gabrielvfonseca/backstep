import { readFile } from "node:fs/promises";
import type { Plugin } from "esbuild";
import { transformSource } from "./index.js";

/**
 * esbuild plugin that applies the inline-chain transform to project source files. Files under
 * node_modules are never touched.
 *
 *   import { valueLineage } from "@gabrielvfonseca/value-lineage/esbuild";
 *   build({ plugins: [valueLineage()] });
 */
export function valueLineage(): Plugin {
  return {
    name: "@gabrielvfonseca/value-lineage",
    setup(build) {
      build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
        if (args.path.includes("/node_modules/")) {
          return undefined;
        }
        const source = await readFile(args.path, "utf8");
        const result = transformSource(source, args.path);
        if (!result.changed) {
          return undefined;
        }
        return { contents: result.code, loader: loaderFor(args.path) };
      });
    },
  };
}

function loaderFor(path: string): "ts" | "tsx" | "jsx" | "js" {
  if (/\.tsx$/.test(path)) {
    return "tsx";
  }
  if (/\.[cm]?ts$/.test(path)) {
    return "ts";
  }
  if (/\.jsx$/.test(path)) {
    return "jsx";
  }
  return "js";
}
