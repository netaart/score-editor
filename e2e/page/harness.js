// ABOUTME: Page-side half of the mount seam: mounts the built editor, or single view parts on one session, and exposes window.harness.
// ABOUTME: The host is the bare test page; it builds the dialect registry and fetches the test scores itself.

import { createFakeDraftStore } from "/e2e/page/draft-store.js";
import { syntheticSong } from "/e2e/page/synthetic.js";
import { song2Dialect } from "/packages/score-dialect-song2/dist/index.js";
import {
  createDialectRegistry,
  createEditingSession,
  formatDiagnostic,
  mount,
  mountChordTrack,
  mountCutNotice,
  mountDraftConflict,
  mountFilterPanel,
  mountLyricTrack,
  mountProblemView,
  mountProjectPanel,
  mountStaffView,
  mountStaleNotice,
  mountSynthPreview,
  mountTextView,
  mountTimeRuler,
  mountToolbar,
  mountToolPanel,
  mountViewSwitch,
  mountVoiceTrack,
  mountZoomControl,
  previewNote,
  previewPlayer,
} from "/packages/score-editor/dist/index.js";

const stage = document.getElementById("stage");
const TESTS = "/packages/score-dialect-song2/tests/";

/**
 * The dialects a test can ask for. `narrow` has a smaller chord vocabulary than song2. `refusing` reads and writes as
 * song2 does, but its check finds a fault in any score that has chords, so the editor refuses every chord edit.
 * `slash-quality` lists a quality the chord grammar cannot write; `both-chord-voices` lets `Ins` carry chords too.
 */
const VARIANTS = {
  song2: song2Dialect,
  narrow: {
    ...song2Dialect,
    constraints: {
      ...song2Dialect.constraints,
      chords: { roots: ["C", "D", "E", "F", "G", "A", "B", "Bb", "F#"], qualities: ["", "m", "7"], slashBass: false },
    },
  },
  refusing: {
    ...song2Dialect,
    check(score) {
      if (score.chords.length === 0) return song2Dialect.check(score);
      return [{ code: "write-mismatch", params: { what: "chords" }, at: {} }];
    },
  },
  "slash-quality": {
    ...song2Dialect,
    constraints: {
      ...song2Dialect.constraints,
      chords: { roots: ["C", "D", "E", "F", "G", "A", "B"], qualities: ["", "6/9"], slashBass: false },
    },
  },
  "both-chord-voices": (() => {
    const marker = "% ins-chord ";
    const noteIdAt = (score, start) =>
      score.notes.find((note) => note.voice === "Ins" && note.start === start)?.id ?? null;
    return {
      ...song2Dialect,
      constraints: {
        ...song2Dialect.constraints,
        voices: song2Dialect.constraints.voices.map((voice) => ({ ...voice, allowsChords: true })),
      },
      // A test dialect that may hold a chord on Ins: the marker line keeps the voice it belongs to through the text.
      parse(text) {
        const extra = [];
        const kept = [];
        for (const line of text.split("\n")) {
          const found = /^% ins-chord (\d+) (\S+)$/.exec(line);
          if (found) extra.push({ start: Number(found[1]), name: found[2] });
          else kept.push(line);
        }
        const read = song2Dialect.parse(kept.join("\n"));
        if (read.score === null) return read;
        const chords = [
          ...read.score.chords,
          ...extra.map((chord) => ({ ...chord, noteId: noteIdAt(read.score, chord.start) })),
        ].sort((a, b) => a.start - b.start || (a.noteId ?? "").localeCompare(b.noteId ?? ""));
        return {
          score: { ...read.score, chords, hasChords: read.score.hasChords || extra.length > 0 },
          diagnostics: read.diagnostics,
        };
      },
      serialize(score) {
        const ins = score.chords.filter((chord) => chord.noteId?.startsWith("Ins:"));
        const vocal = score.chords.filter((chord) => !chord.noteId?.startsWith("Ins:"));
        const text = song2Dialect.serialize({ ...score, chords: vocal, hasChords: vocal.length > 0 });
        return [text.trimEnd(), ...ins.map((chord) => `${marker}${chord.start} ${chord.name}`), ""].join("\n");
      },
      check() {
        return [];
      },
    };
  })(),
};

