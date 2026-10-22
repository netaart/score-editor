// ABOUTME: The lyric model on a song project: phrase binding, legacy layout, syllable counting and the joined lyrics text.
// ABOUTME: Alignment is computed from the score and a line, so only the line's text and bar binding are ever stored.
import type { LyricLine, LyricPhrase, Note, Score, Section } from "./score";

export type { LyricLine, LyricPhrase } from "./score";

/** The 2,000-character limit the generation gateway applies to the joined lyrics text. */
export const LYRICS_MAX_CHARACTERS = 2000;

/** One syllable and the score note it is sung on, when the counts match. */
export interface LyricSyllableNote {
  readonly syllable: string;
  readonly note: Note;
}

/** The syllable count, the note onsets and whether a line's phrase fits them. */
export interface LyricAlignment {
  readonly syllables: ReadonlyArray<string>;
  readonly onsets: ReadonlyArray<Note>;
  /** True when the syllable count equals the onset count. */
  readonly equal: boolean;
  /** One note per syllable when `equal`; `null` otherwise. */
  readonly notes: ReadonlyArray<LyricSyllableNote> | null;
}

function sectionOf(score: Score, bar: number): Section | undefined {
  return score.sections.find((section) => bar >= section.firstBar && bar < section.firstBar + section.barCount);
}

/** Clamps a phrase to the score and to the section that owns its first bar. */
export function clampPhrase(score: Score, phrase: LyricPhrase): LyricPhrase | null {
  const first = Math.max(0, Math.floor(phrase.firstBar));
  const count = Math.max(0, Math.floor(phrase.barCount));
  if (count === 0 || first >= score.bars.length) return null;
  const section = sectionOf(score, first);
  if (section === undefined) return null;
  const end = Math.min(first + count, section.firstBar + section.barCount, score.bars.length);
  return end <= first ? null : { firstBar: first, barCount: end - first };
}

/** The label on a legacy lyrics line, or `null` when the line is a lyric line rather than a `[section]` label. */
function labelOf(line: string): string | null {
  const match = /^[ \t]*\[([^\]\r\n]+)\][ \t]*$/.exec(line);
  if (match === null) return null;
  const name = (match[1] as string).trim();
  return name === "" ? null : name;
}

interface LegacyGroup {
  readonly name: string | null;
  readonly lines: string[];
}

/**
 * Lays a legacy `lyrics` text onto a score: a label selects the first unused section with that name, and its lines go
 * one per bar from the section's first bar. Lines before the first label go into the unnamed opening section, or into
 * the first section when the score has none. Lines that do not fit and lines under a label with no section go to the
 * unaligned area in text order.
 */
export function layoutLyrics(score: Score, lyrics: string): LyricLine[] {
  const groups: LegacyGroup[] = [{ name: null, lines: [] }];
  for (const raw of lyrics.replace(/\r\n?/g, "\n").split("\n")) {
    const label = labelOf(raw);
    if (label !== null) {
      groups.push({ name: label, lines: [] });
    } else if (raw.trim() !== "") {
      (groups[groups.length - 1] as LegacyGroup).lines.push(raw);
    }
  }

  const used = new Set<number>();
  const cursors = new Map<number, number>();
  const lines: LyricLine[] = [];
  const unaligned: LyricLine[] = [];
  const place = (sectionIndex: number, group: LegacyGroup): void => {
    const section = score.sections[sectionIndex] as Section;
    let bar = cursors.get(sectionIndex) ?? section.firstBar;
    const end = section.firstBar + section.barCount;
    for (const text of group.lines) {
      if (bar < end) {
        lines.push({ text, phrase: { firstBar: bar, barCount: 1 } });
        bar += 1;
      } else {
        unaligned.push({ text, phrase: null });
      }
    }
    cursors.set(sectionIndex, bar);
  };

  const preamble = groups[0] as LegacyGroup;
  if (preamble.lines.length > 0 && score.sections.length > 0) {
    const unnamed = score.sections.findIndex((section) => section.name === null);
    place(unnamed >= 0 ? unnamed : 0, preamble);
  }

  for (const group of groups.slice(1)) {
    const index = score.sections.findIndex((section, candidate) => !used.has(candidate) && section.name === group.name);
    if (index < 0) {
      unaligned.push(...group.lines.map((text) => ({ text, phrase: null })));
      continue;
    }
    used.add(index);
    place(index, group);
  }
  return [...lines, ...unaligned];
}

/** The lines a project carries: its stored lines, or the layout computed from a legacy `lyrics` text. */
export function lyricLinesOf(
  project: { readonly lyrics: string; readonly lyricLines?: ReadonlyArray<LyricLine> },
  score: Score,
): ReadonlyArray<LyricLine> {
  return project.lyricLines ?? layoutLyrics(score, project.lyrics);
}

/** Lines bound to a phrase, in stored order. */
export function alignedLyricLines(lines: ReadonlyArray<LyricLine>): ReadonlyArray<LyricLine> {
  return lines.filter((line) => line.phrase !== null);
}

/** Lines in the unaligned area, in stored order. */
export function unalignedLyricLines(lines: ReadonlyArray<LyricLine>): ReadonlyArray<LyricLine> {
  return lines.filter((line) => line.phrase === null);
}

/**
 * The `lyrics` text a project writes: section order, a `[name]` label before each named section's lines, and no label
 * for the unnamed opening section. A named empty section keeps its label; the unnamed empty section writes nothing.
 * Lines in the unaligned area are not part of the text.
 */
