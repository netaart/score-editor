// ABOUTME: Seam 1 cases for the text a staff view draws: a Z2-Z4 run becomes ordinary whole-bar rests in the meter in force.
// ABOUTME: The expected rest lengths are worked by hand from the meter and the score's L: unit, never from the parser.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { describe, expect, it } from "vitest";

/** A Vocal-only song2 score with a meter field before the music when one is given. */
function score(meter: string | null, music: string): string {
  return [
    "X:1",
    "T:",
    "M:4/4",
    "L:1/16",
    "Q:1/4=100",
    'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
    "K:C",
    "% a",
    "V: Vocal",
    ...(meter === null ? [] : [`M:${meter}`]),
    music,
    "",
  ].join("\n");
}

/** The one music line the parser draws for the run. */
function drawingLine(text: string): string {
  const { score: parsed, diagnostics } = song2Dialect.parse(text);
  expect(diagnostics).toEqual([]);
  const line = parsed?.drawingText?.split("\n").find((found) => found.includes("C4"));
  if (line === undefined) throw new Error("the score has no drawing line");
  return line;
}

describe("a Z run in the text a staff view draws", () => {
  it("draws a 4/4 run from z16 rests: four quarter notes fill a bar at L:1/16", () => {
    expect(drawingLine(score(null, "C4D4E4F4|Z3|"))).toBe("C4D4E4F4|z16|z16|z16|");
  });

  it("follows a meter change to 2/4 before the run: the same bar is eight sixteenths", () => {
    expect(drawingLine(score("2/4", "C4D4|Z3|"))).toBe("C4D4|z8|z8|z8|");
  });

  it("follows 3/4 before the run: the same bar is twelve sixteenths", () => {
    expect(drawingLine(score("3/4", "C4D4E4|Z3|"))).toBe("C4D4E4|z12|z12|z12|");
  });
});
