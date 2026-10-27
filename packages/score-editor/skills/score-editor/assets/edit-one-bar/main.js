// ABOUTME: The shipped edit-one-bar example page: it loads the hand-written score and runs the headless helper once.
// ABOUTME: The page shows the changed line, the notice that came with it, and the written score the helper returned.
import { song2Dialect } from "https://esm.sh/@neta-art/score-dialect-song2@0.4.4?bundle&target=es2022";
import {
  applyProjectCommand,
  formatDiagnostic,
  isNoticeDiagnostic,
  noteId,
} from "https://esm.sh/@neta-art/score-editor@0.4.4?bundle&target=es2022";
import { editOneBar } from "./edit-one-bar.js";

const app = document.querySelector("#app");
if (!(app instanceof HTMLElement)) throw new Error("The example page has no #app element.");

function field(name) {
  const found = app.querySelector(`[data-field="${name}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`The example page has no ${name} field.`);
  return found;
}

function diagnosticsText(diagnostics, kind) {
  if (diagnostics.length === 0) return "None";
  return diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.text} (${kind})`).join(" ");
}

const response = await fetch("./score.abc");
if (!response.ok) throw new Error(`The example score did not load: ${response.status}`);
const input = await response.text();

const result = editOneBar(
  input,
  { song2Dialect, applyProjectCommand, noteId, isNoticeDiagnostic, formatDiagnostic },
  { bar: 5, chord: "C" },
);

const status = app.querySelector(".status");
if (!(status instanceof HTMLElement)) throw new Error("The example page has no status line.");

field("note-id").textContent = result.noteId ?? "—";
field("notices").textContent = diagnosticsText(result.notices, "a notice; the edit was taken");
field("refusals").textContent = diagnosticsText(result.refusals, "a refusal; the project was not changed");
field("lines").textContent =
  result.changedLines.length === 0
    ? "None"
    : `${result.changedLines.join(", ")} (${result.changedLines.length} of ${result.lineCount} lines)`;
field("before").textContent = result.before;
field("after").textContent = result.after ?? "";

status.textContent = result.ok
  ? `${result.message} ${result.changedLines.length} line changed; every other line is byte-for-byte the same.`
  : result.message;
