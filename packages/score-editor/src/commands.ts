// ABOUTME: Pure edit commands. A score command changes a Score and leaves writing to the dialect.
// ABOUTME: Every edit, from any view or tool, ends here, so there is one place that decides what a command means.
import { runBarsCommand } from "./commands-bars";
import type { Diagnostic } from "./diagnostics";
import type { Meter, Score, Note as ScoreNote } from "./score";
import type { MeterRule } from "./types";

/** A dialect-agnostic edit of a Score. More commands join this union in later tickets. */
export type ScoreCommand =
  | { readonly type: "toRest"; readonly noteId: string }
  | { readonly type: "insertBar"; readonly bar: number }
  | { readonly type: "deleteBars"; readonly from: number; readonly count: number }
  | { readonly type: "setSectionMeter"; readonly section: number; readonly meter: Meter }
  | { readonly type: "fillTruncatedBar" }
  | { readonly type: "deleteTruncatedBar" };

export type ScoreCommandResult =
  | { readonly ok: true; readonly score: Score }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

function commandFailure(code: "note-not-found" | "not-a-note", id: string): ScoreCommandResult {
  return { ok: false, diagnostic: { code, params: { noteId: id }, at: { noteId: id } } };
}

/** The whole tie chain around a note: every note tied into it and every note it ties into. */
function tieChain(notes: ReadonlyArray<ScoreNote>, target: ScoreNote): ScoreNote[] {
  const voiceNotes = notes.filter((note) => note.voice === target.voice).sort((a, b) => a.start - b.start);
  const index = voiceNotes.findIndex((note) => note.id === target.id);
  let first = index;
  while (first > 0 && (voiceNotes[first - 1] as ScoreNote).tie) first -= 1;
  let last = index;
  while (last < voiceNotes.length - 1 && (voiceNotes[last] as ScoreNote).tie) last += 1;
  return voiceNotes.slice(first, last + 1);
}

function toRest(score: Score, id: string): ScoreCommandResult {
  const target = score.notes.find((note) => note.id === id);
  if (target === undefined) return commandFailure("note-not-found", id);
  if (target.midi === null) return commandFailure("not-a-note", id);

  const chain = new Set(tieChain(score.notes, target).map((note) => note.id));
  const notes = score.notes.map((note) => (chain.has(note.id) ? { ...note, midi: null, tie: false } : note));
  return { ok: true, score: { ...score, notes } };
}

/** Applies one score command to a model. It never writes text and never touches a DOM. */
export function runScoreCommand(score: Score, command: ScoreCommand, meterRule: MeterRule): ScoreCommandResult {
  switch (command.type) {
    case "toRest":
      return toRest(score, command.noteId);
    case "insertBar":
    case "deleteBars":
    case "setSectionMeter":
    case "fillTruncatedBar":
    case "deleteTruncatedBar":
      return runBarsCommand(score, command, meterRule);
  }
}
