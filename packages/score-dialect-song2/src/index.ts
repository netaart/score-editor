// ABOUTME: Main entry of @neta-art/score-dialect-song2. It depends on the core package for types only.
// ABOUTME: The parser, serializer and checker join the declarative constraints in later work.
import type { DialectConstraints } from "@neta-art/score-editor";

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
};
