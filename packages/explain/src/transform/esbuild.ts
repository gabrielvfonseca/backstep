import { readFile } from "node:fs/promises";
import type { Plugin } from "esbuild";
import { transformSource } from "./index.js";

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const TSX_FILE = /\.tsx$/;
const TS_FILE = /\.[cm]?ts$/;
const JSX_FILE = /\.jsx$/;

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
      build.onLoad({ filter: SOURCE_FILE }, async (args) => {
        if (args.path.includes("/node_modules/")) {
          return;
        }
        const source = await readFile(args.path, "utf8");
        const result = transformSource(source, args.path);
        if (!result.changed) {
          return;
        }
        return { contents: result.code, loader: loaderFor(args.path) };
      });
    },
  };
}

function loaderFor(path: string): "ts" | "tsx" | "jsx" | "js" {
  if (TSX_FILE.test(path)) {
    return "tsx";
  }
  if (TS_FILE.test(path)) {
    return "ts";
  }
  if (JSX_FILE.test(path)) {
    return "jsx";
  }
  return "js";
}
