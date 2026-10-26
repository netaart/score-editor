// ABOUTME: Page-side half of the mount seam: mounts the built editor, or single view parts on one session, and exposes window.harness.
// ABOUTME: The host is the bare test page; it builds the dialect registry and fetches the test scores itself.

import { createFakeDraftStore } from "/e2e/page/draft-store.js";
import { syntheticSong } from "/e2e/page/synthetic.js";
import { song2Dialect } from "/packages/score-dialect-song2/dist/index.js";
import {
  createDialectRegistry,
  createEditingSession,
  mount,
  mountChordTrack,
  mountCutNotice,
  mountDraftConflict,
  mountFilterPanel,
  mountLyricTrack,
  mountProblemView,
  mountStaffView,
  mountStaleNotice,
  mountSynthPreview,
  mountTextView,
  mountTimeRuler,
  mountToolbar,
  mountViewSwitch,
  mountVoiceTrack,
  mountZoomControl,
  previewNote,
  previewPlayer,
} from "/packages/score-editor/dist/index.js";

const stage = document.getElementById("stage");
const dialects = createDialectRegistry([song2Dialect]);
const TESTS = "/packages/score-dialect-song2/tests/";
let editor = null;
let project = null;
let vectors = null;
/** The notices the mounted editor sent to its host, in order. */
const notices = [];
/** The host's draft store: what `drafts: true` in the options of `mount` and `update` stands for. */
const drafts = createFakeDraftStore();
const withDrafts = (options) => {
  if (options.drafts === true) return { ...options, drafts };
  if (options.drafts === false) return { ...options, drafts: undefined };
  return options;
};

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

/**
 * The song2 dialect with tempo changes the model allows but the format cannot write. A host that reads a format with
 * them hands the editor a `Score` that carries them; this is that host, so the staff cursor can be checked against one.
 */
function withTempoChanges(dialect, changes) {
  return {
    ...dialect,
    parse(text) {
      const result = dialect.parse(text);
      return result.score ? { ...result, score: { ...result.score, tempoChanges: changes } } : result;
    },
  };
}

/** The view parts of the layout page, by name, each with the function that mounts it on its slot. */
const LAYOUT_PARTS = {
  // The layout has a slot of its own for the preview control, so the toolbar leaves its own out.
  toolbar: (el, session) => mountToolbar(el, session, { synthPreview: false }),
  zoom: (el, session) => mountZoomControl(el, session),
  notice: (el, session) => mountCutNotice(el, session),
  ruler: (el, session) => mountTimeRuler(el, session),
  chords: (el, session) => mountChordTrack(el, session),
  vocal: (el, session) => mountVoiceTrack(el, session, { voice: "Vocal" }),
  ins: (el, session) => mountVoiceTrack(el, session, { voice: "Ins" }),
  problem: (el, session) => mountProblemView(el, session),
  synth: (el, session) => mountSynthPreview(el, session),
};

/**
 * A draft keeper already in conflict, for the conflict strip's lifetime case: the part reads its status, subscribes, and
 * takes the two ways out, so the stub answers those and nothing else.
 */
function conflictKeeper() {
  const listeners = new Set();
  return {
    status: "conflict",
    ready: Promise.resolve(),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    overwrite: () => Promise.resolve(),
    loadTheirs: () => Promise.resolve(),
    restoreOriginal: () => Promise.resolve(true),
    handoff: () => Promise.resolve("unchanged"),
    destroy() {
      listeners.clear();
    },
  };
}

/**
 * The view parts that stand for a view and not for a bar of the layout page: they have a slot only when a test asks for
 * them, and the lists of the parts the older specs walk through do not include them.
 */
const VIEW_PARTS = {
  text: (el, session) => mountTextView(el, session),
  staff: (el, session) => mountStaffView(el, session),
  stale: (el, session) => mountStaleNotice(el, session),
  switch: (el, session) => mountViewSwitch(el, session),
  "toolbar-views": (el, session) => mountToolbar(el, session, { viewSwitch: true }),
  filter: (el, session) => mountFilterPanel(el, session),
  "draft-conflict": (el, session) => mountDraftConflict(el, session, conflictKeeper()),
};

/**
 * Parts a test asks for by name that the lists above leave out on purpose: older specs walk those lists and name the
 * region of every part in them. These have a slot only when a test opens a layout with them.
 */
const EXTRA_PARTS = {
  lyrics: (el, session) => mountLyricTrack(el, session),
};

const PART_FACTORIES = { ...LAYOUT_PARTS, ...VIEW_PARTS, ...EXTRA_PARTS };

/** The parts that draw on the time axis. */
const AXIS_PART_NAMES = ["ruler", "chords", "vocal", "ins"];

/**
 * A layout of the host's own, nothing like the editor's: parts in cards of different widths, one slot for each. It is
 * styled by classes of host.css, since a strict style policy refuses inline style attributes.
 */
function viewCards(names) {
  return names
    .filter((name) => name in VIEW_PARTS || name in EXTRA_PARTS)
    .map(
      (name) => `<div class="layout-card layout-card-wide"><div class="layout-slot" data-slot="${name}"></div></div>`,
    )
    .join("");
}

