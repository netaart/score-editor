// ABOUTME: Pure edit commands. A score command changes a Score and leaves writing to the dialect.
// ABOUTME: Every edit, from any view or tool, ends here, so there is one place that decides what a command means.
import { positionOf } from "./arrangement";
import type { Diagnostic, DiagnosticAt } from "./diagnostics";
import type { Score, Note as ScoreNote } from "./score";

/**
 * A dialect-agnostic edit of a Score. More commands join this union in later tickets.
 *
 * `toRest` turns one note into a rest. `toRests` does the same to every note it names as one command: it applies to all
 * of them or to none, so the score is written and checked once, on the whole result.
 */
export type ScoreCommand =
  | { readonly type: "toRest"; readonly noteId: string }
  | { readonly type: "toRests"; readonly noteIds: ReadonlyArray<string> };

export type ScoreCommandResult =
  | { readonly ok: true; readonly score: Score }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/** The ids of the notes a command names, in the order it names them. */
function namedIds(command: ScoreCommand): ReadonlyArray<string> {
  switch (command.type) {
    case "toRest":
      return [command.noteId];
    case "toRests":
      return command.noteIds;
  }
}

/** Where a note is, in the voice, bar and beat a person counts; only its id when the score has no such note. */
function noteAt(score: Score, noteId: string): DiagnosticAt {
  const note = score.notes.find((found) => found.id === noteId);
  if (note === undefined) return { noteId };
  const { bar, beat } = positionOf(score.bars, note.bar, note.start);
  return { voice: note.voice, bar, beat, noteId: note.id };
}

/** Where a command acts: the first note it names, or nowhere in particular when it names none. */
export function commandAt(score: Score, command: ScoreCommand): DiagnosticAt {
  const first = namedIds(command)[0];
  return first === undefined ? {} : noteAt(score, first);
}

function commandFailure(code: "note-not-found" | "not-a-note", score: Score, noteId: string): ScoreCommandResult {
  return { ok: false, diagnostic: { code, params: { noteId }, at: noteAt(score, noteId) } };
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
export function runScoreCommand(score: Score, command: ScoreCommand): ScoreCommandResult {
  switch (command.type) {
    case "toRest":
      return toRests(score, [command.noteId]);
    case "toRests":
      return toRests(score, command.noteIds);
  }
}
