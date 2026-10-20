// ABOUTME: Pure edit commands over the note list. The spike has one: move a note in time and pitch.
// ABOUTME: Pointer drags and keyboard nudges both end here, so there is one place that decides what a move means.
import { type Note, noteId } from "./model";

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
