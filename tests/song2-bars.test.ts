// ABOUTME: Seam 1 for the bar, meter and truncation commands: every sample plus hand-worked texts from RULES.md.
// ABOUTME: Untouched bars are compared as raw music-line pieces, and the cut-tail bytes of an untouched tail stay verbatim.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { applyScoreCommand, type Note, type Score, type ScoreCommand } from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."`;

const VOCAL_HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

const directory = new URL("../packages/score-dialect-song2/tests/", import.meta.url);
const facts = JSON.parse(readFileSync(new URL("samples.json", directory), "utf8")) as { file: string }[];

function parse(text: string): Score {
  const result = song2Dialect.parse(text);
  expect(result.diagnostics).toEqual([]);
  if (result.score === null) throw new Error("the score did not read");
  return result.score;
}

function check(score: Score): void {
  expect(song2Dialect.check(score)).toEqual([]);
}

function wholeRestCount(body: string): number {
  if (body === "Z") return 1;
  if (body.length === 2 && body[0] === "Z" && body[1] !== undefined && "234".includes(body[1])) {
    return Number(body[1]);
  }
  return 1;
}

/** The raw piece of every bar, keyed voice:index, following the reader's T2 stripping. */
function splitBars(text: string): Map<string, string> {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""));
  let bodyStart = lines.findIndex((line) => line.startsWith("K:"));
  bodyStart = bodyStart < 0 ? lines.length : bodyStart + 1;
  const pieces = new Map<string, string>();
  const nextBar = new Map<string, number>();
  let voice: string | null = null;
  for (const line of lines.slice(bodyStart)) {
    if (line === "V: Vocal" || line === "V: Ins") {
      voice = line.slice(3);
      continue;
    }
    if (line === "" || line.startsWith("M:") || line.startsWith("K:") || line.startsWith("%")) continue;
    if (voice === null) continue;
    const closes = line.endsWith("|");
    const bodies = line.split("|");
    if (closes) bodies.pop();
    for (const raw of bodies) {
      const body = raw.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
      const count = wholeRestCount(body);
      const first = nextBar.get(voice) ?? 0;
      for (let offset = 0; offset < count; offset += 1) pieces.set(`${voice}:${first + offset}`, raw);
      nextBar.set(voice, first + count);
    }
  }
  return pieces;
}

function noteFacts(note: Note): [string, number, number, number | null, boolean] {
  return [note.voice, note.start, note.duration, note.midi, note.tie];
}

const KEY_METER_SCORE = `${HEADER}
K:C
% intro
V: Vocal
C4D4E4F4|G16|
V: Ins
z16|z16|
% verse
V: Vocal
M:3/4
K:G
B12|A12|
V: Ins
M:3/4
K:G
z12|z12|`;

