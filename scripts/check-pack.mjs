// ABOUTME: Asserts what each package's npm tarball will hold: its build output, LICENSE, README and manifest, nothing else.
// ABOUTME: Run after `pnpm build`, before publishing; it exits non-zero and names the package when a file is missing or extra.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packages = ["packages/score-editor", "packages/score-dialect-song2"];
const required = ["LICENSE", "README.md", "package.json", "dist/index.js", "dist/index.d.ts"];
const allowed = (path) => required.includes(path) || path.startsWith("dist/");

let failed = false;
for (const dir of packages) {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: `${root}${dir}`,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const [{ name, version, files }] = JSON.parse(out);
  const paths = files.map((file) => file.path);
  const extra = paths.filter((path) => !allowed(path));
  const missing = required.filter((path) => !paths.includes(path));
  if (extra.length > 0 || missing.length > 0) {
    failed = true;
    console.error(`${name}@${version}: extra ${JSON.stringify(extra)}, missing ${JSON.stringify(missing)}`);
  } else {
    console.log(`${name}@${version}: ${paths.length} files`);
  }
}
process.exit(failed ? 1 : 0);
