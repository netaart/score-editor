// ABOUTME: Static server for the test page: serves e2e/page, the built package files and the song2 test scores, nothing else.
// ABOUTME: Playwright starts it as its web server; run it by hand with E2E_PORT to look at the page.

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

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
  /^\/packages\/score-dialect-song2\/tests\/(samples\/[\w-]+\.abc|vectors\.json)$/,
];

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
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
