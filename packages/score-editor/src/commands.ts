// ABOUTME: Pure edit commands. A score command changes a Score and leaves writing to the dialect.
// ABOUTME: Every edit, from any view or tool, ends here, so there is one place that decides what a command means.
import { commandRefusal } from "./command-refusal";
import { runBarCommand } from "./commands-bars";
import { setChord } from "./commands-chords";
import { runRemoveChords, runSetKey, runSetTempo, runTranspose } from "./commands-key-tempo";
import { type MoveNotesCommand, type ResizeNotesCommand, runNoteCommand } from "./commands-notes";
import { runSectionCommand } from "./commands-sections";
import { noteAt, tieChain } from "./commands-shared";
import { type NoteToolCommand, runNoteToolCommand } from "./commands-tools";
import { runTruncationCommand } from "./commands-truncation";
import type { Diagnostic, DiagnosticAt } from "./diagnostics";
import type { Meter, Score, Note as ScoreNote } from "./score";
import type { DialectConstraints } from "./types";

/**
 * A dialect-agnostic edit of a Score. More commands join this union in later versions.
 *
 * `toRest` turns one note into a rest. `toRests` does the same to every note it names as one command: it applies to all
 * of them or to none, so the score is written and checked once, on the whole result.
 */
export type ScoreCommand =
  | { readonly type: "toRest"; readonly noteId: string }
  | { readonly type: "toRests"; readonly noteIds: ReadonlyArray<string> }
  | { readonly type: "setChord"; readonly noteId: string; readonly name: string }
  | { readonly type: "insertBar"; readonly bar: number }
  | { readonly type: "deleteBars"; readonly from: number; readonly count: number }
  | { readonly type: "setSectionMeter"; readonly section: number; readonly meter: Meter }
  | { readonly type: "fillTruncatedBar" }
  | { readonly type: "deleteTruncatedBar" }
  | { readonly type: "transpose"; readonly semitones: number }
  | { readonly type: "setKey"; readonly key: string; readonly from?: number }
  | { readonly type: "setTempo"; readonly bpm: number }
  | { readonly type: "removeChords" }
  | { readonly type: "deleteSection"; readonly section: number }
  | { readonly type: "duplicateSection"; readonly section: number }
  | { readonly type: "moveSection"; readonly section: number; readonly direction: "earlier" | "later" }
  | { readonly type: "renameSection"; readonly section: number; readonly name: string }
  | { readonly type: "nameSection"; readonly bar: number; readonly name: string }
  | MoveNotesCommand
  | ResizeNotesCommand
  | NoteToolCommand;

export type ToRestCommand = Extract<ScoreCommand, { type: "toRest" }>;

export type ScoreCommandResult =
  | { readonly ok: true; readonly score: Score }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/**
 * Where a command acts, in the voice, bar and beat a person counts: the note it names, the first of them when it names
 * several, or nothing for a command without one.
 */
export function commandAt(score: Score, command: ScoreCommand): DiagnosticAt {
  const noteId = "noteId" in command ? command.noteId : "noteIds" in command ? command.noteIds[0] : undefined;
  return noteId === undefined ? {} : noteAt(score, noteId);
}

function commandFailure(code: "note-not-found" | "not-a-note", score: Score, noteId: string): ScoreCommandResult {
  return commandRefusal(code, { noteId }, noteAt(score, noteId));
}

/**
 * Turns the tie chain of every named note into rests. Every id is checked before anything changes, so a refusal names the
 * first id that is not a pitched note and leaves the whole score as it was.
 */
function toRests(score: Score, noteIds: ReadonlyArray<string>): ScoreCommandResult {
  const targets: ScoreNote[] = [];
  for (const noteId of noteIds) {
    const target = score.notes.find((note) => note.id === noteId);
    if (target === undefined) return commandFailure("note-not-found", score, noteId);
    if (target.midi === null) return commandFailure("not-a-note", score, noteId);
    targets.push(target);
  }

  const chains = new Set<string>();
  for (const target of targets) {
    if (chains.has(target.id)) continue;
    for (const member of tieChain(score.notes, target)) chains.add(member.id);
  }
  const notes = score.notes.map((note) => (chains.has(note.id) ? { ...note, midi: null, tie: false } : note));
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
      return toRests(score, [command.noteId]);
    case "toRests":
      return toRests(score, command.noteIds);
    case "setChord":
      return setChord(score, command.noteId, command.name, constraints);
    case "insertBar":
    case "deleteBars":
    case "setSectionMeter":
      return runBarCommand(score, command, constraints);
    case "fillTruncatedBar":
    case "deleteTruncatedBar":
      return runTruncationCommand(score, command, constraints);
    case "transpose":
      return runTranspose(score, command.semitones, constraints);
    case "setKey":
      return runSetKey(score, command.key, command.from, constraints);
    case "setTempo":
      return runSetTempo(score, command.bpm, constraints);
    case "removeChords":
      return runRemoveChords(score);
    case "deleteSection":
    case "duplicateSection":
    case "moveSection":
    case "renameSection":
    case "nameSection":
      return runSectionCommand(score, command);
    case "moveNotes":
    case "resizeNotes":
      return runNoteCommand(score, command, constraints);
    case "splitNotes":
    case "chopNotes":
    case "joinNotes":
    case "legatoNotes":
    case "reverseNotes":
    case "flipNotes":
    case "snapNotesToKey":
    case "scaleNoteLengths":
    case "setNoteLength":
    case "fitNotesToRange":
      return runNoteToolCommand(score, command, constraints);
  }
}
