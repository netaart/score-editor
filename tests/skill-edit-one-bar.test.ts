// ABOUTME: Seam 1 for the editor skill's end-to-end example: the same helper the shipped page runs, driven through the two package entries.
// ABOUTME: It pins one bar changing, every other line and bar byte for byte, and the difference between a notice and a refusal.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { applyProjectCommand, formatDiagnostic, isNoticeDiagnostic, noteId } from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";
import { editOneBar } from "../packages/score-editor/skills/score-editor/assets/edit-one-bar/edit-one-bar.js";
import { splitBars } from "./song2-support";

const input = readFileSync(
  new URL("../packages/score-editor/skills/score-editor/assets/edit-one-bar/score.abc", import.meta.url),
  "utf8",
);
const dependencies = {
  song2Dialect,
  applyProjectCommand,
  noteId,
  isNoticeDiagnostic,
  formatDiagnostic,
};

describe("the editor skill's edit-one-bar example", () => {
  it("changes the requested bar and leaves every other line and bar byte for byte", () => {
    const result = editOneBar(input, dependencies, { bar: 5, chord: "C" });

    expect(result.ok, result.message).toBe(true);
    expect(result.stage).toBe("written");
    expect(result.noteId).toBe("Vocal:4096");
    expect(result.notices.map((diagnostic) => diagnostic.code)).toEqual(["melody-with-chords"]);
    expect(result.refusals).toEqual([]);
    expect(result.after).not.toBeNull();
    if (result.after === null) throw new Error("the example wrote no score");

    const beforeLines = input.split("\n");
    const afterLines = result.after.split("\n");
    expect(afterLines).toHaveLength(beforeLines.length);
    expect(result.changedLines).toEqual([15]);

    for (const [index, line] of beforeLines.entries()) {
      if (index === 14) continue;
      expect(afterLines[index], `line ${index + 1}`).toBe(line);
    }
    expect(afterLines[14]).toBe('"C"f4g4z8|z16|z16|z16|');

    const beforeBars = splitBars(input);
    const afterBars = splitBars(result.after);
    expect(afterBars.otherLines).toEqual(beforeBars.otherLines);
    expect([...afterBars.pieces.keys()].sort()).toEqual([...beforeBars.pieces.keys()].sort());
    for (const [key, piece] of beforeBars.pieces) {
      if (key === "Vocal:4") {
        expect(afterBars.pieces.get(key)).toBe('"C"f4g4z8');
      } else {
        expect(afterBars.pieces.get(key), key).toBe(piece);
      }
    }

    const readBack = song2Dialect.parse(result.after);
    expect(readBack.diagnostics).toEqual([]);
    expect(readBack.score).not.toBeNull();
    if (readBack.score) expect(song2Dialect.check(readBack.score)).toEqual([]);
  });

  it("returns the unchanged input and the refusal when the chord is outside the vocabulary", () => {
    const result = editOneBar(input, dependencies, { bar: 5, chord: "C13" });

    expect(result.ok).toBe(false);
    expect(result.stage).toBe("command");
    expect(result.refusals.map((diagnostic) => diagnostic.code)).toEqual(["chord-vocabulary"]);
    expect(result.notices).toEqual([]);
    expect(result.before).toBe(input);
    expect(result.after).toBeNull();
    expect(result.project).toBeNull();
    expect(result.changedLines).toEqual([]);
    expect(result.message).toContain("refused");
  });
});
