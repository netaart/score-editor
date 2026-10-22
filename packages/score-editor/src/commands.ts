// ABOUTME: Pure edit commands. A score command changes a Score and leaves writing to the dialect.
// ABOUTME: Every edit, from any view or tool, ends here, so there is one place that decides what a command means.
import { positionOf } from "./arrangement";
import { runBarCommand } from "./commands-bars";
import { setChord } from "./commands-chords";
import { runTruncationCommand } from "./commands-truncation";
import type { Diagnostic, DiagnosticAt } from "./diagnostics";
import type { Meter, Score, Note as ScoreNote } from "./score";
import type { DialectConstraints } from "./types";

/** A dialect-agnostic edit of a Score. More commands join this union in later tickets. */
export type ScoreCommand =
  | { readonly type: "toRest"; readonly noteId: string }
  | { readonly type: "setChord"; readonly noteId: string; readonly name: string }
  | { readonly type: "insertBar"; readonly bar: number }
  | { readonly type: "deleteBars"; readonly from: number; readonly count: number }
  | { readonly type: "setSectionMeter"; readonly section: number; readonly meter: Meter }
  | { readonly type: "fillTruncatedBar" }
  | { readonly type: "deleteTruncatedBar" };

export type ToRestCommand = Extract<ScoreCommand, { type: "toRest" }>;

export type ScoreCommandResult =
  | { readonly ok: true; readonly score: Score }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/** Where a command acts, in the voice, bar and beat a person counts: the note it names, or nothing for a command without one. */
export function commandAt(score: Score, command: ScoreCommand): DiagnosticAt {
  if (!("noteId" in command)) return {};
  const note = score.notes.find((found) => found.id === command.noteId);
  if (note === undefined) return { noteId: command.noteId };
  const { bar, beat } = positionOf(score.bars, note.bar, note.start);
  return { voice: note.voice, bar, beat, noteId: note.id };
}

function commandFailure(
  code: "note-not-found" | "not-a-note",
  score: Score,
  command: ToRestCommand,
): ScoreCommandResult {
  return { ok: false, diagnostic: { code, params: { noteId: command.noteId }, at: commandAt(score, command) } };
}

/** The whole tie chain around a note: every note tied into it and every note it ties into. */
export function tieChain(notes: ReadonlyArray<ScoreNote>, target: ScoreNote): ScoreNote[] {
  const voiceNotes = notes.filter((note) => note.voice === target.voice).sort((a, b) => a.start - b.start);
  const index = voiceNotes.findIndex((note) => note.id === target.id);
  let first = index;
  while (first > 0 && (voiceNotes[first - 1] as ScoreNote).tie) first -= 1;
  let last = index;
  while (last < voiceNotes.length - 1 && (voiceNotes[last] as ScoreNote).tie) last += 1;
  return voiceNotes.slice(first, last + 1);
}

function toRest(score: Score, command: ToRestCommand): ScoreCommandResult {
  const target = score.notes.find((note) => note.id === command.noteId);
  if (target === undefined) return commandFailure("note-not-found", score, command);
  if (target.midi === null) return commandFailure("not-a-note", score, command);

  const chain = new Set(tieChain(score.notes, target).map((note) => note.id));
  const notes = score.notes.map((note) => (chain.has(note.id) ? { ...note, midi: null, tie: false } : note));
  return { ok: true, score: { ...score, notes } };
}

/** Applies one score command to a model. It never writes text and never touches a DOM. */
export function runScoreCommand(
  score: Score,
  command: ScoreCommand,
  constraints: DialectConstraints,
): ScoreCommandResult {
  switch (command.type) {
    case "toRest":
      return toRest(score, command);
    case "setChord":
      return setChord(score, command.noteId, command.name, constraints);
    case "insertBar":
    case "deleteBars":
    case "setSectionMeter":
      return runBarCommand(score, command, constraints);
    case "fillTruncatedBar":
    case "deleteTruncatedBar":
      return runTruncationCommand(score, command, constraints);
  }
}
