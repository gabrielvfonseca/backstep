import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    transform: "src/transform/index.ts",
    esbuild: "src/transform/esbuild.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  treeshake: true,
  external: ["@babel/parser", "esbuild", "node:fs/promises"],
});
