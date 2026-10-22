// ABOUTME: The esbuild config of the pnpm-and-bundler skill example: one entry, bundled for an ES2022 browser.
// ABOUTME: In the repository's Playwright run, SCORE_EDITOR_LOCAL and SCORE_EDITOR_OUTFILE point it at the local build.
import { build } from "esbuild";

const local = process.env.SCORE_EDITOR_LOCAL;
const alias = local
  ? {
      "@neta-art/score-editor": `${local.replace(/\/$/, "")}/packages/score-editor/dist/index.js`,
      "@neta-art/score-dialect-song2": `${local.replace(/\/$/, "")}/packages/score-dialect-song2/dist/index.js`,
    }
  : undefined;

await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: process.env.SCORE_EDITOR_OUTFILE ?? "dist/main.js",
  ...(alias ? { alias } : {}),
  logLevel: "info",
});