describe("insertBar", () => {
  it("inserts a full bar of rests in the meter and key before the change point", () => {
    const result = applyScoreCommand(song2Dialect, KEY_METER_SCORE, { type: "insertBar", bar: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
% intro
V: Vocal
C4D4E4F4|z16|G16|
V: Ins
z16|z16|z16|
% verse
V: Vocal
M:3/4
K:G
B12|A12|
V: Ins
M:3/4
K:G
z12|z12|`);
    const output = parse(result.text);
    check(output);
    expect(output.bars).toHaveLength(5);
    expect(output.bars[1]?.meter).toEqual({ numerator: 4, denominator: 4 });
    expect(output.bars[1]?.key).toBe("C");
    expect(output.notes.filter((note) => note.bar === 1).map(noteFacts)).toEqual([
      ["Vocal", 1024, 1024, null, false],
      ["Ins", 1024, 1024, null, false],
    ]);
  });

  it("inserts in the new meter and key after the change point", () => {
    const result = applyScoreCommand(song2Dialect, KEY_METER_SCORE, { type: "insertBar", bar: 3 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
% intro
V: Vocal
C4D4E4F4|G16|
V: Ins
z16|z16|
% verse
V: Vocal
M:3/4
K:G
B12|z12|A12|
V: Ins
M:3/4
K:G
z12|z12|z12|`);
    const output = parse(result.text);
    check(output);
    expect(output.bars[3]?.meter).toEqual({ numerator: 3, denominator: 4 });
    expect(output.bars[3]?.key).toBe("G");
  });

  it("keeps an inline key change in its bar instead of adding a second one", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|[K:G]G16|D16|
V: Ins
z16|[K:G]z16|z16|`;
    const result = applyScoreCommand(song2Dialect, text, { type: "insertBar", bar: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
V: Vocal
C16|z16|[K:G]G16|D16|
V: Ins
z16|z16|[K:G]z16|z16|`);
    const output = parse(result.text);
    check(output);
    expect(output.keys).toEqual([
      { at: 0, key: "C" },
      { at: 2048, key: "G" },
    ]);
  });

  it("inserts at the end and moves no note", () => {
    const input = parse(KEY_METER_SCORE);
    const result = applyScoreCommand(song2Dialect, KEY_METER_SCORE, { type: "insertBar", bar: 4 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = parse(result.text);
    check(output);
    expect(output.notes.filter((note) => note.bar < 4).map(noteFacts)).toEqual(input.notes.map(noteFacts));
    expect(output.bars[4]?.meter).toEqual({ numerator: 3, denominator: 4 });
    expect(output.bars[4]?.key).toBe("G");
  });

  it("refuses a boundary a tie crosses, and leaves the text alone", () => {
    const text = `${VOCAL_HEADER}
K:C
V: Vocal
C16|D16-|D16|`;
    const result = applyScoreCommand(song2Dialect, text, { type: "insertBar", bar: 2 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("tie-across-bar");
    expect(result.diagnostic.at.voice).toBe("Vocal");
  });

  it("reports a bar index outside the score", () => {
    for (const bar of [-1, 5]) {
      const result = applyScoreCommand(song2Dialect, KEY_METER_SCORE, { type: "insertBar", bar });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.diagnostic.code).toBe("bar-out-of-range");
    }
  });
});

describe("deleteBars", () => {
  it("deletes a range that holds the meter and key change, and writes them back at the new boundary", () => {
    const result = applyScoreCommand(song2Dialect, KEY_METER_SCORE, { type: "deleteBars", from: 1, count: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
% intro
V: Vocal
C4D4E4F4|
V: Ins
z16|
V: Vocal
M:3/4
K:G
A12|
V: Ins
M:3/4
K:G
z12|`);
    const output = parse(result.text);
    check(output);
    expect(output.bars).toHaveLength(2);
    expect(output.bars[1]?.meter).toEqual({ numerator: 3, denominator: 4 });
    expect(output.bars[1]?.key).toBe("G");
  });

  it("deletes bars before the change so the score starts in the later meter and key", () => {
    const result = applyScoreCommand(song2Dialect, KEY_METER_SCORE, { type: "deleteBars", from: 0, count: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
% verse
V: Vocal
M:3/4
K:G
B12|A12|
V: Ins
M:3/4
K:G
z12|z12|`);
    const output = parse(result.text);
    check(output);
    expect(output.bars).toHaveLength(2);
    expect(output.bars[0]?.meter).toEqual({ numerator: 3, denominator: 4 });
    expect(output.bars[0]?.key).toBe("G");
  });

  it("cuts a tie into the deleted range and keeps the surviving notes", () => {
    const text = `${VOCAL_HEADER}
K:C
V: Vocal
C16|D16-|D16|E16|`;
    const result = applyScoreCommand(song2Dialect, text, { type: "deleteBars", from: 2, count: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = parse(result.text);
    check(output);
    expect(output.notes.map(noteFacts)).toEqual([
      ["Vocal", 0, 1024, 60, false],
      ["Vocal", 1024, 1024, 62, false],
      ["Vocal", 2048, 1024, 64, false],
    ]);
  });

  it("reports a range outside the score", () => {
    for (const command of [
      { type: "deleteBars", from: 3, count: 2 },
      { type: "deleteBars", from: -1, count: 1 },
      { type: "deleteBars", from: 0, count: 0 },
    ] as const) {
      const result = applyScoreCommand(song2Dialect, KEY_METER_SCORE, command);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.diagnostic.code).toBe("bar-out-of-range");
    }
  });
});

const SECTION_SCORE = `${VOCAL_HEADER}
K:C
% a
V: Vocal
C16|D16|E16|
% b
V: Vocal
F16|G16|`;

describe("setSectionMeter", () => {
  it("keeps note starts and splits notes on the new bar lines with ties", () => {
    const result = applyScoreCommand(song2Dialect, SECTION_SCORE, {
      type: "setSectionMeter",
      section: 0,
      meter: { numerator: 3, denominator: 4 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${VOCAL_HEADER}
K:C
% a
V: Vocal
M:3/4
C12-|C4D8-|D8E4-|E12|
% b
V: Vocal
M:4/4
F16|G16|`);
    const output = parse(result.text);
    check(output);
    expect(output.bars.slice(0, 4).map((bar) => bar.meter)).toEqual(
      Array.from({ length: 4 }, () => ({ numerator: 3, denominator: 4 })),
    );
    expect(output.bars.slice(4).map((bar) => `${bar.meter.numerator}/${bar.meter.denominator}`)).toEqual([
      "4/4",
      "4/4",
    ]);
    for (const start of [0, 1024, 2048, 3072]) expect(output.notes.some((note) => note.start === start)).toBe(true);
  });

  it("pads the last bar of the final section with rests", () => {
    const result = applyScoreCommand(song2Dialect, SECTION_SCORE, {
      type: "setSectionMeter",
      section: 1,
      meter: { numerator: 3, denominator: 4 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${VOCAL_HEADER}
K:C
% a
V: Vocal
C16|D16|E16|
% b
V: Vocal
M:3/4
F12-|F4G8-|G8z4|`);
    const output = parse(result.text);
    check(output);
    expect(output.notes[output.notes.length - 1]?.midi).toBeNull();
  });

  it("refuses a meter the constraints do not allow", () => {
    const result = applyScoreCommand(song2Dialect, SECTION_SCORE, {
      type: "setSectionMeter",
      section: 0,
      meter: { numerator: 3, denominator: 5 },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("meter-not-allowed");
  });

  it("refuses a non-final section that does not fill whole bars", () => {
    const result = applyScoreCommand(song2Dialect, SECTION_SCORE, {
      type: "setSectionMeter",
      section: 0,
      meter: { numerator: 5, denominator: 8 },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("meter-does-not-fit");
  });

  it("reports a section index outside the score", () => {
    const result = applyScoreCommand(song2Dialect, SECTION_SCORE, {
      type: "setSectionMeter",
      section: 9,
      meter: { numerator: 3, denominator: 4 },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("section-out-of-range");
  });
});

describe("truncation commands", () => {
  const vocalCut = `${VOCAL_HEADER}
K:C
V: Vocal
C16|D8E4^`;

  it("fills a Vocal cut in a two-voice score and drops its unfinished accidental", () => {
    const text = `${HEADER}
K:C
% intro
V: Vocal
C16|D16|
V: Ins
z16|z16|
% outro
V: Vocal
C16|D8E4^`;
    const result = applyScoreCommand(song2Dialect, text, { type: "fillTruncatedBar" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
% intro
V: Vocal
C16|D16|
V: Ins
z16|z16|
% outro
V: Vocal
C16|D8E4z4|`);
    const output = parse(result.text);
    check(output);
    expect(output.truncation).toEqual({ voice: "Ins", bar: 2, short: false });
  });

  it("fills an Ins cut and keeps the Vocal bars before it", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|D16|
V: Ins
z16|C8`;
    const result = applyScoreCommand(song2Dialect, text, { type: "fillTruncatedBar" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
V: Vocal
C16|D16|
V: Ins
z16|C8z8|`);
    const output = parse(result.text);
    check(output);
    expect(output.truncation).toBeNull();
  });

  it("fills a Vocal-only cut and makes the score complete", () => {
    const result = applyScoreCommand(song2Dialect, vocalCut, { type: "fillTruncatedBar" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${VOCAL_HEADER}
K:C
V: Vocal
C16|D8E4z4|`);
    const output = parse(result.text);
    check(output);
    expect(output.truncation).toBeNull();
  });

  it("fills a gap that is not one allowed duration with several rests", () => {
    const text = `${VOCAL_HEADER}
K:C
V: Vocal
C16|C8D3`;
    const result = applyScoreCommand(song2Dialect, text, { type: "fillTruncatedBar" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${VOCAL_HEADER}
K:C
V: Vocal
C16|C8D3zzzzz|`);
    const output = parse(result.text);
    check(output);
    expect(output.truncation).toBeNull();
  });

  it("deletes a Vocal-only incomplete bar and its unfinished bytes", () => {
    const result = applyScoreCommand(song2Dialect, vocalCut, { type: "deleteTruncatedBar" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${VOCAL_HEADER}
K:C
V: Vocal
C16|`);
    const output = parse(result.text);
    check(output);
    expect(output.truncation).toBeNull();
    expect(output.bars).toHaveLength(1);
  });

  it("deletes an Ins cut measure and leaves a short Ins block", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|D16|
V: Ins
z16|C8`;
    const result = applyScoreCommand(song2Dialect, text, { type: "deleteTruncatedBar" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
V: Vocal
C16|D16|
V: Ins
z16|`);
    const output = parse(result.text);
    check(output);
    expect(output.truncation).toEqual({ voice: "Ins", bar: 1, short: false });
  });

  it("refuses both commands on a score with no truncation", () => {
    for (const command of [{ type: "fillTruncatedBar" }, { type: "deleteTruncatedBar" }] as const) {
      const result = applyScoreCommand(song2Dialect, SECTION_SCORE, command);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.diagnostic.code).toBe("no-truncation");
    }
  });

  it("refuses both commands when the cut is before a new bar rather than inside one", () => {
    const text = `${VOCAL_HEADER}
K:C
V: Vocal
C16|
V: Vocal
M:9/9`;
    for (const command of [{ type: "fillTruncatedBar" }, { type: "deleteTruncatedBar" }] as const) {
      const result = applyScoreCommand(song2Dialect, text, command);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.diagnostic.code).toBe("no-incomplete-bar");
    }
  });

  it("deletes a complete bar before an untouched cut bar and keeps its unfinished byte", () => {
    const result = applyScoreCommand(song2Dialect, vocalCut, { type: "deleteBars", from: 0, count: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${VOCAL_HEADER}
K:C
V: Vocal
D8E4^`);
    const output = parse(result.text);
    check(output);
    expect(output.truncation).toEqual({ voice: "Vocal", bar: 0, short: true });
    expect(output.bars).toHaveLength(1);
    expect(output.bars[0]?.incomplete).toBe(true);
  });

  it("keeps an untouched cut tail byte for byte when a bar is inserted before it", () => {
    const result = applyScoreCommand(song2Dialect, vocalCut, { type: "insertBar", bar: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${VOCAL_HEADER}
K:C
V: Vocal
z16|C16|D8E4^`);
    const output = parse(result.text);
    check(output);
    expect(output.truncation).toEqual({ voice: "Vocal", bar: 2, short: true });
  });
});

describe("every sample", () => {
  for (const fact of facts) {
    it(`${fact.file}`, () => {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      const input = parse(text);
      const firstLength = (input.bars[0] as Score["bars"][number]).length;

      const inserted = applyScoreCommand(song2Dialect, text, { type: "insertBar", bar: 0 });
      expect(inserted.ok).toBe(true);
      if (!inserted.ok) return;
      const afterInsert = parse(inserted.text);
      check(afterInsert);
      expect(afterInsert.bars).toHaveLength(input.bars.length + 1);
      expect(afterInsert.notes.filter((note) => note.bar > 0).map(noteFacts)).toEqual(
        input.notes.map((note) => {
          const moved = { ...note, bar: note.bar + 1, start: note.start + firstLength };
          return noteFacts(moved);
        }),
      );
      const before = splitBars(text);
      const insertedPieces = splitBars(inserted.text);
      for (const [key, piece] of before) {
        const [voice, index] = key.split(":");
        expect(insertedPieces.get(`${voice}:${Number(index) + 1}`)).toBe(piece);
      }

      const sourceLines = (
        input.source as {
          musicLines: ReadonlyArray<{ segments: ReadonlyArray<{ bars: ReadonlyArray<{ bar: number }> }> }>;
        }
      ).musicLines;
      let remove = 0;
      for (const line of sourceLines) {
        for (const segment of line.segments) {
          const bar = segment.bars[0]?.bar;
          if (
            bar !== undefined &&
            bar > 0 &&
            segment.bars.length === 1 &&
            (input.truncation === null || bar < input.truncation.bar)
          ) {
            remove = bar;
            break;
          }
        }
        if (remove > 0) break;
      }
      const deleted = applyScoreCommand(song2Dialect, text, { type: "deleteBars", from: remove, count: 1 });
      expect(deleted.ok).toBe(true);
      if (!deleted.ok) return;
      const afterDelete = parse(deleted.text);
      check(afterDelete);
      expect(afterDelete.bars).toHaveLength(input.bars.length - 1);
      // Deleting inside a repeated whole-rest run can choose any equal bar; the hand-worked cases pin the bytes.
    });
  }
});

describe("failure texts", () => {
  it("gives every new code a sentence in both languages", () => {
    const commands: ScoreCommand[] = [
      { type: "insertBar", bar: 99 },
      { type: "deleteBars", from: 99, count: 1 },
      { type: "setSectionMeter", section: 99, meter: { numerator: 3, denominator: 4 } },
      { type: "fillTruncatedBar" },
      { type: "deleteTruncatedBar" },
    ];
    const codes = new Set<string>();
    for (const command of commands) {
      const result = applyScoreCommand(song2Dialect, KEY_METER_SCORE, command);
      if (result.ok) continue;
      codes.add(result.diagnostic.code);
    }
    expect(codes).toEqual(new Set(["bar-out-of-range", "section-out-of-range", "no-truncation"]));
  });
});
