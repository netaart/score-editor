// ABOUTME: Where a chord can go and which names a chord picker may offer: pure facts read from a score and a dialect's constraints.
// ABOUTME: No DOM and no text in any language; the chord track and its picker draw them, and a host's own chord control can use them too.
import type { Note, Score } from "./score";
import type { DialectConstraints } from "./types";

/** A place a chord can go: the start of a note or rest in a voice that allows chords. */
export interface ChordSlot {
  /** The note or rest the chord is attached to: what `setChord` names. */
  readonly noteId: string;
  readonly voice: string;
  readonly start: number;
  /** How long the note or rest lasts, in ticks: the stretch the chord track frames. */
  readonly duration: number;
  /** The chord that starts here, or null. When the score has several here, the last one. */
  readonly chord: string | null;
  /** The chord in force before this start: the last one that starts earlier, or null. */
  readonly before: string | null;
}

/**
 * The places a chord can go, in time order: the start of every note and rest of every voice that `constraints` says
 * allows chords. Where two such voices start something at the same tick, the voice listed first owns the place.
 */
export function chordSlots(score: Score, constraints: DialectConstraints): ReadonlyArray<ChordSlot> {
  const owners = new Map<number, Note>();
  for (const { name } of constraints.voices.filter((voice) => voice.allowsChords)) {
    for (const note of score.notes) if (note.voice === name && !owners.has(note.start)) owners.set(note.start, note);
  }
  const chords = [...score.chords].sort((a, b) => a.start - b.start);
  const here = new Map<string, string>();
  for (const chord of chords) if (chord.noteId !== null) here.set(chord.noteId, chord.name);

  let upTo = 0;
  let before: string | null = null;
  return [...owners.values()]
    .sort((a, b) => a.start - b.start)
    .map((note) => {
      for (; upTo < chords.length && (chords[upTo]?.start ?? Number.POSITIVE_INFINITY) < note.start; upTo++) {
        before = chords[upTo]?.name ?? before;
      }
      return {
        noteId: note.id,
        voice: note.voice,
        start: note.start,
        duration: note.duration,
        chord: here.get(note.id) ?? null,
        before,
      };
    });
}

/**
 * The place whose start is nearest to `tick`; one halfway between two goes to the earlier. Null where there is no place.
 * `slots` are in time order, as `chordSlots` gives them.
 */
export function nearestChordSlot(slots: ReadonlyArray<ChordSlot>, tick: number): ChordSlot | null {
  let low = 0;
  let high = slots.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((slots[middle]?.start ?? 0) < tick) low = middle + 1;
    else high = middle;
  }
  const after = slots[low];
  const before = slots[low - 1];
  if (before === undefined) return after ?? null;
  if (after === undefined) return before;
  return tick - before.start <= after.start - tick ? before : after;
}