/** The slots for view parts that are mounted after the layout was built, added at the end of its grid. */
function buildSlots(container, names) {
  container.querySelector(".layout-grid").insertAdjacentHTML("beforeend", viewCards(names));
  return Object.fromEntries(names.map((name) => [name, container.querySelector(`[data-slot="${name}"]`)]));
}

function buildLayout(container, names = []) {
  container.innerHTML = `
    <div class="layout-grid">
      <div class="layout-slot" data-slot="zoom"></div>
      <div class="layout-slot" data-slot="toolbar"></div>
      <div class="layout-slot" data-slot="notice"></div>
      <div class="layout-card layout-card-narrow">
        <div class="layout-slot" data-slot="ruler"></div><div class="layout-slot" data-slot="chords"></div>
      </div>
      <div class="layout-card layout-card-medium"><div class="layout-slot" data-slot="vocal"></div></div>
      <div class="layout-card layout-card-wide" data-card="ins"><div class="layout-slot" data-slot="ins"></div></div>
      <div class="layout-slot" data-slot="problem"></div>
      ${viewCards(names)}
      <div class="layout-slot" data-slot="synth"></div>
    </div>`;
  return Object.fromEntries([...container.querySelectorAll("[data-slot]")].map((el) => [el.dataset.slot, el]));
}

/**
 * What a host page does around the parts, one named layout at a time: the zoom control in a clipped box under a toast
 * ("covered-zoom"), a banner of the host's in front of the top of the Vocal track ("overlapping-banner"), the Ins
 * track further right than the others ("indented-track"), and the toolbar in a box too narrow for its controls
 * ("tight-toolbar").
 */
const SCENES = {
  "covered-zoom"(container, slots) {
    slots.zoom.classList.add("layout-clipped");
    const toast = document.createElement("div");
    toast.className = "layout-toast";
    container.append(toast);
  },
  "overlapping-banner"(_container, slots) {
    const banner = document.createElement("div");
    banner.className = "layout-banner";
    banner.textContent = "Host banner";
    slots.vocal.parentElement.append(banner);
  },
  "indented-track"(container) {
    container.querySelector('[data-card="ins"]').classList.add("layout-indented");
  },
  "tight-toolbar"(_container, slots) {
    slots.toolbar.classList.add("layout-tight");
  },
};

function mountLayoutParts(slots, session, names) {
  return Object.fromEntries(names.map((name) => [name, PART_FACTORIES[name](slots[name], session)]));
}

