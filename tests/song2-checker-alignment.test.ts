// ABOUTME: Seam 1 checks that the song2 reader accepts and refuses the texts the dialect checker does.
// ABOUTME: The cases are the cut tail that runs past its bar and the whitespace characters T2 covers.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { applyScoreCommand } from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=100
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

describe("a cut tail that runs past its bar", () => {
  const text = `${HEADER}
K:C
% a
V: Vocal
C16|C16|C16|C16-|
V: Vocal
E32`;

  it("is refused by the reader with the bar and line that overflow", () => {
    const { score, diagnostics } = song2Dialect.parse(text);

    expect(score).toBeNull();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: "bar-length",
      params: { bar: 5, meter: "4/4", reason: "overflow" },
      at: { voice: "Vocal", line: 12, bar: 5 },
    });
  });

  it("is refused by a command before the command changes anything", () => {
    const result = applyScoreCommand(song2Dialect, text, { type: "setTempo", bpm: 101 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic).toMatchObject({
      code: "bar-length",
      params: { bar: 5, reason: "overflow" },
      at: { voice: "Vocal", line: 12, bar: 5 },
    });
  });
});

describe("the whitespace T2 covers", () => {
  const input = `${HEADER}
K:C\u00a0
% a\u00a0
V: Vocal\u00a0
\u00a0C16|D16|\u00a0`;

  it("reads a no-break space as whitespace at a line end, a body edge and between tokens", () => {
    const { score, diagnostics } = song2Dialect.parse(input);

    expect(diagnostics).toEqual([]);
    expect(score).not.toBeNull();
    if (score === null) return;
    expect(score.notes.map((note) => [note.start, note.duration, note.midi])).toEqual([
      [0, 1024, 60],
      [1024, 1024, 62],
    ]);
  });

  it("keeps the bytes of a line that carries it when another line changes", () => {
    const result = applyScoreCommand(song2Dialect, input, { type: "setTempo", bpm: 101 });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(input.replace("Q:1/4=100", "Q:1/4=101"));
  });

  it("keeps the raw piece of an untouched bar that carries it", () => {
    const result = applyScoreCommand(song2Dialect, input, { type: "toRest", noteId: "Vocal:1024" });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C\u00a0
% a\u00a0
V: Vocal\u00a0
\u00a0C16|z16|`);
  });
});
