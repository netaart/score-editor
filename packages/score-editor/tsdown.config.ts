import { defineConfig } from "tsdown";

export default defineConfig({
  // The stretch worklet is loaded by URL from the built index, so it is a second entry of its own.
  entry: ["src/index.ts", "src/stretch-worklet.ts"],
  format: ["esm"],
  platform: "browser",
  // Keep .js/.d.ts so the package.json exports stay stable for "type": "module" packages.
  fixedExtension: false,
  dts: true,
  sourcemap: true,
  clean: true,
  shims: false,
});
