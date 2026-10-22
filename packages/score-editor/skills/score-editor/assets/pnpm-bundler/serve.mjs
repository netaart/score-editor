// ABOUTME: The little static server of the pnpm-and-bundler skill example; it serves this folder for a browser.
// ABOUTME: Run it after `pnpm build`, then open the printed URL; it has no dependency and no build step of its own.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8080);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
};

createServer(async (request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  const target = path === "/" ? "/index.html" : path;
  const file = normalize(join(root, target));
  if (!file.startsWith(root + sep)) {
    response.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Open http://127.0.0.1:${port}/`);
});
