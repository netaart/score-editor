// ABOUTME: The transpose, set-key, set-tempo and remove-chords commands on the shared score model.
// ABOUTME: Key spelling follows the dialect's declared keys; notes and chords are respelled by the dialect's writer.
import type { ScoreCommandResult } from "./commands";
import type { Diagnostic } from "./diagnostics";
import type { Chord, KeyChange, Note, Score } from "./score";
import type { DialectConstraints } from "./types";

interface KeyParts {
  readonly letter: string;
  readonly accidental: number;
  readonly minor: boolean;
  readonly fifths: number;
  readonly pitchClass: number;
}

const NOTE_SEMITONES: Readonly<Record<string, number>> = { A: 9, B: 11, C: 0, D: 2, E: 4, F: 5, G: 7 };
// RULES.md H9: the order a letter reaches the next fifths step. F is one flat, C none, G one sharp.
const FIFTH_LETTER_INDEX: Readonly<Record<string, number>> = { F: 0, C: 1, G: 2, D: 3, A: 4, E: 5, B: 6 };

const SHARP_SPELLING: ReadonlyArray<{ letter: string; accidental: number }> = [
  { letter: "C", accidental: 0 },
  { letter: "C", accidental: 1 },
  { letter: "D", accidental: 0 },
  { letter: "D", accidental: 1 },
  { letter: "E", accidental: 0 },
  { letter: "F", accidental: 0 },
  { letter: "F", accidental: 1 },
  { letter: "G", accidental: 0 },
  { letter: "G", accidental: 1 },
  { letter: "A", accidental: 0 },
  { letter: "A", accidental: 1 },
  { letter: "B", accidental: 0 },
];

const FLAT_SPELLING: ReadonlyArray<{ letter: string; accidental: number }> = [
  { letter: "C", accidental: 0 },
  { letter: "D", accidental: -1 },
  { letter: "D", accidental: 0 },
  { letter: "E", accidental: -1 },
  { letter: "E", accidental: 0 },
  { letter: "F", accidental: 0 },
  { letter: "G", accidental: -1 },
  { letter: "G", accidental: 0 },
  { letter: "A", accidental: -1 },
  { letter: "A", accidental: 0 },
  { letter: "B", accidental: -1 },
  { letter: "B", accidental: 0 },
];