function registry(dialect = "song2") {
  const found = VARIANTS[dialect];
  if (!found) throw new Error(`no dialect variant ${dialect}`);
  return createDialectRegistry([found]);
}

const dialects = registry();
let editor = null;
let project = null;
let vectors = null;
/** The notices the mounted editor sent to its host, in order. */
const notices = [];
/** The host's draft store: what `drafts: true` in the options of `mount` and `update` stands for. */
const drafts = createFakeDraftStore();
/** What the host callback of the mounted editor received, each with the store calls made before it ran. */
const handoffs = [];
/** The options of `mount` and `update`, with the page's store and callback standing in for the host's. */
function hostOptions(options) {
  const { handoff, ...rest } = options;
  const withStore =
    rest.drafts === true ? { ...rest, drafts } : rest.drafts === false ? { ...rest, drafts: undefined } : rest;
  if (handoff === true) {
    return {
      ...withStore,
      onHandoff: (payload) => handoffs.push({ payload, calls: drafts.calls() }),
    };
  }
  if (handoff === false) return { ...withStore, onHandoff: undefined };
  return withStore;
}

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

/** The notice a host receives when a mounted part refuses a command, as the default editor sends it. */
function refusedBy(session) {
  return (diagnostics) =>
    notices.push({
      code: "command-refused",
      level: "warning",
      message: formatDiagnostic(diagnostics[0], session.view.language),
    });
}

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
 * The custom tools a test can register, by name. `safe` rests the last selected note; `breaking` asks for notes off the
 * grid in force, so the tool layer refuses the whole run and the score stays as it was.
 */
const SAFE_TOOL = {
  id: "rest-last",
  group: "more",
  name: { en: "Rest the last note", zh: "最后一个音变休止" },
  description: { en: "Turn the last selected notes into rests.", zh: "把选区最后的几个音变成休止符。" },
  parameters: [{ name: "count", label: { en: "How many", zh: "几个" }, type: "number", min: 1, default: 1 }],
  commands(_project, selection, values) {
    const count = Number(values.count);
    return selection.slice(-count).map((noteId) => ({ type: "toRest", noteId }));
  },
};

const BREAKING_TOOL = {
  id: "off-grid",
  group: "more",
  name: { en: "Off the grid", zh: "网格外" },
  description: {
    en: "Asks for notes off the grid in force, so it is refused.",
    zh: "结果会落在当前网格外，因此会被拦下。",
  },
  commands(_project, selection) {
    return [{ type: "setNoteLength", noteIds: selection, lengthTicks: 128, grid: { value: 8 } }];
  },
};

const TOOL_SETS = { safe: [SAFE_TOOL], breaking: [BREAKING_TOOL], both: [SAFE_TOOL, BREAKING_TOOL], none: [] };

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
  // The song project panel as a part of its own; a refusal is told to the host as the editor tells it.
  panel: (el, session) => mountProjectPanel(el, session, { onRefused: refusedBy(session) }),
  // The default editor's toolbar: the view switch, and the tempo, key, transpose and Project controls. A refusal is told
  // to the host as the editor tells it, so the notices list shows what a host would be sent.
  "toolbar-song": (el, session) =>
    mountToolbar(el, session, {
      viewSwitch: true,
      tempoKey: true,
      projectPanel: true,
      onRefused: refusedBy(session),
    }),
  filter: (el, session) => mountFilterPanel(el, session),
  "draft-conflict": (el, session) => mountDraftConflict(el, session, conflictKeeper()),
};

/**
 * Parts a test asks for by name that the lists above leave out on purpose: older specs walk those lists and name the
 * region of every part in them. These have a slot only when a test opens a layout with them.
 */
