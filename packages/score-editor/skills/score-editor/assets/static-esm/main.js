// ABOUTME: The static-page skill example: imports both packages from esm.sh, mounts parts on one session, and runs a custom tool.
// ABOUTME: It also reads the score with the dialect and writes one command back through applyScoreCommand, with no mount().

import { song2Dialect } from "https://esm.sh/@neta-art/score-dialect-song2@0.4.0?bundle&target=es2022";
import {
  applyScoreCommand,
  createDialectRegistry,
  createEditingSession,
  createToolRegistry,
  formatDiagnostic,
  mountChordTrack,
  mountCutNotice,
  mountProblemView,
  mountTimeRuler,
  mountToolbar,
  mountVoiceTrack,
} from "https://esm.sh/@neta-art/score-editor@0.4.0?bundle&target=es2022";

// Hand-written: two voices, four bars, a verse and a chorus.
const SCORE = `X:1
T:
M:4/4
L:1/16
Q:1/4=100
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% verse
V: Vocal
"C"c4e4g8|"Am"a4g4e4z4|
V: Ins
C2E2G2c2z8|A,2C2E2A2z8|
% chorus
V: Vocal
"F"f4a4c'8|"G"g4e4c4z4|
V: Ins
F,2A,2C2F2z8|G,2B,2D2G2z8|
`;

const project = {
  style: "",
  lyrics: "",
  score: SCORE,
  scoreMode: "full",
  seed: null,
  modelId: "song2",
  sourceKey: "skill-static-example",
};

const dialects = createDialectRegistry([song2Dialect]);
const session = createEditingSession({ project, dialects, language: "en" });

const app = document.querySelector("#app");
if (!(app instanceof HTMLElement)) throw new Error("The example page has no #app element.");

app.innerHTML = `
  <div class="skill-example">
    <header class="skill-header">
      <h1>Score editor skill: static page</h1>
      <p>Both packages come from esm.sh. The parts and the tool are wired up by this page.</p>
    </header>
    <div class="skill-toolbar">
      <div data-slot="toolbar"></div>
      <div data-slot="notice"></div>
      <div class="skill-actions">
        <button type="button" data-action="select">Select notes</button>
        <button type="button" data-action="run">Run tool</button>
        <button type="button" data-action="read">Read score</button>
        <button type="button" data-action="write">Write back</button>
      </div>
    </div>
    <p class="skill-status" role="status" aria-live="polite" aria-label="Example status"></p>
    <div class="skill-grid">
      <section class="skill-card">
        <div data-slot="ruler"></div>
        <div data-slot="chords"></div>
      </section>
      <section class="skill-card"><div data-slot="vocal"></div></section>
      <section class="skill-card"><div data-slot="ins"></div></section>
    </div>
    <div data-slot="problem"></div>
    <pre class="skill-output" role="log" aria-label="Written score"></pre>
  </div>`;

const slot = (name) => {
  const found = app.querySelector(`[data-slot="${name}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`The example page has no ${name} slot.`);
  return found;
};
const status = app.querySelector(".skill-status");
const output = app.querySelector(".skill-output");

const restEveryNth = {
  id: "rest-every-nth",
  name: { en: "Rest every Nth note", zh: "每隔 N 个音变休止" },
  parameters: [
    { name: "every", label: { en: "Every", zh: "每隔" }, type: "number", min: 2, max: 8, step: 1, default: 2 },
  ],
  commands(_project, selection, values) {
    const step = values.every;
    return selection.filter((_id, index) => (index + 1) % step === 0).map((noteId) => ({ type: "toRest", noteId }));
  },
};

// A registry holds the host's tools; the panel that will draw their controls reads this same list.
const tools = createToolRegistry([restEveryNth]);

const parts = [
  mountToolbar(slot("toolbar"), session),
  mountCutNotice(slot("notice"), session),
  mountTimeRuler(slot("ruler"), session),
  mountChordTrack(slot("chords"), session),
  mountVoiceTrack(slot("vocal"), session, { voice: "Vocal" }),
  mountVoiceTrack(slot("ins"), session, { voice: "Ins" }),
  mountProblemView(slot("problem"), session),
];

function say(message) {
  status.textContent = message;
}

function firstProblem(diagnostics) {
  const first = diagnostics[0];
  return first ? formatDiagnostic(first, "en") : "The command was refused without a diagnostic.";
}

function pitchedVocalNotes() {
  if (session.reading.kind !== "score") return null;
  return session.reading.score.notes.filter((note) => note.voice === "Vocal" && note.midi !== null);
}

function selectVocalNotes() {
  const notes = pitchedVocalNotes();
  if (!notes) {
    say("There is no readable score to select notes from.");
    return;
  }
  session.select(notes.map((note) => note.id));
  say(`Selected ${notes.length} Vocal notes.`);
}

function runTool() {
  if (session.selection.length === 0) {
    say("Select notes first.");
    return;
  }
  const result = session.runTool(restEveryNth, { every: 2 });
  if (!result.ok) {
    say(firstProblem(result.diagnostics));
    return;
  }
  say(`The tool produced ${result.commands.length} commands as one undo step.`);
}

function readScore() {
  const { score, diagnostics } = song2Dialect.parse(session.project.score);
  if (!score) {
    say(firstProblem(diagnostics));
    return;
  }
  say(
    `Read ${score.voices.length} voices, ${score.bars.length} bars and ${score.notes.length} notes with the song2 dialect.`,
  );
}

function writeBack() {
  if (session.reading.kind !== "score") {
    say("There is no readable score to write.");
    return;
  }
  const first = pitchedVocalNotes()?.[0];
  if (!first) {
    say("There is no pitched Vocal note to rest.");
    return;
  }
  const result = applyScoreCommand(song2Dialect, session.project.score, { type: "toRest", noteId: first.id });
  if (!result.ok) {
    say(firstProblem([result.diagnostic]));
    return;
  }
  session.replaceProject({ ...session.project, score: result.text });
  output.textContent = result.text;
  say(`Wrote the score back: ${first.id} is now a rest. The text is in the box below.`);
}

app.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  switch (target.dataset.action) {
    case "select":
      selectVocalNotes();
      break;
    case "run":
      runTool();
      break;
    case "read":
      readScore();
      break;
    case "write":
      writeBack();
      break;
  }
});

say(`Ready: ${tools.list().length} custom tool registered.`);
window.addEventListener("pagehide", () => {
  for (const part of parts) part.destroy();
});
