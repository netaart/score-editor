// ABOUTME: Page-side half of the chord-editing specs: opens the chord track with other parts, or the whole editor, in a host of the test's choosing.
// ABOUTME: A spec loads it into the test page; it adds window.chordPage and touches nothing of window.harness.

import { song2Dialect } from "/packages/score-dialect-song2/dist/index.js";
import {
  createDialectRegistry,
  createEditingSession,
  mount,
  mountChordTrack,
  mountToolbar,
  mountVoiceTrack,
} from "/packages/score-editor/dist/index.js";

const TESTS = "/packages/score-dialect-song2/tests/";
const BLANK = {
  style: "",
  lyrics: "",
  score: "",
  scoreMode: "full",
  seed: null,
  modelId: "song2",
  sourceKey: "chord-page",
};

/** The score text a spec asks for: `{ text }` is the text itself, `{ sample }` a file of the dialect's samples. */
async function scoreText(source) {
  if (source.text !== undefined) return source.text;
  return (await fetch(`${TESTS}samples/${source.sample}.abc`)).text();
}

/**
 * The dialects a spec can ask for. `narrow` has a smaller chord vocabulary than song2. `refusing` reads and writes as song2
 * does, but its check finds a fault in any score that has chords, so the editor refuses every chord edit.
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
};

const notices = [];
let session = null;
let editor = null;
let parts = [];
let host = null;

function registry(variant) {
  const dialect = VARIANTS[variant ?? "song2"];
  if (!dialect) throw new Error(`no dialect variant ${variant}`);
  return createDialectRegistry([dialect]);
}

/**
 * The element the editor or the parts go into. With `hostLayer` it is inside a full-screen layer of the host's: fixed, a
 * stacking context of its own, at the highest z-index, with a second layer over it (a host's toast or dialog) that covers
 * the whole window. Only a popover in the top layer can be seen and pressed through both.
 */
function stage({ hostLayer, width }) {
  host = document.createElement("div");
  host.id = "chord-host";
  if (hostLayer) {
    host.style.cssText = "position:fixed;inset:0;z-index:2147483000;transform:translateZ(0);background:#e8e8ee;";
    const cover = document.createElement("div");
    cover.id = "chord-cover";
    cover.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;pointer-events:none;background:rgba(200,0,0,0.12);";
    document.body.append(host, cover);
  } else {
    document.body.append(host);
  }
  const box = document.createElement("div");
  box.id = "chord-stage";
  box.style.cssText = hostLayer ? "height:100%;" : `width:${width ?? 700}px;max-width:100%;margin:12px;`;
  host.append(box);
  return box;
}

function open({ score, language = "en", editable = true, dialect, hostLayer = false, width }, build) {
  if (host) throw new Error("a chord page is already open");
  notices.length = 0;
  return scoreText(score).then((text) => {
    const box = stage({ hostLayer, width });
    build(box, { project: { ...BLANK, score: text }, dialects: registry(dialect), language, editable });
  });
}

window.chordPage = {
  /** The chord track with a toolbar and the voice tracks, each a part of its own on one session. */
  openParts(options) {
    return open(options, (box, { project, dialects, language, editable }) => {
      session = createEditingSession({ project, dialects, language, editable });
      const slot = (name) => {
        const el = document.createElement("div");
        el.dataset.slot = name;
        box.append(el);
        return el;
      };
      const names = options.parts ?? ["toolbar", "chords", "vocal", "ins"];
      const factories = {
        toolbar: (el) =>
          mountToolbar(el, session, { synthPreview: false, onRefused: (found) => notices.push(found[0].code) }),
        chords: (el) => mountChordTrack(el, session, { onRefused: (found) => notices.push(found[0].code) }),
        vocal: (el) => mountVoiceTrack(el, session, { voice: "Vocal" }),
        ins: (el) => mountVoiceTrack(el, session, { voice: "Ins" }),
      };
      parts = names.map((name) => factories[name](slot(name)));
    });
  },
  /** The whole editor, as `mount` makes it. */
  mountEditor(options) {
    return open(options, (box, { project, dialects, language, editable }) => {
      box.style.height = options.hostLayer ? "100%" : "480px";
      editor = mount(box, {
        language,
        editable,
        project,
        dialects,
        notify: (notice) => notices.push({ code: notice.code, message: notice.message }),
      });
    });
  },
  /** The host's covering layer starts taking the pointer, as a toast or a dialog of the host does once it is shown. */
  coverHost() {
    const cover = document.getElementById("chord-cover");
    if (!cover) throw new Error("the page was opened without a host layer");
    cover.style.pointerEvents = "auto";
  },
  close() {
    for (const part of parts) part.destroy();
    editor?.destroy();
    parts = [];
    editor = null;
    session = null;
    host?.remove();
    document.getElementById("chord-cover")?.remove();
    host = null;
  },
  notices: () => notices.map((notice) => (typeof notice === "string" ? notice : { ...notice })),
  /** The score text of the parts' session. */
  scoreText: () => session.project.score,
  canUndo: () => session.canUndo,
  canRedo: () => session.canRedo,
  undoDepth() {
    let depth = 0;
    const text = session.project.score;
    const seen = [text];
    while (session.undo()) {
      depth += 1;
      seen.push(session.project.score);
    }
    for (let step = 0; step < depth; step++) session.redo();
    return { depth, texts: seen };
  },
  insertionPoint: () => (session.insertionPoint === null ? null : { ...session.insertionPoint }),
  setEditable: (editable) => session.setView({ editable }),
  setLanguage: (language) => session.setView({ language }),
  replaceScore: async (score) => session.replaceProject({ ...session.project, score: await scoreText(score) }),
};