const layout = {
  session: null,
  parts: {},
  slots: {},
  shadowRoot: null,
  host: null,
  partNames: { all: Object.keys(LAYOUT_PARTS), axis: AXIS_PART_NAMES, views: Object.keys(VIEW_PARTS) },
  /** The session of the open layout. */
  live() {
    if (!layout.session) throw new Error("no layout is open");
    return layout.session;
  },
  /**
   * Opens one editing session and mounts the named view parts (all of them by default) on it, each on its own slot of
   * a layout the page builds itself. `shadow` builds the layout inside an open shadow root.
   */
  async open({
    score = { sample: "compact-three-sections" },
    language = "en",
    project: fields,
    parts,
    shadow,
    scene,
    editable,
    tempoChanges,
  } = {}) {
    if (layout.session) throw new Error("a layout is already open");
    const base = await projectFrom(blank, score, fields);
    const host = document.createElement("div");
    host.id = "layout-host";
    document.body.append(host);
    layout.shadowRoot = null;
    let container = host;
    if (shadow) {
      layout.shadowRoot = host.attachShadow({ mode: "open" });
      const styles = document.createElement("link");
      styles.rel = "stylesheet";
      styles.href = "/e2e/page/host.css";
      container = document.createElement("div");
      container.className = "layout-container";
      layout.shadowRoot.append(styles, container);
      await new Promise((resolve) => styles.addEventListener("load", resolve, { once: true }));
    }
    layout.host = host;
    const names = parts ?? Object.keys(LAYOUT_PARTS);
    layout.slots = buildLayout(container, names);
    if (scene) SCENES[scene](container, layout.slots);
    layout.session = createEditingSession({
      project: base,
      dialects: tempoChanges ? createDialectRegistry([withTempoChanges(song2Dialect, tempoChanges)]) : dialects,
      language,
      ...(editable === undefined ? {} : { editable }),
    });
    layout.parts = mountLayoutParts(layout.slots, layout.session, names);
  },
  /** Replaces the project from outside, the way update does for the editor. */
  async replace({ score, project: fields }) {
    layout.session.replaceProject(await projectFrom(layout.session.project, score, fields));
  },
  /** Reads the project with a new registry of the same dialects, the way a host that swaps its dialects does. */
  replaceDialects() {
    layout.session.replaceDialects(createDialectRegistry([song2Dialect]));
  },
  /** Mounts one more part on the open session, as a host does that adds a view later; `hidden` mounts it in a slot that is not shown. */
  mountPart(name, hidden = false) {
    if (!layout.slots[name]) {
      const container = layout.host.shadowRoot ?? layout.host;
      layout.slots[name] = buildSlots(container, [name])[name];
    }
    layout.slots[name].closest(".layout-card").style.display = hidden ? "none" : "";
    layout.parts[name] = PART_FACTORIES[name](layout.slots[name], layout.session);
  },
  /** Drives the mounted staff part's play position in seconds, or clears it for null. */
  setPlayPosition(seconds) {
    const staff = layout.parts.staff;
    if (!staff || typeof staff.setPlayPosition !== "function") throw new Error("no staff part is mounted");
    staff.setPlayPosition(seconds);
  },
  /** Shows or hides the box a mounted part stands in, as a host with tabs does. */
  setSlotHidden(name, hidden) {
    layout.slots[name].closest(".layout-card").style.display = hidden ? "none" : "";
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
    host.className = "layout-offscreen";
    document.body.append(host);
    const slots = buildLayout(host, Object.keys(layout.parts));
    const { project, view } = layout.session;
    const session = createEditingSession({ project, dialects, language: view.language, editable: view.editable });
    session.setView({ zoom: view.zoom });
    const parts = mountLayoutParts(slots, session, Object.keys(layout.parts));
    const html = Object.fromEntries(Object.keys(parts).map((name) => [name, slots[name].innerHTML]));
    for (const part of Object.values(parts)) part.destroy();
    host.remove();
    return html;
  },
  /** Sets theme variables on the element the layout sits in, the way a host themes the parts. */
  setTheme(variables) {
    for (const [name, value] of Object.entries(variables)) layout.host.style.setProperty(name, value);
  },
  /** Holds on to the nodes one part drew, to see later whether anything still reaches them. */
  retained: null,
  retain(name) {
    const root = layout.slots[name].firstElementChild;
    if (!root) throw new Error(`${name} drew no root`);
    layout.retained = { root, nodes: [root, ...root.querySelectorAll("*")] };
  },
  /** The markup the retained part root holds now. */
  retainedHtml() {
    return layout.retained.root.outerHTML;
  },
  /** What is left in the shadow root of a closed layout beyond the page's own layout boxes. */
  leftInShadowRoot() {
    const own = "link, .layout-container, .layout-grid, .layout-card, .layout-slot";
    return [...layout.shadowRoot.querySelectorAll("*")].filter((el) => !el.matches(own)).length;
  },
  /** Destroys every part and removes the layout. The shadow root stays reachable, so a test can see what it holds. */
  close() {
    for (const part of Object.values(layout.parts)) part.destroy();
    layout.host?.remove();
    Object.assign(layout, { session: null, parts: {}, slots: {}, host: null, retained: null });
  },
};

const HOST_RULES = {
  // A page with a rule for every svg, drawn over everything with !important.
  "hostile-svg":
    "svg, svg *, svg path, svg text { fill: red !important; stroke: red !important; font: italic 40px cursive !important; } svg { max-width: 50px !important; }",
  // A page with an !important rule on every element in the layout.
  important: "#layout-host span, #layout-host div { padding: 9px !important; color: red !important; }",
  // A page whose rules on plain elements are careless: they touch everything on the page that has no rule of its own.
  hostile: `
    body div, body span, body button { margin: 7px; padding: 9px; border: 3px solid red; border-radius: 0;
      background: yellow; color: red; font: italic 28px/3 cursive; letter-spacing: 4px; text-transform: uppercase;
      box-shadow: 0 0 0 5px green; position: static; opacity: 0.9; text-decoration: underline; }`,
};

/** Things a host page does to the document around the editor and its parts. */
const hostPage = {
  /** `inShadowRoot` puts the rules inside the open shadow root the editor or the layout was mounted in, instead of in the page. */
  addRules(kind, inShadowRoot = false) {
    const rules = document.createElement("style");
    rules.textContent = HOST_RULES[kind];
    (inShadowRoot ? (layout.shadowRoot ?? window.harness.shadowRoot) : document.head).append(rules);
  },
  setColorScheme(scheme) {
    document.documentElement.style.colorScheme = scheme;
  },
  addProbe() {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="probe"><button id="probe-button">Host button</button><span>Host text</span></div>',
    );
  },
};

window.harness = {
  stage,
  layout,
  notices,
  drafts,
  host: hostPage,
  shadowRoot: null,
  /** The single-note preview export, called as a host calls it. */
  previewNote,
  /** The preview player of the open layout's session, as a host reads and drives it. */
  previewPlayer: () => previewPlayer(layout.live()),
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
    notices.length = 0;
    editor = mount(target, {
      language: "en",
      project,
      dialects,
      notify: (notice) => notices.push(notice),
      ...withDrafts(options),
    });
  },
  async update({ score, project: fields, ...options } = {}) {
    if (score !== undefined || fields !== undefined) {
      project = await projectFrom(project, score, fields);
      options.project = project;
    }
    editor.update(withDrafts(options));
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
