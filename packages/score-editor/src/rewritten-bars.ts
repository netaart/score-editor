// ABOUTME: The bars a command rewrote, read from the score before and after it, in the 1-based numbers the change log uses.
// ABOUTME: A bar counts as rewritten when its own content changed, and a tie change marks the bar on the other side of a barline.
import type { Note, Score } from "./score";

/** One note as a rewritten bar sees it, including whether the note before it ties into it. */
function tiedFromPrevious(score: Score): ReadonlySet<string> {
  const tied = new Set<string>();
  for (const voice of score.voices) {
    const notes = score.notes.filter((note) => note.voice === voice).sort((left, right) => left.start - right.start);
    for (let index = 1; index < notes.length; index += 1) {
      const previous = notes[index - 1] as Note;
      const note = notes[index] as Note;
      if (previous.tie && previous.start + previous.duration === note.start) tied.add(note.id);
    }
  }
  return tied;
}

/** Everything a bar means to the writer: its place, its meter and key, its notes and the chords that start on it. */
function barSignature(score: Score, index: number, tied: ReadonlySet<string>): string {
  const bar = score.bars[index];
  if (bar === undefined) return "";
  const end = bar.start + bar.length;
  const truncation =
    score.truncation !== null &&
    (score.truncation.bar === index || (index === score.bars.length - 1 && score.truncation.bar >= score.bars.length))
      ? score.truncation
      : null;
  return JSON.stringify({
    index: bar.index,
    start: bar.start,
    length: bar.length,
    meter: bar.meter,
    key: bar.key,
    keyChanges: bar.keyChanges,
    incomplete: bar.incomplete,
    truncation,
    notes: score.notes
      .filter((note) => note.bar === index)
      .sort((left, right) => left.voice.localeCompare(right.voice) || left.start - right.start)
      .map((note) => ({
        voice: note.voice,
        start: note.start,
        duration: note.duration,
        midi: note.midi,
        tie: note.tie,
        tiedFromPrevious: tied.has(note.id),
      })),
    chords: score.chords
      .filter((chord) => chord.start >= bar.start && chord.start < end)
      .sort((left, right) => left.start - right.start)
      .map((chord) => ({ start: chord.start, name: chord.name })),
  });
}

/**
 * The 1-based bars whose content differs between two readings of the same score, sorted. When the number of bars changed,
 * the renumbered tail counts from the first difference, since every bar after it moved; a tail deletion names the last bar
 * that remains.
 */
export function rewrittenBars(before: Score, after: Score): ReadonlyArray<number> {
  if (after.bars.length === 0) return [];
  const tiedBefore = tiedFromPrevious(before);
  const tiedAfter = tiedFromPrevious(after);
  const shared = Math.min(before.bars.length, after.bars.length);
  const changed: number[] = [];
  let first = -1;
  for (let index = 0; index < shared; index += 1) {
    if (barSignature(before, index, tiedBefore) === barSignature(after, index, tiedAfter)) continue;
    if (first < 0) first = index;
    changed.push(index + 1);
  }
  if (before.bars.length === after.bars.length) return changed;
  // A middle change renumbers every bar after it; bars appended past the old end are the only new ones; a tail
  // deletion removed bars without rewriting any that remain.
  const from = first >= 0 ? first : after.bars.length > shared ? shared : after.bars.length;
  return Array.from({ length: after.bars.length - from }, (_item, offset) => from + offset + 1);
}