function parseKey(key: string): KeyParts | null {
  const match = /^([A-G])(bb|b|##|#)?(m)?$/.exec(key);
  if (match === null) return null;
  const letter = match[1] as string;
  const mark = match[2] ?? "";
  const minor = match[3] !== undefined;
  const accidental = mark === "bb" ? -2 : mark === "b" ? -1 : mark === "##" ? 2 : mark === "#" ? 1 : 0;
  // H9: a letter's natural fifths come from its place in the sharp order; each accidental adds seven.
  const fifths = (FIFTH_LETTER_INDEX[letter] as number) - 1 + 7 * accidental - (minor ? 3 : 0);
  const pitchClass = ((NOTE_SEMITONES[letter] as number) + accidental + 12) % 12;
  return { letter, accidental, minor, fifths, pitchClass };
}

function declaredKeys(constraints: DialectConstraints, minor: boolean): ReadonlyArray<string> {
  return minor ? constraints.keys.minor : constraints.keys.major;
}

function isDeclaredKey(key: string, constraints: DialectConstraints): boolean {
  return constraints.keys.major.includes(key) || constraints.keys.minor.includes(key);
}

/**
 * The declared spelling of a pitch class in the same mode. Fewest accidentals wins; on a tie the spelling
 * listed first in the dialect's constraints wins, so the choice is stable and comes from the dialect.
 */
function keyForPitchClass(pitchClass: number, minor: boolean, constraints: DialectConstraints): string | null {
  let best: { key: string; accidentals: number } | null = null;
  for (const key of declaredKeys(constraints, minor)) {
    const parts = parseKey(key);
    if (parts === null || parts.minor !== minor || parts.pitchClass !== pitchClass) continue;
    const accidentals = Math.abs(parts.fifths);
    if (best === null || accidentals < best.accidentals) best = { key, accidentals };
  }
  return best?.key ?? null;
}

function transposeKey(key: string, semitones: number, constraints: DialectConstraints): string | null {
  if (!isDeclaredKey(key, constraints)) return null;
  const parts = parseKey(key);
  if (parts === null) return null;
  const pitchClass = (((parts.pitchClass + semitones) % 12) + 12) % 12;
  return keyForPitchClass(pitchClass, parts.minor, constraints);
}

function effectiveKey(keys: ReadonlyArray<KeyChange>, at: number): string {
  let found: string | null = null;
  for (const entry of keys) {
    if (entry.at > at) break;
    found = entry.key;
  }
  return found ?? keys[0]?.key ?? "";
}

function chordRootText(letter: string, accidental: number): string {
  const marks =
    accidental === -2 ? "bb" : accidental === -1 ? "b" : accidental === 1 ? "#" : accidental === 2 ? "##" : "";
  return `${letter}${marks}`;
}

function spelledPitchClass(pitchClass: number, fifths: number): { letter: string; accidental: number } {
  return (fifths >= 0 ? SHARP_SPELLING : FLAT_SPELLING)[pitchClass] as { letter: string; accidental: number };
}

function spellingPitchClass(spelling: string): number | null {
  const match = /^([A-G])(bb|b|##|#)?$/.exec(spelling);
  if (match === null) return null;
  const letter = match[1] as string;
  const mark = match[2] ?? "";
  const accidental = mark === "bb" ? -2 : mark === "b" ? -1 : mark === "##" ? 2 : mark === "#" ? 1 : 0;
  return ((NOTE_SEMITONES[letter] as number) + accidental + 12) % 12;
}

/** Transposes a chord name, respelling its root and bass under the key in force where it stands. */
function transposeChord(name: string, key: string, semitones: number): string | null {
  const root = /^([A-G](?:bb|b|##|#)?)(.*)$/.exec(name);
  if (root === null) return null;
  const rootText = root[1] as string;
  const rest = root[2] as string;
  const slash = rest.indexOf("/");
  const quality = slash < 0 ? rest : rest.slice(0, slash);
  const bassText = slash < 0 ? null : rest.slice(slash + 1);
  if (bassText !== null && !/^[A-G](?:bb|b|##|#)?$/.test(bassText)) return null;

  const fifths = parseKey(key)?.fifths ?? 0;
  const rootPitch = spellingPitchClass(rootText);
  if (rootPitch === null) return null;
  const newRoot = spelledPitchClass((((rootPitch + semitones) % 12) + 12) % 12, fifths);
  const newRootText = chordRootText(newRoot.letter, newRoot.accidental);
  if (bassText === null) return `${newRootText}${quality}`;

  const bassPitch = spellingPitchClass(bassText);
  if (bassPitch === null) return null;
  const newBass = spelledPitchClass((((bassPitch + semitones) % 12) + 12) % 12, fifths);
  return `${newRootText}${quality}/${chordRootText(newBass.letter, newBass.accidental)}`;
}

function failure(
  code: Diagnostic["code"],
  params: Diagnostic["params"],
  at: Diagnostic["at"] = {},
): ScoreCommandResult {
  return { ok: false, diagnostic: { code, params, at } };
}

function rangeFailure(note: Note, midi: number): ScoreCommandResult {
  return failure("pitch-out-of-range", { midi, noteId: note.id }, { noteId: note.id, bar: note.bar + 1 });
}

/** The shortest signed semitone distance from one tonic to another: -5 through 6. */
function shortestShift(from: string, to: string): number {
  const oldParts = parseKey(from);
  const newParts = parseKey(to);
  if (oldParts === null || newParts === null) return 0;
  let shift = (((newParts.pitchClass - oldParts.pitchClass) % 12) + 12) % 12;
  if (shift > 6) shift -= 12;
  return shift;
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
    if (key === null) return failure("key-unavailable", { key: entry.key, semitones });
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
    if (name === null) return failure("chord-invalid", { name: chord.name });
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
  if (!Number.isInteger(semitones)) return failure("semitones-not-integer", { semitones });
  if (semitones === 0) return { ok: true, score };
  return shiftScore(score, semitones, constraints, 0, null);
}

export function runSetKey(
  score: Score,
  key: string,
  from: number | undefined,
  constraints: DialectConstraints,
): ScoreCommandResult {
  if (!isDeclaredKey(key, constraints)) return failure("key-not-allowed", { key });
  const at = from ?? 0;
  if (!Number.isInteger(at) || at < 0) return failure("key-change-not-found", { at });

  const atPosition = score.keys.flatMap((entry, index) => (entry.at === at ? [index] : []));
  if (atPosition.length === 0) return failure("key-change-not-found", { at });
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
    return failure("tempo-out-of-range", { bpm, min, max });
  }
  return { ok: true, score: { ...score, tempo: { unit, bpm } } };
}

export function runRemoveChords(score: Score): ScoreCommandResult {
  if (score.chords.length === 0 && !score.hasChords) return { ok: true, score };
  return { ok: true, score: { ...score, chords: [], hasChords: false } };
}
