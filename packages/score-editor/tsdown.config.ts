import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "browser",
  // Keep .js/.d.ts so the package.json exports stay stable for "type": "module" packages.
  fixedExtension: false,
  dts: true,
  sourcemap: true,
  clean: true,
  shims: false,
});
