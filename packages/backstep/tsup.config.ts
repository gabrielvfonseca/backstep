import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    esbuild: "src/transform/esbuild.ts",
    index: "src/index.ts",
    transform: "src/transform/index.ts",
  },
  external: ["@babel/parser", "esbuild", "node:fs/promises"],
  format: ["esm", "cjs"],
  sourcemap: true,
  target: "es2022",
  treeshake: true,
});
