// ABOUTME: Page-side half of the mount seam: mounts the built editor on a song project and exposes window.harness.
// ABOUTME: The host is the bare test page; it builds the dialect registry and fetches the test scores itself.

import { syntheticSong } from "/e2e/page/synthetic.js";
import { song2Dialect } from "/packages/score-dialect-song2/dist/index.js";
import { createDialectRegistry, mount } from "/packages/score-editor/dist/index.js";

const stage = document.getElementById("stage");
const dialects = createDialectRegistry([song2Dialect]);
const TESTS = "/packages/score-dialect-song2/tests/";
let editor = null;
let project = null;
let vectors = null;

/**
 * The score text a test asks for: `{ sample }` is a file of the dialect's samples, `{ vector }` the text of a
 * vector in vectors.json, `{ text }` the text itself, `{ synthetic }` the arguments of syntheticSong.
 */
async function scoreText(source) {
  if (source.text !== undefined) return source.text;
  if (source.synthetic !== undefined) return syntheticSong(source.synthetic);
  if (source.sample !== undefined) return (await fetch(`${TESTS}samples/${source.sample}.abc`)).text();
  vectors ??= (await (await fetch(`${TESTS}vectors.json`)).json()).vectors;
  const found = vectors.find((vector) => vector.id === source.vector);
  if (!found) throw new Error(`no vector ${source.vector}`);
  return found.text;
}

async function projectFrom(previous, score, fields) {
  const text = score === undefined ? previous.score : await scoreText(score);
  return { ...previous, ...fields, score: text };
}

const blank = {
  style: "",
  lyrics: "",
  score: "",
  scoreMode: "full",
  seed: null,
  modelId: "song2",
  sourceKey: "test-page",
};

window.harness = {
  stage,
  shadowRoot: null,
  /**
   * Mounts on the stage. `score` says which score text (default: a small two-voice sample), `project` overrides
   * other project fields, and `shadow` mounts inside an open shadow root of a host element instead.
   */
  async mount({ score = { sample: "compact-three-sections" }, project: fields, shadow, ...options } = {}) {
    project = await projectFrom(blank, score, fields);
    let target = stage;
    if (shadow) {
      const host = document.createElement("div");
      host.id = "shadow-host";
      stage.append(host);
      window.harness.shadowRoot = host.attachShadow({ mode: "open" });
      target = document.createElement("div");
      target.style.height = "420px";
      window.harness.shadowRoot.append(target);
    }
    editor = mount(target, { language: "en", project, dialects, ...options });
  },
  async update({ score, project: fields, ...options } = {}) {
    if (score !== undefined || fields !== undefined) {
      project = await projectFrom(project, score, fields);
      options.project = project;
    }
    editor.update(options);
  },
  destroy() {
    editor.destroy();
  },
};

// `?demo` mounts on load, for looking at the page by hand: `&lang=zh`, `&readonly`, `&big` (a 128-bar score),
// `&sample=name` or `&vector=id` for a test score.
const params = new URLSearchParams(location.search);
if (params.has("demo")) {
  const score = params.has("big")
    ? { synthetic: { bars: 128, notes: 1500 } }
    : params.has("vector")
      ? { vector: params.get("vector") }
      : { sample: params.get("sample") ?? "compact-three-sections" };
  window.harness.mount({
    language: params.get("lang") === "zh" ? "zh" : "en",
    editable: !params.has("readonly"),
    score,
  });
}
