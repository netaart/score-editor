// ABOUTME: Page-side half of the mount seam: mounts the built editor, or single view parts on one session, and exposes window.harness.
// ABOUTME: The host is the bare test page; it builds the dialect registry and fetches the test scores itself.

import { syntheticSong } from "/e2e/page/synthetic.js";
import { song2Dialect } from "/packages/score-dialect-song2/dist/index.js";
import {
  createDialectRegistry,
  createEditingSession,
  mount,
  mountChordTrack,
  mountCutNotice,
  mountProblemView,
  mountTimeRuler,
  mountVoiceTrack,
  mountZoomControl,
} from "/packages/score-editor/dist/index.js";

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

/** The view parts of the layout page, by name, each with the function that mounts it on its slot. */
const LAYOUT_PARTS = {
  zoom: (el, session) => mountZoomControl(el, session),
  notice: (el, session) => mountCutNotice(el, session),
  ruler: (el, session) => mountTimeRuler(el, session),
  chords: (el, session) => mountChordTrack(el, session),
  vocal: (el, session) => mountVoiceTrack(el, session, { voice: "Vocal" }),
  ins: (el, session) => mountVoiceTrack(el, session, { voice: "Ins" }),
  problem: (el, session) => mountProblemView(el, session),
};

/** A layout of the host's own, nothing like the editor's: parts in cards of different widths, one slot for each. */
function buildLayout(container) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:12px;font:13px Georgia, serif">
      <div data-slot="zoom"></div>
      <div data-slot="notice"></div>
      <div style="width:min(560px,100%)"><div data-slot="ruler"></div><div data-slot="chords"></div></div>
      <div style="width:min(420px,100%)"><div data-slot="vocal"></div></div>
      <div style="width:min(700px,100%)"><div data-slot="ins"></div></div>
      <div data-slot="problem"></div>
    </div>`;
  return Object.fromEntries([...container.querySelectorAll("[data-slot]")].map((el) => [el.dataset.slot, el]));
}

function mountLayoutParts(slots, session, names) {
  return Object.fromEntries(names.map((name) => [name, LAYOUT_PARTS[name](slots[name], session)]));
}

const layout = {
  session: null,
  parts: {},
  slots: {},
  shadowRoot: null,
  host: null,
  /**
   * Opens one editing session and mounts the named view parts (all of them by default) on it, each on its own slot of
   * a layout the page builds itself. `shadow` builds the layout inside an open shadow root.
   */
  async open({ score = { sample: "compact-three-sections" }, language = "en", project: fields, parts, shadow } = {}) {
    if (layout.session) throw new Error("a layout is already open");
    const base = await projectFrom(blank, score, fields);
    const host = document.createElement("div");
    host.id = "layout-host";
    document.body.append(host);
    layout.shadowRoot = null;
    let container = host;
    if (shadow) {
      layout.shadowRoot = host.attachShadow({ mode: "open" });
      container = document.createElement("div");
      layout.shadowRoot.append(container);
    }
    layout.host = host;
    layout.slots = buildLayout(container);
    layout.session = createEditingSession({ project: base, dialects, language });
    layout.parts = mountLayoutParts(layout.slots, layout.session, parts ?? Object.keys(LAYOUT_PARTS));
  },
  /** Replaces the project from outside, the way update does for the editor. */
  async replace({ score, project: fields }) {
    layout.session.replaceProject(await projectFrom(layout.session.project, score, fields));
  },
  /** Mounts one more part on the open session, as a host does that adds a view later. */
  mountPart(name) {
    layout.parts[name] = LAYOUT_PARTS[name](layout.slots[name], layout.session);
  },
  /** Destroys one part, `times` times over: a second destroy must be harmless. */
  destroyPart(name, times = 1) {
    const part = layout.parts[name];
    delete layout.parts[name];
    for (let at = 0; at < times; at++) part.destroy();
  },
  /** The markup of what each mounted part draws. */
  roots() {
    return Object.fromEntries(Object.keys(layout.parts).map((name) => [name, layout.slots[name].innerHTML]));
  },
  /** The markup the same parts draw when they are mounted fresh on a new session that holds the same state. */
  freshRoots() {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-10000px;top:0;width:900px";
    document.body.append(host);
    const slots = buildLayout(host);
    const { project, view } = layout.session;
    const session = createEditingSession({ project, dialects, language: view.language });
    session.setView({ zoom: view.zoom });
    const parts = mountLayoutParts(slots, session, Object.keys(layout.parts));
    const html = Object.fromEntries(Object.keys(parts).map((name) => [name, slots[name].innerHTML]));
    for (const part of Object.values(parts)) part.destroy();
    host.remove();
    return html;
  },
  /** Destroys every part and removes the layout. The shadow root stays reachable, so a test can see what it holds. */
  close() {
    for (const part of Object.values(layout.parts)) part.destroy();
    layout.host?.remove();
    Object.assign(layout, { session: null, parts: {}, slots: {}, host: null });
  },
};

window.harness = {
  stage,
  layout,
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
