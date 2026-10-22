// ABOUTME: The transpose, set-key, set-tempo and remove-chords commands on the shared score model.
// ABOUTME: Key and chord spelling come from spelling.ts; the dialect writer writes the shifted model back.
import { commandRefusal } from "./command-refusal";
import type { ScoreCommandResult } from "./commands";
import type { Chord, KeyChange, Note, Score } from "./score";
import { isDeclaredKey, shortestShift, transposeChord, transposeKey } from "./spelling";
import type { DialectConstraints } from "./types";

function effectiveKey(keys: ReadonlyArray<KeyChange>, at: number): string {
  let found: string | null = null;
  for (const entry of keys) {
    if (entry.at > at) break;
    found = entry.key;
  }
  return found ?? keys[0]?.key ?? "";
}

function rangeFailure(note: Note, midi: number): ScoreCommandResult {
  return commandRefusal("pitch-out-of-range", { midi, noteId: note.id }, { noteId: note.id, bar: note.bar + 1 });
}

/**
 * Moves every note at or after `from` by `semitones`, rewrites the key timeline and respells the chords.
 * `forced` holds the key-change indices that take `forcedKey` exactly, which is how set-key keeps the target spelling.
 */
function shiftScore(
  score: Score,
  semitones: number,
  constraints: DialectConstraints,
  from: number,
  forced: { readonly indices: ReadonlySet<number>; readonly key: string } | null,
): ScoreCommandResult {
  for (const note of score.notes) {
    if (note.midi === null || note.start < from) continue;
    const midi = note.midi + semitones;
    if (midi < 0 || midi > 127) return rangeFailure(note, midi);
  }

  const keys: KeyChange[] = [];
  for (const [index, entry] of score.keys.entries()) {
    if (entry.at < from) {
      keys.push(entry);
      continue;
    }
    if (forced?.indices.has(index)) {
      keys.push({ at: entry.at, key: forced.key });
      continue;
    }
    // A shift of zero is the identity: only an explicitly forced key rewrites a spelling.
    const key = semitones === 0 ? entry.key : transposeKey(entry.key, semitones, constraints);
    if (key === null) return commandRefusal("key-unavailable", { key: entry.key, semitones });
    keys.push({ at: entry.at, key });
  }

  const notes: Note[] = score.notes.map((note) =>
    note.midi !== null && note.start >= from ? { ...note, midi: note.midi + semitones } : note,
  );

  const chords: Chord[] = [];
  for (const chord of score.chords) {
    if (chord.start < from) {
      chords.push(chord);
      continue;
    }
    const name = transposeChord(chord.name, effectiveKey(keys, chord.start), semitones);
    if (name === null) return commandRefusal("chord-invalid", { name: chord.name });
    chords.push({ ...chord, name });
  }

  const bars = score.bars.map((bar) => ({
    ...bar,
    key: effectiveKey(keys, bar.start),
    keyChanges: bar.keyChanges.map((change) => ({ at: change.at, key: effectiveKey(keys, change.at) })),
  }));

  return { ok: true, score: { ...score, keys, bars, notes, chords } };
}

export function runTranspose(score: Score, semitones: number, constraints: DialectConstraints): ScoreCommandResult {
  if (!Number.isInteger(semitones)) return commandRefusal("semitones-not-integer", { semitones });
  if (semitones === 0) return { ok: true, score };
  return shiftScore(score, semitones, constraints, 0, null);
}

/**
 * Set key is a transposition to the chosen key: choosing a key is a shortcut for transposing to it, and the
 * shortest interval between the tonics moves the register as little as it can.
 */
export function runSetKey(
  score: Score,
  key: string,
  from: number | undefined,
  constraints: DialectConstraints,
): ScoreCommandResult {
  if (!isDeclaredKey(key, constraints)) return commandRefusal("key-not-allowed", { key });
  const at = from ?? 0;
  if (!Number.isInteger(at) || at < 0) return commandRefusal("key-change-not-found", { at });

  const atPosition = score.keys.flatMap((entry, index) => (entry.at === at ? [index] : []));
  if (atPosition.length === 0) return commandRefusal("key-change-not-found", { at });
  const currentIndex = atPosition[atPosition.length - 1] as number;
  const current = score.keys[currentIndex] as KeyChange;

  // The whole score means every key stated at its first instant; a later change means that one effective entry.
  const forcedIndices = new Set(at === 0 ? atPosition : [currentIndex]);
  const semitones = shortestShift(current.key, key);
  return shiftScore(score, semitones, constraints, at, { indices: forcedIndices, key });
}

export function runSetTempo(score: Score, bpm: number, constraints: DialectConstraints): ScoreCommandResult {
  const { min, max, unit } = constraints.tempo;
  if (!Number.isInteger(bpm) || bpm < min || bpm > max) {
    return commandRefusal("tempo-out-of-range", { bpm, min, max });
  }
  return { ok: true, score: { ...score, tempo: { unit, bpm } } };
}

export function runRemoveChords(score: Score): ScoreCommandResult {
  if (score.chords.length === 0 && !score.hasChords) return { ok: true, score };
  return { ok: true, score: { ...score, chords: [], hasChords: false } };
}
