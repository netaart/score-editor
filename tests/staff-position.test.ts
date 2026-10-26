// ABOUTME: Seam 1 for the staff play cursor's seconds-to-position mapping: song2 scores read with the real dialect, through the package entry in Node.
// ABOUTME: Every expected tick is worked out by hand from the score's meter and tempo, never from the mapping under test.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { type Score, tickAtSeconds } from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

/** A 4/4 song2 score in C major at `bpm`, with each music line given: four quarter-note bars and a whole-note bar. */
function read(bpm: number, ...music: string[]): Score {
  const text = [
    "X:1",
    "T:",
    "M:4/4",
    "L:1/16",
    `Q:1/4=${bpm}`,
    'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
    "K:C",
    "% a",
    ...music.flatMap((line) => ["V: Vocal", line]),
    "",
  ].join("\n");
  const { score } = song2Dialect.parse(text);
  if (!score) throw new Error("the test score does not read");
  return score;
}

describe("the staff position at a number of seconds", () => {
  it("counts a bar of 4/4 at 120 as two seconds: 2 s is the second bar, 1 s its middle", () => {
    // 120 quarter notes a minute is a quarter note every 0.5 s; a 4/4 bar is four of them, so 2 s.
    const score = read(120, "C4D4E4F4|G16|");

    expect(tickAtSeconds(score, 0)).toBe(0);
    expect(tickAtSeconds(score, 1)).toBe(512);
    expect(tickAtSeconds(score, 2)).toBe(1024);
  });

  it("follows a tempo change in the middle of the score: after 60 BPM a bar lasts four seconds, not two", () => {
    // The first bar at 120 takes 2 s; from tick 1024, 60 quarter notes a minute makes a beat a second and the bar 4 s.
    const score: Score = {
      ...read(120, "C4D4E4F4|G4A4B4c4|C16|"),
      tempoChanges: [{ at: 1024, tempo: { unit: "1/4", bpm: 60 } }],
    };

    expect(tickAtSeconds(score, 2)).toBe(1024);
    expect(tickAtSeconds(score, 2.5)).toBe(1152);
    expect(tickAtSeconds(score, 4)).toBe(1536);
    expect(tickAtSeconds(score, 6)).toBe(2048);
  });

  it("stays at the end of the score past its last second, and at the start before it", () => {
    const score = read(120, "C4D4E4F4|G16|");

    expect(tickAtSeconds(score, -5)).toBe(0);
    expect(tickAtSeconds(score, 1000)).toBe(2048);
  });
});
