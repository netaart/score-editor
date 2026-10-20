// ABOUTME: Checks every traced song2 sample through the package entries: it reads, reports the recorded facts and writes back byte for byte.
// ABOUTME: The samples come from our own generation records; expected facts are the ones samples.json records.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { describe, expect, it } from "vitest";

interface SampleFact {
  file: string;
  truncated: boolean;
  voices: string[];
  hasChords: boolean;
}

const directory = new URL("../packages/score-dialect-song2/tests/", import.meta.url);
const facts = JSON.parse(readFileSync(new URL("samples.json", directory), "utf8")) as SampleFact[];

function lf(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

describe("song2 samples", () => {
  for (const fact of facts) {
    it(`${fact.file} reads and writes back unchanged`, () => {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      const { score, diagnostics } = song2Dialect.parse(text);

      expect(diagnostics).toEqual([]);
      expect(score).not.toBeNull();
      if (!score) return;

      expect(score.truncation !== null).toBe(fact.truncated);
      expect(score.voices).toEqual(fact.voices);
      expect(score.hasChords).toBe(fact.hasChords);
      expect(song2Dialect.serialize(score)).toBe(lf(text));
    });
  }
});
