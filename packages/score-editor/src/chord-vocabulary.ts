// ABOUTME: The chord names a dialect's vocabulary allows: how a name splits into root, quality and bass, and what a picker may offer.
// ABOUTME: One place for the spelling rules (a letter, then #, ##, b or bb), so the set-chord command and the picker agree.
import type { ChordVocabulary } from "./types";

/** A letter A-G and the roots the vocabulary has on it, flat to sharp. */
export interface ChordLetter {
  readonly letter: string;
  readonly roots: ReadonlyArray<string>;
}

/** What a chord picker may offer for a vocabulary: nothing that the dialect would refuse. */
export interface ChordChoices {
  /** The letters the vocabulary has roots on, in the order C D E F G A B. */
  readonly letters: ReadonlyArray<ChordLetter>;
  /** The vocabulary's qualities, in its order. The empty string is a major triad. */
  readonly qualities: ReadonlyArray<string>;
  /** Whether a bass note may follow a slash. */
  readonly slashBass: boolean;
}

const LETTER_ORDER = ["C", "D", "E", "F", "G", "A", "B"];
const SPELLING_ORDER = ["bb", "b", "", "#", "##"];

/**
 * What a picker may offer for `vocabulary`. A root that is not a letter A-G with one of the documented spellings
 * (`ChordVocabulary`) has no place in a picker built on letters, so it is left out.
 */
export function chordChoices(vocabulary: ChordVocabulary): ChordChoices {
  const letters: ChordLetter[] = [];
  for (const letter of LETTER_ORDER) {
    const roots = SPELLING_ORDER.map((spelling) => `${letter}${spelling}`).filter((root) =>
      vocabulary.roots.includes(root),
    );
    if (roots.length > 0) letters.push({ letter, roots });
  }
  return { letters, qualities: vocabulary.qualities, slashBass: vocabulary.slashBass };
}

/** A chord name taken apart: its root, its quality (the empty string for a major triad) and its bass, if it has one. */
export interface ChordNameParts {
  readonly root: string;
  readonly quality: string;
  readonly bass: string | null;
}

/** The root and quality that make up all of `text`, preferring the longest root that fits. */
function rootAndQuality(text: string, vocabulary: ChordVocabulary): { root: string; quality: string } | null {
  const roots = [...vocabulary.roots].sort((a, b) => b.length - a.length);
  for (const root of roots) {
    if (!text.startsWith(root)) continue;
    const quality = text.slice(root.length);
    if (vocabulary.qualities.includes(quality)) return { root, quality };
  }
  return null;
}

/**
 * Takes `name` apart by `vocabulary`: a root and one quality, then, where the vocabulary has slash bass, optionally a
 * slash and a root. Null when the name is not exactly that, so a name is accepted if and only if this gives parts.
 */
export function splitChordName(name: string, vocabulary: ChordVocabulary): ChordNameParts | null {
  const slash = name.indexOf("/");
  if (slash < 0) {
    const found = rootAndQuality(name, vocabulary);
    return found && { ...found, bass: null };
  }
  if (!vocabulary.slashBass || name.indexOf("/", slash + 1) >= 0) return null;
  const bass = name.slice(slash + 1);
  const found = rootAndQuality(name.slice(0, slash), vocabulary);
  return found && vocabulary.roots.includes(bass) ? { ...found, bass } : null;
}
