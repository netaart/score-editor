// ABOUTME: Measures the mounted arrangement view at a realistic song size in Chromium: first render, zoom, scrolling.
// ABOUTME: Evidence for docs/spike.md, not a test: it asserts nothing. Run it after `pnpm build`; see AGENTS.md.
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const args = new Map(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
const headed = args.has("headed");
const selectAll = args.has("select-all");
const throttle = Number(args.get("throttle") ?? 1);
const bars = Number(args.get("bars") ?? 128);
const notes = Number(args.get("notes") ?? 1500);
const runs = Number(args.get("runs") ?? 5);
const port = Number(process.env.E2E_PORT ?? 4312);

const server = spawn("node", ["e2e/serve.mjs"], { env: { ...process.env, E2E_PORT: String(port) }, stdio: "ignore" });
console.error(`static server pid ${server.pid} on port ${port}`);
// A run that throws still stops the server it started.
process.on("exit", () => server.kill());
// The server bundles abcjs before it listens, so wait until it answers instead of for a fixed time.
for (let tries = 0; ; tries++) {
  const answered = await fetch(`http://127.0.0.1:${port}/`).then(
    (response) => response.ok,
    () => false,
  );
  if (answered) break;
  if (tries > 200) throw new Error(`the static server did not answer on port ${port}`);
  await new Promise((resolve) => setTimeout(resolve, 100));
}

/** Page-side recorder: frame gaps, long tasks and the delay from a pointer event to the frame that follows it. */
function installRecorder() {
  const rec = { startedAt: 0, running: false, frames: [], longTasks: [], latency: [], pending: null, slowFrames: [] };
  window.__rec = rec;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (rec.running && entry.startTime >= rec.startedAt) rec.longTasks.push(entry.duration);
    }
  }).observe({ entryTypes: ["longtask"] });
  // Long animation frames say where the time went: script, or style and layout, or the render step after them.
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!rec.running || entry.startTime < rec.startedAt || entry.duration < 50) continue;
      rec.slowFrames.push({
        durationMs: Math.round(entry.duration),
        scriptMs: Math.round(entry.scripts.reduce((sum, script) => sum + script.duration, 0)),
        styleAndLayoutMs: Math.round(entry.startTime + entry.duration - entry.styleAndLayoutStart),
        renderMs: Math.round(entry.startTime + entry.duration - entry.renderStart),
        scripts: entry.scripts.map(
          (script) => `${script.invoker} ${script.sourceFunctionName} ${Math.round(script.duration)}ms`,
        ),
      });
    }
  }).observe({ type: "long-animation-frame", buffered: false });
  document.addEventListener(
    "pointermove",
    (event) => {
      if (rec.running && rec.pending === null) rec.pending = event.timeStamp;
    },
    true,
  );
  rec.start = () => {
    rec.startedAt = performance.now();
    Object.assign(rec, { running: true, frames: [], longTasks: [], latency: [], pending: null, slowFrames: [] });
    let last = performance.now();
    const loop = (now) => {
      if (!rec.running) return;
      rec.frames.push(now - last);
      last = now;
      if (rec.pending !== null) {
        rec.latency.push(now - rec.pending);
        rec.pending = null;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  rec.stop = () => {
    rec.running = false;
    return { frames: rec.frames, longTasks: rec.longTasks, latency: rec.latency, slowFrames: rec.slowFrames };
  };
}

function stats(values) {
  if (values.length === 0) return { n: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  const round = (v) => Math.round(v * 10) / 10;
  return {
    n: values.length,
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    p99: round(at(0.99)),
    max: round(sorted.at(-1)),
  };
}

function summarize({ frames, longTasks, latency, slowFrames }) {
  return {
    slowFrames,
    frameMs: stats(frames),
    framesOver20ms: frames.filter((v) => v > 20).length,
    framesOver33ms: frames.filter((v) => v > 33).length,
    framesOver50ms: frames.filter((v) => v > 50).length,
    longTasks: {
      count: longTasks.length,
      maxMs: Math.round(Math.max(0, ...longTasks)),
      totalMs: Math.round(longTasks.reduce((a, b) => a + b, 0)),
    },
    inputToFrameMs: stats(latency),
  };
}

const browser = await chromium.launch({ headless: !headed });
const result = { chromium: browser.version(), headed, cpuThrottle: throttle, bars, notes };
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.evaluate(() => {
    window.harness.stage.style.height = "700px";
  });
  await page.evaluate(installRecorder);

  // First render: mount() itself, which reads the score text through the dialect, and until the second animation
  // frame after it (the first frame is out by then). The parse is also timed alone, on the same text.
  const mounts = [];
  for (let run = 0; run < runs; run++) {
    mounts.push(
      await page.evaluate(
        async ({ bars, notes, last }) => {
          const { mount, createDialectRegistry } = await import("/packages/score-editor/dist/index.js");
          const { song2Dialect } = await import("/packages/score-dialect-song2/dist/index.js");
          const { syntheticSong } = await import("/e2e/page/synthetic.js");
          const score = syntheticSong({ bars, notes });
          const dialects = createDialectRegistry([song2Dialect]);
          const project = {
            style: "",
            lyrics: "",
            score,
            scoreMode: "full",
            seed: null,
            modelId: "song2",
            sourceKey: "m",
          };
          const t0 = performance.now();
          const editor = mount(window.harness.stage, { language: "en", project, dialects });
          const t1 = performance.now();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const t2 = performance.now();
          const nodes = document.querySelectorAll("*").length;
          const heap = performance.memory?.usedJSHeapSize ?? 0;
          if (!last) editor.destroy();
          else window.__editor = editor;
          const p0 = performance.now();
          song2Dialect.parse(score);
          const parseMs = performance.now() - p0;
          return { mountMs: t1 - t0, firstFrameMs: t2 - t0, parseMs, nodes, heapMB: Math.round(heap / 1e6) };
        },
        { bars, notes, last: run === runs - 1 },
      ),
    );
    if (run < runs - 1) await page.waitForTimeout(100);
  }
  const round = (v) => Math.round(v);
  result.firstRender = {
    coldFirstFrameMs: round(mounts[0].firstFrameMs),
    coldMountMs: round(mounts[0].mountMs),
    warmFirstFrameMs: stats(mounts.slice(1).map((m) => m.firstFrameMs)),
    warmMountMs: stats(mounts.slice(1).map((m) => m.mountMs)),
    parseMs: stats(mounts.map((m) => m.parseMs)),
    domNodes: mounts.at(-1).nodes,
    jsHeapMB: mounts.at(-1).heapMB,
  };

  // With --select-all every note is selected before the gestures below, and the key press that selects them is timed
  // from the key to the second frame after it, three times (Escape clears the selection between the presses).
  if (selectAll) {
    await page.locator(".sce-note").first().click();
    const presses = [];
    for (let run = 0; run < 3; run++) {
      await page.evaluate(() => {
        window.__selectAll = null;
        document.addEventListener(
          "keydown",
          () => {
            const t0 = performance.now();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                window.__selectAll = performance.now() - t0;
              }),
            );
          },
          { capture: true, once: true },
        );
      });
      await page.keyboard.press("Control+a");
      await page.waitForFunction(() => window.__selectAll !== null);
      presses.push(await page.evaluate(() => window.__selectAll));
      if (run < 2) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      }
    }
    result.selectAll = {
      selectedNotes: await page.locator(".sce-note[data-selected]").count(),
      keyToSecondFrameMs: stats(presses),
    };
  }

  // The repeated mounts above leave garbage; collect it now so a collection does not land inside a measured gesture.
  await cdp.send("HeapProfiler.collectGarbage");
  await page.waitForTimeout(300);

  // Zooming with the buttons: each step lays the whole time axis out again.
  const zoomButtons = [];
  for (let run = 0; run < 3; run++) {
    await page.evaluate(() => window.__rec.start());
    for (const name of ["Zoom in", "Zoom in", "Zoom in", "Zoom out", "Zoom out", "Zoom out", "Zoom out", "Zoom in"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await page.waitForTimeout(120);
    }
    zoomButtons.push(summarize(await page.evaluate(() => window.__rec.stop())));
  }
  result.zoomButtons = zoomButtons;

  // Scrolling: wheel input (compositor driven) and a script that moves scrollLeft every frame (main thread driven).
  const scrollBox = await page.evaluate(() => {
    const r = document.querySelector('[role="region"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(scrollBox.x, scrollBox.y);
  await page.evaluate(() => window.__rec.start());
  for (let step = 0; step < 90; step++) {
    await page.mouse.wheel(90, 0);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(200);
  const scrolled = await page.evaluate(() => document.querySelector('[role="region"]').scrollLeft);
  result.wheelScroll = {
    ...summarize(await page.evaluate(() => window.__rec.stop())),
    scrollLeftReached: Math.round(scrolled),
  };

  await page.evaluate(() => {
    document.querySelector('[role="region"]').scrollLeft = 0;
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__rec.start());
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const scroller = document.querySelector('[role="region"]');
        let frames = 0;
        const step = () => {
          scroller.scrollLeft += 40;
          if (++frames < 240) requestAnimationFrame(step);
          else resolve(undefined);
        };
        requestAnimationFrame(step);
      }),
  );
  result.scriptScroll = summarize(await page.evaluate(() => window.__rec.stop()));

  // Scrolling in pitch with the wheel, then the control wheel zooming around the pointer.
  await page.mouse.move(scrollBox.x, scrollBox.y);
  await page.evaluate(() => window.__rec.start());
  for (let step = 0; step < 60; step++) {
    await page.mouse.wheel(0, step < 30 ? 40 : -40);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(200);
  result.pitchScroll = summarize(await page.evaluate(() => window.__rec.stop()));

  await page.mouse.move(scrollBox.x, scrollBox.y);
  await page.keyboard.down("Control");
  await page.evaluate(() => window.__rec.start());
  for (let step = 0; step < 60; step++) {
    await page.mouse.wheel(0, step < 30 ? -60 : 60);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(200);
  result.zoomWheel = summarize(await page.evaluate(() => window.__rec.stop()));
  await page.keyboard.up("Control");
} finally {
  await browser.close();
  server.kill();
}
console.log(JSON.stringify(result, null, 2));
