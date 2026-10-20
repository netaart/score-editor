// ABOUTME: Main entry of @neta-art/score-dialect-song2. It depends on the core package for types only.
// ABOUTME: Exports the song2 dialect (identity, declarative constraints, parse, serialize) and its reading facts.
import type { DialectConstraints, Score, ScoreDialect } from "@neta-art/score-editor";
import { CHORD_ROOTS, parseSong2, QUALITIES } from "./parser";

export const song2Id = "song2";

export const song2Constraints: DialectConstraints = {
  voices: [
    { name: "Vocal", required: true, allowsChords: true },
    { name: "Ins", required: false, allowsChords: false },
  ],
  keys: {
    major: ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"],
    minor: ["Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m"],
  },
  tempo: { unit: "1/4", min: 20, max: 400 },
  sectionMarker: "% ",
  lyricsInScore: false,
  // RULES.md D1: the duration numbers the format accepts under its L: unit.
  durations: [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48],
  // RULES.md H3: M:n/d, numerator 1..999999, denominator a power of two up to 1024, never symbolic.
  meter: {
    form: "fraction",
    numerator: { min: 1, max: 999999 },
    denominator: { min: 1, max: 1024, powerOfTwo: true },
    symbolic: false,
  },
  // RULES.md C1-C3: root spelling, quality suffix and an optional slash bass.
  chords: { roots: CHORD_ROOTS, qualities: QUALITIES, slashBass: true },
};

interface Song2Source {
  readonly text: string;
}

function sourceText(score: Score): string {
  const source = score.source as Partial<Song2Source> | null | undefined;
  if (source && typeof source.text === "string") return source.text;
  throw new Error(
    "@neta-art/score-dialect-song2: this score was not read from song2 text, so it cannot be written back.",
  );
}

export const song2Dialect: ScoreDialect = {
  id: song2Id,
  constraints: song2Constraints,
  parse(text) {
    return parseSong2(text);
  },
  serialize(score) {
    return sourceText(score);
  },
};
