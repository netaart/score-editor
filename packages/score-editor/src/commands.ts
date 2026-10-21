// ABOUTME: Pure edit commands. Score commands change a Score and leave writing to the dialect; the spike's move commands work on the note view.
// ABOUTME: Pointer drags and keyboard nudges both end here, so there is one place that decides what a move means.
import type { Diagnostic } from "./diagnostics";
import { type Note, noteId } from "./model";
import type { Score, Note as ScoreNote } from "./score";

/** A dialect-agnostic edit of a Score. More commands join this union in later tickets. */
export type ScoreCommand = { readonly type: "toRest"; readonly noteId: string };

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
export function runScoreCommand(score: Score, command: ScoreCommand): ScoreCommandResult {
  switch (command.type) {
    case "toRest":
      return toRest(score, command.noteId);
  }
}

export interface MoveBounds {
  /** Length of the score in ticks. */
  totalTicks: number;
  /** Lowest pitch row of the note's voice. */
  lo: number;
  /** One above the highest pitch row of the note's voice. */
  hi: number;
}

export interface ResolvedMove {
  start: number;
  midi: number;
  /** True when the pitch had to be pulled back into the voice's range. */
  clampedPitch: boolean;
}

/** Where a note ends up when moved by the given ticks and semitones, kept inside the score and the pitch range. */
export function resolveMove(note: Note, dStart: number, dMidi: number, bounds: MoveBounds): ResolvedMove {
  const start = Math.min(Math.max(0, note.start + dStart), Math.max(0, bounds.totalTicks - note.duration));
  const wanted = note.midi + dMidi;
  const midi = Math.min(Math.max(bounds.lo, wanted), bounds.hi - 1);
  return { start, midi, clampedPitch: midi !== wanted };
}

export type MoveResult =
  | { ok: true; notes: Note[]; id: string; clampedPitch: boolean }
  | { ok: false; reason: "occupied" };

/**
 * Moves one note. A move onto the start of another note of the same voice is refused: overlap rules
 * are a later ticket's job, and two notes must never share an id.
 */
export function moveNote(
  notes: ReadonlyArray<Note>,
  id: string,
  dStart: number,
  dMidi: number,
  bounds: MoveBounds,
): MoveResult {
  const note = notes.find((candidate) => candidate.id === id);
  if (!note) return { ok: false, reason: "occupied" };
  const target = resolveMove(note, dStart, dMidi, bounds);
  const targetId = noteId(note.voice, target.start);
  if (targetId !== id && notes.some((candidate) => candidate.id === targetId)) return { ok: false, reason: "occupied" };
  const moved: Note = { ...note, id: targetId, start: target.start, midi: target.midi };
  return {
    ok: true,
    notes: notes.map((candidate) => (candidate.id === id ? moved : candidate)),
    id: targetId,
    clampedPitch: target.clampedPitch,
  };
}
