// ABOUTME: Static server for the test page: serves e2e/page, the built package files, the editor skill's shipped examples and the song2 test scores.
// ABOUTME: Playwright starts it as its web server; run it by hand with E2E_PORT to look at the page.

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.E2E_PORT ?? 4310);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
  ".json": "application/json",
  ".abc": "text/plain; charset=utf-8",
};
const served = [
  /^\/e2e\/page\/[\w.-]+$/,
  /^\/packages\/[\w-]+\/dist\/[\w.-]+$/,
  /^\/packages\/score-editor\/skills\/score-editor\/[\w./-]+$/,
  /^\/packages\/score-dialect-song2\/tests\/(samples\/[\w-]+\.abc|vectors\.json)$/,
];

/**
 * abcjs is a CommonJS package, so a page with no bundler cannot import it. This is the bundler of the bare host: the page maps
 * the specifier "abcjs" to this one file, built once from the package the editor depends on.
 */
const abcjsRoute = "/e2e/page/vendor/abcjs.js";
let abcjsModule;
function buildAbcjs() {
  abcjsModule ??= build({
    stdin: { contents: `export { default } from "abcjs";`, resolveDir: join(root, "packages/score-editor") },
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    logLevel: "silent",
  }).then((result) => result.outputFiles[0].text);
  return abcjsModule;
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (path === abcjsRoute) {
    res.writeHead(200, { "content-type": types[".js"], "cache-control": "no-store" });
    res.end(await buildAbcjs());
    return;
  }
  const target = path === "/" ? "/e2e/page/index.html" : path;
  const file = normalize(join(root, target));
  if (!served.some((pattern) => pattern.test(target)) || !file.startsWith(root + sep)) {
    res.writeHead(404).end("not found");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": types[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(port, "127.0.0.1");
