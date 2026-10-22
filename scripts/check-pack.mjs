// ABOUTME: Asserts what each package's npm tarball will hold: its build output, LICENSE, README and manifest, plus the core skill.
// ABOUTME: Run after `pnpm build`, before publishing; it exits non-zero and names the package when a file is missing or extra.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packages = [
  { dir: "packages/score-editor", skill: true },
  { dir: "packages/score-dialect-song2", skill: false },
];
const common = ["LICENSE", "README.md", "package.json", "dist/index.js", "dist/index.d.ts"];

let failed = false;
for (const { dir, skill } of packages) {
  const required = skill ? [...common, "skill/SKILL.md"] : common;
  const allowed = (path) => required.includes(path) || path.startsWith("dist/") || (skill && path.startsWith("skill/"));
  const out = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: `${root}${dir}`,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const [{ name, version, files }] = JSON.parse(out);
  const paths = files.map((file) => file.path);
  const extra = paths.filter((path) => !allowed(path));
  const missing = required.filter((path) => !paths.includes(path));
  if (skill) {
    if (!paths.some((path) => path.startsWith("skill/references/"))) missing.push("skill/references/*");
    if (!paths.some((path) => path.startsWith("skill/assets/"))) missing.push("skill/assets/*");
  }
  if (extra.length > 0 || missing.length > 0) {
    failed = true;
    console.error(`${name}@${version}: extra ${JSON.stringify(extra)}, missing ${JSON.stringify(missing)}`);
  } else {
    console.log(`${name}@${version}: ${paths.length} files`);
  }
}
process.exit(failed ? 1 : 0);
