// ABOUTME: Reads the shared song2 vectors through the package entries and pins every reading fact they state.
// ABOUTME: Runs in node only: the dialect's parse and serialize are the only browser-independent seam they need.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { TICKS_PER_QUARTER } from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

interface FractionNote {
  start: string;
  duration: string;
  pitch: number | null;
  tie: boolean;
}

interface FractionChord {
  at: string;
  name: string;
}

interface FractionBar {
  start: string;
  length: string;
  meter: string;
}

interface FractionKey {
  at: string;
  key: string;
}

interface Vector {
  id: string;
  rules: string[];
  text: string;
  expect: "accept" | "reject";
  truncated?: boolean;
  voices?: string[];
  hasChords?: boolean;
  notes?: Record<string, FractionNote[]>;
  chords?: Record<string, FractionChord[]>;
  bars?: Record<string, FractionBar[]>;
  keys?: Record<string, FractionKey[]>;
  code?: string;
}

const vectors = (
  JSON.parse(readFileSync(new URL("../packages/score-dialect-song2/tests/vectors.json", import.meta.url), "utf8")) as {
    vectors: Vector[];
  }
).vectors;

function ticks(fraction: string): number {
  const [numerator = "0", denominator = "1"] = fraction.split("/");
  return (Number(numerator) / Number(denominator)) * TICKS_PER_QUARTER;
}

function lf(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

describe("song2 vectors", () => {
  for (const vector of vectors) {
    it(`${vector.id} (${vector.rules.join(", ")})`, () => {
      const { score, diagnostics } = song2Dialect.parse(vector.text);

      if (vector.expect === "reject") {
        expect(diagnostics.some((diagnostic) => diagnostic.code === vector.code)).toBe(true);
        expect(score).toBeNull();
        return;
      }

      expect(diagnostics).toEqual([]);
      expect(score).not.toBeNull();
      if (!score) return;

      expect(score.truncation !== null).toBe(vector.truncated);
      expect(score.voices).toEqual(vector.voices);
      expect(score.hasChords).toBe(vector.hasChords);

      if (vector.notes) {
        for (const [voice, expected] of Object.entries(vector.notes)) {
          const actual = score.notes
            .filter((note) => note.voice === voice)
            .map((note) => ({
              start: note.start,
              duration: note.duration,
              pitch: note.midi,
              tie: note.tie,
            }));
          expect(actual).toEqual(
            expected.map((note) => ({
              start: ticks(note.start),
              duration: ticks(note.duration),
              pitch: note.pitch,
              tie: note.tie,
            })),
          );
        }
      }

      if (vector.chords) {
        for (const [voice, expected] of Object.entries(vector.chords)) {
          expect(voice).toBe("Vocal");
          const actual = score.chords.map((chord) => ({ at: chord.start, name: chord.name }));
          expect(actual).toEqual(expected.map((chord) => ({ at: ticks(chord.at), name: chord.name })));
        }
      }

      if (vector.bars) {
        for (const [voice, expected] of Object.entries(vector.bars)) {
          const actual = score.bars
            .filter((bar) => !bar.incomplete)
            .map((bar) => ({
              start: bar.start,
              length: bar.length,
              meter: `${bar.meter.numerator}/${bar.meter.denominator}`,
            }));
          expect(voice).toBe("Vocal");
          expect(actual).toEqual(
            expected.map((bar) => ({ start: ticks(bar.start), length: ticks(bar.length), meter: bar.meter })),
          );
        }
      }

      if (vector.keys) {
        for (const [voice, expected] of Object.entries(vector.keys)) {
          expect(voice).toBe("Vocal");
          expect(score.keys).toEqual(expected.map((key) => ({ at: ticks(key.at), key: key.key })));
        }
      }

      expect(song2Dialect.serialize(score)).toBe(lf(vector.text));
    });
  }
});
