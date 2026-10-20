// ABOUTME: Checks the host-built dialect registry and the declarative song2 constraints through the package entries.
// ABOUTME: There is no global registry: a host passes the dialects it imports and finds one by model ID.

import { song2Constraints, song2Dialect, song2Id } from "@neta-art/score-dialect-song2";
import { createDialectRegistry } from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

describe("dialect registry and constraints", () => {
  it("finds song2 by model id and misses an unknown model", () => {
    const registry = createDialectRegistry([song2Dialect]);

    expect(registry.find("song2")).toBe(song2Dialect);
    expect(registry.find("another-model")).toBeUndefined();
    expect(song2Dialect.id).toBe(song2Id);
    expect(song2Dialect.constraints).toBe(song2Constraints);
  });

  it("declares song2's durations, meter, chord vocabulary and tempo", () => {
    expect(song2Constraints.durations).toEqual([1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48]);
    expect(song2Constraints.meter).toMatchObject({
      form: "fraction",
      numerator: { min: 1, max: 999999 },
      denominator: { min: 1, max: 1024, powerOfTwo: true },
      symbolic: false,
    });
    expect(song2Constraints.chords.slashBass).toBe(true);
    expect(song2Constraints.chords.qualities).toEqual([
      "",
      "m",
      "dim",
      "aug",
      "7",
      "maj7",
      "m7",
      "dim7",
      "m7b5",
      "sus4",
      "sus2",
      "6",
      "m6",
      "7sus4",
      "m(maj7)",
    ]);
    expect(song2Constraints.chords.roots).toContain("C#");
    expect(song2Constraints.chords.roots).toContain("Dbb");
    expect(song2Constraints.tempo).toEqual({ unit: "1/4", min: 20, max: 400 });
  });
});