const EXTRA_PARTS = {
  lyrics: (el, session) => mountLyricTrack(el, session),
  // The default editor's toolbar shape for placing notes: the pencil is an opt-in control.
  "toolbar-pencil": (el, session) => mountToolbar(el, session, { synthPreview: false, pencil: true }),
  // The Tools panel as a part of its own, with the page's two custom tools beside the built-in note tools.
  tools: (el, session) => mountToolPanel(el, session, { tools: TOOL_SETS.both, onRefused: refusedBy(session) }),
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
    dialect,
    hostLayer,
    width,
    top,
    spill,
    tempoChanges,
  } = {}) {
    if (layout.session) throw new Error("a layout is already open");
    const base = await projectFrom(blank, score, fields);
    const host = document.createElement("div");
    host.id = "layout-host";
    if (hostLayer) {
      host.style.cssText = "position:fixed;inset:0;z-index:2147483000;transform:translateZ(0);background:#e8e8ee;";
    } else if (spill) {
      host.style.cssText = `width:calc(100% + ${spill}px);margin:${top ?? 12}px 12px 12px;`;
    } else {
      if (width) host.style.width = `min(${width}px, calc(100% - 24px))`;
      if (top !== undefined) host.style.marginTop = `${top}px`;
    }
    document.body.append(host);
    if (hostLayer) {
      const cover = document.createElement("div");
      cover.id = "chord-cover";
      cover.style.cssText =
        "position:fixed;inset:0;z-index:2147483646;pointer-events:none;background:rgba(200,0,0,0.12);";
      document.body.append(cover);
    }
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
      dialects: tempoChanges
        ? createDialectRegistry([withTempoChanges(song2Dialect, tempoChanges)])
        : registry(dialect),
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
  /** Lets a host take a pending field on a part it mounted itself, as the toolbar's popover does when it closes. */
  commitPart(name) {
    const part = layout.parts[name];
    if (typeof part?.commit !== "function") throw new Error(`${name} has no commit`);
    part.commit();
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
    document.getElementById("chord-cover")?.remove();
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
  /** The host's covering layer starts taking the pointer, as a toast or a dialog of the host does once it is shown. */
  cover() {
    const cover = document.getElementById("chord-cover");
    if (!cover) throw new Error("the page was opened without a host layer");
    cover.style.pointerEvents = "auto";
  },
};

window.harness = {
  stage,
  layout,
  notices,
  drafts,
  handoffs,
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
  async mount({
    score = { sample: "compact-three-sections" },
    project: fields,
    shadow,
    dialect,
    hostLayer,
    tools,
    ...options
  } = {}) {
    project = await projectFrom(blank, score, fields);
    let target = stage;
    if (hostLayer) {
      const host = document.createElement("div");
      host.id = "chord-host";
      host.style.cssText = "position:fixed;inset:0;z-index:2147483000;transform:translateZ(0);background:#e8e8ee;";
      const cover = document.createElement("div");
      cover.id = "chord-cover";
      cover.style.cssText =
        "position:fixed;inset:0;z-index:2147483646;pointer-events:none;background:rgba(200,0,0,0.12);";
      document.body.append(host, cover);
      target = host;
    } else if (shadow) {
      const host = document.createElement("div");
      host.id = "shadow-host";
      stage.append(host);
      window.harness.shadowRoot = host.attachShadow({ mode: "open" });
      target = document.createElement("div");
      target.style.height = "420px";
      window.harness.shadowRoot.append(target);
    }
    notices.length = 0;
    handoffs.length = 0;
    editor = mount(target, {
      language: "en",
      project,
      dialects: registry(dialect),
      notify: (notice) => notices.push(notice),
      ...(tools === undefined ? {} : { tools: TOOL_SETS[tools] }),
      ...hostOptions(options),
    });
  },
  async update({ score, project: fields, tools, ...options } = {}) {
    if (score !== undefined || fields !== undefined) {
      project = await projectFrom(project, score, fields);
      options.project = project;
    }
    editor.update({ ...(tools === undefined ? {} : { tools: TOOL_SETS[tools] }), ...hostOptions(options) });
  },
  destroy() {
    editor?.destroy();
    document.getElementById("chord-host")?.remove();
    document.getElementById("chord-cover")?.remove();
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
