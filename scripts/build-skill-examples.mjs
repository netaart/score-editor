// ABOUTME: Builds the skill's bundler example for the repository's browser tests, with both package imports aliased to the local build.
// ABOUTME: The browser test fulfills the shipped bundler page's script request from the result; it is generated, never committed.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const example = join(root, "packages/score-editor/skills/score-editor/assets/pnpm-bundler");
const outfile = join(root, "e2e/page/skill/pnpm-bundler.js");
mkdirSync(dirname(outfile), { recursive: true });

execFileSync(process.execPath, ["esbuild.config.mjs"], {
  cwd: example,
  stdio: "inherit",
  env: { ...process.env, SCORE_EDITOR_LOCAL: root, SCORE_EDITOR_OUTFILE: outfile },
});
