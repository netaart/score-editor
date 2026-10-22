// ABOUTME: The export-coverage check of the editor skill: every public export of either package entry must be named in the skill.
// ABOUTME: It reads the entry sources with the TypeScript API, requires each name in references/api.md and anywhere in the skill, and checks the example's pins.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const skillDir = join(root, "packages/score-editor/skill");
const entries = [
  { package: "@neta-art/score-editor", file: join(root, "packages/score-editor/src/index.ts") },
  { package: "@neta-art/score-dialect-song2", file: join(root, "packages/score-dialect-song2/src/index.ts") },
];

const program = ts.createProgram(
  entries.map((entry) => entry.file),
  {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  },
);
const checker = program.getTypeChecker();

/** Every name an entry exports, including types and names re-exported from another module. */
function exportedNames(entry) {
  const source = program.getSourceFile(entry.file);
  if (!source) throw new Error(`Cannot read the entry ${entry.file}`);
  const symbol = checker.getSymbolAtLocation(source);
  if (!symbol) throw new Error(`Cannot read the exports of ${entry.file}`);
  return checker.getExportsOfModule(symbol).map((found) => found.getName());
}

/** Every text file under the skill, so an export may be named in a reference, a README or an example. */
function skillFiles(dir = skillDir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((found) => {
    const path = join(dir, found.name);
    return found.isDirectory() ? skillFiles(path) : [path];
  });
}

const files = skillFiles();
const text = files.map((file) => readFileSync(file, "utf8")).join("\n");
const api = readFileSync(join(skillDir, "references/api.md"), "utf8");
const mentions = (haystack, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_$])${escaped}([^A-Za-z0-9_$]|$)`).test(haystack);
};

let failed = false;
for (const entry of entries) {
  const names = exportedNames(entry);
  const missing = names.filter((name) => !mentions(text, name));
  const unlisted = names.filter((name) => !mentions(api, name));
  if (missing.length > 0) {
    failed = true;
    console.error(`${entry.package}: ${missing.length} public export(s) not mentioned in the skill:`);
    console.error(`  ${missing.join(", ")}`);
    console.error("Add each one to its layer reference and to references/api.md.");
  } else if (unlisted.length > 0) {
    failed = true;
    console.error(`${entry.package}: ${unlisted.length} public export(s) missing from references/api.md:`);
    console.error(`  ${unlisted.join(", ")}`);
  } else {
    console.log(`${entry.package}: all ${names.length} public exports are mentioned in the skill and listed in api.md`);
  }
}

const coreVersion = JSON.parse(readFileSync(join(root, "packages/score-editor/package.json"), "utf8")).version;
const example = JSON.parse(readFileSync(join(skillDir, "assets/pnpm-bundler/package.json"), "utf8")).dependencies;
for (const name of ["@neta-art/score-editor", "@neta-art/score-dialect-song2"]) {
  if (example[name] !== coreVersion) {
    failed = true;
    console.error(`${name}: the bundler example pins ${example[name]}, the package is ${coreVersion}`);
  }
}
if (!failed) console.log(`The bundler example pins the package version ${coreVersion} exactly.`);
process.exit(failed ? 1 : 0);
