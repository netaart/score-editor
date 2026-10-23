// ABOUTME: The spelling engine for keys and chords: key names, fifths, pitch classes and respelling.
// ABOUTME: transposeChord respells chord roots and basses; the song2 writer respells notes from their MIDI.
import type { DialectConstraints } from "./types";

interface KeyParts {
  readonly letter: string;
  readonly accidental: number;
  readonly minor: boolean;
  readonly fifths: number;
  readonly pitchClass: number;
}

const NOTE_SEMITONES: Readonly<Record<string, number>> = { A: 9, B: 11, C: 0, D: 2, E: 4, F: 5, G: 7 };
// The order a letter reaches the next fifths step: F is one flat, C none, G one sharp.
const FIFTH_LETTER_INDEX: Readonly<Record<string, number>> = { F: 0, C: 1, G: 2, D: 3, A: 4, E: 5, B: 6 };
// The constraints contract spells a key with one accidental mark from this set.
const ACCIDENTAL_SEMITONES: Readonly<Record<string, number>> = { bb: -2, b: -1, "": 0, "#": 1, "##": 2 };
const ACCIDENTAL_MARKS: ReadonlyArray<string> = ["bb", "b", "", "#", "##"];

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

function accidentalOf(mark: string): number {
  return ACCIDENTAL_SEMITONES[mark] ?? 0;
}

function parseKey(key: string): KeyParts | null {
  const match = /^([A-G])(bb|b|##|#)?(m)?$/.exec(key);
  if (match === null) return null;
  const letter = match[1] as string;
  const minor = match[3] !== undefined;
  const accidental = accidentalOf(match[2] ?? "");
  const fifths = (FIFTH_LETTER_INDEX[letter] as number) - 1 + 7 * accidental - (minor ? 3 : 0);
  const pitchClass = ((NOTE_SEMITONES[letter] as number) + accidental + 12) % 12;
  return { letter, accidental, minor, fifths, pitchClass };
}

function declaredKeys(constraints: DialectConstraints, minor: boolean): ReadonlyArray<string> {
  return minor ? constraints.keys.minor : constraints.keys.major;
}

export function isDeclaredKey(key: string, constraints: DialectConstraints): boolean {
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

export function transposeKey(key: string, semitones: number, constraints: DialectConstraints): string | null {
  if (!isDeclaredKey(key, constraints)) return null;
  const parts = parseKey(key);
  if (parts === null) return null;
  const pitchClass = (((parts.pitchClass + semitones) % 12) + 12) % 12;
  return keyForPitchClass(pitchClass, parts.minor, constraints);
}

/** The shortest signed semitone distance from one tonic to another: -5 through 6. */
export function shortestShift(from: string, to: string): number {
  const oldParts = parseKey(from);
  const newParts = parseKey(to);
  if (oldParts === null || newParts === null) return 0;
  let shift = (((newParts.pitchClass - oldParts.pitchClass) % 12) + 12) % 12;
  if (shift > 6) shift -= 12;
  return shift;
}

const MAJOR_SCALE: ReadonlyArray<number> = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_SCALE: ReadonlyArray<number> = [0, 2, 3, 5, 7, 8, 10];

/**
 * The seven pitch classes (0 for C through 11 for B) of a key's scale: the major scale, or for a minor key the natural
 * minor, which is the same seven as its relative major. Null for a key this file cannot read.
 */
export function keyPitchClasses(key: string): ReadonlySet<number> | null {
  const parts = parseKey(key);
  if (parts === null) return null;
  return new Set((parts.minor ? NATURAL_MINOR_SCALE : MAJOR_SCALE).map((step) => (parts.pitchClass + step) % 12));
}

function spellingOfPitchClass(
  pitchClass: number,
  fifths: number,
): { readonly letter: string; readonly accidental: number } {
  return (fifths >= 0 ? SHARP_SPELLING : FLAT_SPELLING)[pitchClass] as { letter: string; accidental: number };
}

function pitchClassOfSpelling(spelling: string): number | null {
  const match = /^([A-G])(bb|b|##|#)?$/.exec(spelling);
  if (match === null) return null;
  const letter = match[1] as string;
  return ((NOTE_SEMITONES[letter] as number) + accidentalOf(match[2] ?? "") + 12) % 12;
}

function chordRootText(letter: string, accidental: number): string {
  return `${letter}${ACCIDENTAL_MARKS[accidental + 2] ?? ""}`;
}

/** Transposes a chord name, respelling its root and bass under the key in force where it stands. */
export function transposeChord(name: string, key: string, semitones: number): string | null {
  const root = /^([A-G](?:bb|b|##|#)?)(.*)$/.exec(name);
  if (root === null) return null;
  const rootText = root[1] as string;
  const rest = root[2] as string;
  const slash = rest.indexOf("/");
  const quality = slash < 0 ? rest : rest.slice(0, slash);
  const bassText = slash < 0 ? null : rest.slice(slash + 1);
  if (bassText !== null && !/^[A-G](?:bb|b|##|#)?$/.test(bassText)) return null;

  const fifths = parseKey(key)?.fifths ?? 0;
  const rootPitch = pitchClassOfSpelling(rootText);
  if (rootPitch === null) return null;
  const newRoot = spellingOfPitchClass((((rootPitch + semitones) % 12) + 12) % 12, fifths);
  const newRootText = chordRootText(newRoot.letter, newRoot.accidental);
  if (bassText === null) return `${newRootText}${quality}`;

  const bassPitch = pitchClassOfSpelling(bassText);
  if (bassPitch === null) return null;
  const newBass = spellingOfPitchClass((((bassPitch + semitones) % 12) + 12) % 12, fifths);
  return `${newRootText}${quality}/${chordRootText(newBass.letter, newBass.accidental)}`;
}