export function joinLyrics(score: Score, lines: ReadonlyArray<LyricLine>): string {
  const parts: string[] = [];
  for (const section of score.sections) {
    const inSection = lines
      .filter(
        (line) =>
          line.phrase !== null &&
          line.phrase.firstBar >= section.firstBar &&
          line.phrase.firstBar < section.firstBar + section.barCount,
      )
      .sort((left, right) => (left.phrase?.firstBar ?? 0) - (right.phrase?.firstBar ?? 0));
    if (section.name !== null) parts.push(`[${section.name}]`);
    for (const line of inSection) parts.push(line.text);
  }
  return parts.join("\n");
}

/** Characters in a lyrics text, counted as Unicode code points, line breaks included. */
export function lyricCharacterCount(text: string): number {
  return Array.from(text).length;
}

const LATIN = /\p{Script=Latin}/u;
const HAN = /\p{Script=Han}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const LETTER = /[\p{L}\p{N}]/u;
const MARK = /\p{M}/u;
const DIGIT = /^[0-9]$/;
const VOWELS = "aeiou";

function isLatinLetter(char: string): boolean {
  return LATIN.test(char);
}

function isVowelAt(word: ReadonlyArray<string>, index: number): boolean {
  const char = (word[index] as string).toLowerCase();
  if (VOWELS.includes(char)) return true;
  if (char !== "y") return false;
  const before = word[index - 1]?.toLowerCase() ?? "";
  const after = word[index + 1]?.toLowerCase() ?? "";
  return !(before !== "" && VOWELS.includes(before)) && !(after !== "" && VOWELS.includes(after));
}

/** Splits one Latin word into estimated syllables by vowel groups; a word with no vowel group is one syllable. */
function latinSyllables(word: string): string[] {
  const chars = Array.from(word);
  const groups: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < chars.length; index += 1) {
    if (isVowelAt(chars, index)) {
      const last = groups[groups.length - 1];
      if (last !== undefined && last.end === index - 1) last.end = index;
      else groups.push({ start: index, end: index });
    }
  }
  if (groups.length === 0) return [word];
  const pieces: string[] = [];
  let start = 0;
  for (let index = 0; index < groups.length - 1; index += 1) {
    const group = groups[index] as { start: number; end: number };
    const next = groups[index + 1] as { start: number; end: number };
    const boundary = Math.max(group.end + 1, next.start - 1);
    if (boundary <= start || boundary >= chars.length) continue;
    pieces.push(chars.slice(start, boundary).join(""));
    start = boundary;
  }
  pieces.push(chars.slice(start).join(""));
  return pieces.filter((piece) => piece !== "");
}

/**
 * The syllable units of a lyrics text. Han characters, kana, other letters and digits count one each, with a combining
 * mark staying on its base; a Latin word is split by vowel groups and a hyphen splits a word by hand. Spaces and
 * punctuation are not sung and count nothing.
 */
export function lyricSyllables(text: string): string[] {
  const syllables: string[] = [];
  let index = 0;
  while (index < text.length) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) break;
    const char = String.fromCodePoint(codePoint);
    if (isLatinLetter(char)) {
      let end = index + char.length;
      let word = char;
      while (end < text.length) {
        const next = text.codePointAt(end);
        if (next === undefined) break;
        const nextChar = String.fromCodePoint(next);
        if (isLatinLetter(nextChar) || nextChar === "'") {
          word += nextChar;
          end += nextChar.length;
        } else if (MARK.test(nextChar)) {
          word += nextChar;
          end += nextChar.length;
        } else {
          break;
        }
      }
      syllables.push(...latinSyllables(word));
      index = end;
      continue;
    }
    if (HAN.test(char) || KANA.test(char) || DIGIT.test(char) || LETTER.test(char)) {
      let end = index + char.length;
      let unit = char;
      while (end < text.length) {
        const next = text.codePointAt(end);
        if (next === undefined) break;
        const nextChar = String.fromCodePoint(next);
        if (!MARK.test(nextChar)) break;
        unit += nextChar;
        end += nextChar.length;
      }
      syllables.push(unit);
      index = end;
      continue;
    }
    index += char.length;
  }
  return syllables;
}

/** The number of syllables the editor estimates for a lyrics text. */
export function syllableCount(text: string): number {
  return lyricSyllables(text).length;
}

/** The notes a phrase starts on: `Vocal` notes in its bars that are not rests and not a tie continuation. */
export function noteOnsets(score: Score, phrase: LyricPhrase): Note[] {
  const clamped = clampPhrase(score, phrase);
  if (clamped === null) return [];
  const end = clamped.firstBar + clamped.barCount;
  const vocal = score.notes.filter((note) => note.voice === "Vocal").sort((left, right) => left.start - right.start);
  const onsets: Note[] = [];
  for (let index = 0; index < vocal.length; index += 1) {
    const note = vocal[index] as Note;
    if (note.bar < clamped.firstBar || note.bar >= end || note.midi === null) continue;
    const previous = vocal[index - 1];
    const tied = previous?.tie === true && previous.start + previous.duration === note.start;
    if (!tied) onsets.push(note);
  }
  return onsets;
}

/** Compares a line's syllable count with its phrase's note onsets and, when equal, gives each syllable its note. */
export function alignLyricLine(score: Score, line: LyricLine): LyricAlignment {
  const syllables = lyricSyllables(line.text);
  const onsets = line.phrase === null ? [] : noteOnsets(score, line.phrase);
  const equal = line.phrase !== null && syllables.length === onsets.length;
  return {
    syllables,
    onsets,
    equal,
    notes: equal ? syllables.map((syllable, index) => ({ syllable, note: onsets[index] as Note })) : null,
  };
}
