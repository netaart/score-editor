// ABOUTME: Seam 1 for the bar, meter and truncation commands: every sample plus hand-worked texts from RULES.md.
// ABOUTME: Untouched bars are compared as raw music-line pieces, and the cut-tail bytes of an untouched tail stay verbatim.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  applyProjectCommand,
  applyScoreCommand,
  formatDiagnostic,
  type Note,
  type Score,
  type SongProject,
} from "@neta-art/score-editor";
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
C16|D8E4z4|
V: Ins
z16|z16|`);
    const output = parse(result.text);
    check(output);
    expect(output.truncation).toBeNull();
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
    const output = parse(result.text);
    check(output);
    expect(output.truncation).toBeNull();
    const filled = output.notes.filter((note) => note.bar === 1);
    expect(filled.map((note) => [note.start, note.duration, note.midi])).toEqual([
      [1024, 512, 60],
      [1536, 192, 62],
      [1728, 64, null],
      [1792, 64, null],
      [1856, 64, null],
      [1920, 64, null],
      [1984, 64, null],
    ]);
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

  it("refuses to delete an Ins cut that sits inside a complete Vocal measure", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|D16|
V: Ins
z16|C8`;
    const result = applyScoreCommand(song2Dialect, text, { type: "deleteTruncatedBar" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("cut-in-complete-bar");
    expect(result.diagnostic.at.bar).toBe(2);
    const project: SongProject = {
      style: "",
      lyrics: "",
      score: text,
      scoreMode: "full",
      seed: null,
      modelId: "song2",
      sourceKey: "review",
    };
    const refused = applyProjectCommand(song2Dialect, project, { type: "deleteTruncatedBar" });
    expect(refused.project).toBe(project);
    expect(refused.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["cut-in-complete-bar"]);
  });

  it("cuts a tie into the deleted incomplete measure", () => {
    const text = `${VOCAL_HEADER}
K:C
V: Vocal
C16-|C8^`;
    const result = applyScoreCommand(song2Dialect, text, { type: "deleteTruncatedBar" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${VOCAL_HEADER}
K:C
V: Vocal
C16|`);
    const output = parse(result.text);
    check(output);
    expect(output.notes[0]?.tie).toBe(false);
    expect(output.truncation).toBeNull();
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
      const pieces = splitBars(text);
      const firstLength = (input.bars[0] as Score["bars"][number]).length;

      const inserted = applyScoreCommand(song2Dialect, text, { type: "insertBar", bar: 0 });
      expect(inserted.ok).toBe(true);
      if (!inserted.ok) return;
      const afterInsert = parse(inserted.text);
      check(afterInsert);
      expect(afterInsert.bars).toHaveLength(input.bars.length + 1);
      for (const note of input.notes) {
        const moved = { ...note, bar: note.bar + 1, start: note.start + firstLength };
        expect(afterInsert.notes.find((candidate) => candidate.id === `${moved.voice}:${moved.start}`)).toMatchObject({
          voice: moved.voice,
          bar: moved.bar,
          start: moved.start,
          duration: moved.duration,
          midi: moved.midi,
          tie: moved.tie,
        });
      }
      const insertedPieces = splitBars(inserted.text);
      for (const [key, piece] of pieces) {
        const [voice, index] = key.split(":");
        expect(insertedPieces.get(`${voice}:${Number(index) + 1}`)).toBe(piece);
      }

      const barKey = (bar: number) =>
        JSON.stringify(
          input.voices.map((voice) => {
            const start = (input.bars[bar] as Score["bars"][number]).start;
            return input.notes
              .filter((note) => note.voice === voice && note.bar === bar)
              .map((note) => [note.start - start, note.duration, note.midi, note.tie]);
          }),
        );
      const counts = new Map<string, number>();
      for (let index = 0; index < input.bars.length; index += 1) {
        const key = barKey(index);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      let remove = -1;
      for (let index = 1; index < input.bars.length; index += 1) {
        if (input.truncation !== null && index >= input.truncation.bar) break;
        const vocalPiece = pieces.get(`Vocal:${index}`) ?? "";
        const insPiece = pieces.get(`Ins:${index}`) ?? "";
        if (/^Z[234]?$/.test(vocalPiece.trim()) || /^Z[234]?$/.test(insPiece.trim())) continue;
        if ((counts.get(barKey(index)) ?? 0) === 1) {
          remove = index;
          break;
        }
      }
      expect(remove).toBeGreaterThan(0);
      const removedLength = (input.bars[remove] as Score["bars"][number]).length;
      const deleted = applyScoreCommand(song2Dialect, text, { type: "deleteBars", from: remove, count: 1 });
      expect(deleted.ok).toBe(true);
      if (!deleted.ok) return;
      const afterDelete = parse(deleted.text);
      check(afterDelete);
      expect(afterDelete.bars).toHaveLength(input.bars.length - 1);
      const deletedPieces = splitBars(deleted.text);
      const localFacts = (score: Score, voice: string, bar: number) => {
        const start = score.bars[bar]?.start ?? 0;
        return score.notes
          .filter((note) => note.voice === voice && note.bar === bar)
          .map((note) => [note.start - start, note.duration, note.midi, note.tie]);
      };
      for (const [key, piece] of pieces) {
        const [voice, index] = key.split(":");
        const at = Number(index);
        if (at === remove) continue;
        const mapped = at > remove ? at - 1 : at;
        if (
          JSON.stringify(localFacts(input, voice ?? "", at)) !==
          JSON.stringify(localFacts(afterDelete, voice ?? "", mapped))
        ) {
          continue;
        }
        expect(deletedPieces.get(`${voice}:${mapped}`)).toBe(piece);
      }
      for (const note of input.notes) {
        if (note.bar === remove) continue;
        const movedStart = note.bar > remove ? note.start - removedLength : note.start;
        const movedBar = note.bar > remove ? note.bar - 1 : note.bar;
        expect(
          afterDelete.notes.find(
            (candidate) =>
              candidate.voice === note.voice &&
              candidate.start === movedStart &&
              candidate.duration === note.duration &&
              candidate.bar === movedBar,
          )?.midi,
        ).toBe(note.midi);
      }

      const section = input.sections[0] as Score["sections"][number];
      const changed = applyScoreCommand(song2Dialect, text, {
        type: "setSectionMeter",
        section: 0,
        meter: { numerator: 2, denominator: 4 },
      });
      expect(changed.ok).toBe(true);
      if (!changed.ok) return;
      const afterMeter = parse(changed.text);
      check(afterMeter);
      const delta = afterMeter.bars.length - input.bars.length;
      expect(afterMeter.truncation).toEqual(
        input.truncation === null ? null : { ...input.truncation, bar: input.truncation.bar + delta },
      );
      const lastSectionBar = section.firstBar + section.barCount - 1;
      for (const [key, piece] of pieces) {
        const [voice, index] = key.split(":");
        const at = Number(index);
        if (at <= lastSectionBar) continue;
        expect(splitBars(changed.text).get(`${voice}:${at + delta}`)).toBe(piece);
      }
      for (const note of input.notes) {
        if (note.bar <= lastSectionBar) continue;
        expect(
          afterMeter.notes.find(
            (candidate) =>
              candidate.voice === note.voice && candidate.start === note.start && candidate.bar === note.bar + delta,
          )?.midi,
        ).toBe(note.midi);
      }

      if (input.truncation !== null) {
        const filled = applyScoreCommand(song2Dialect, text, { type: "fillTruncatedBar" });
        expect(filled.ok).toBe(true);
        if (filled.ok) {
          const afterFill = parse(filled.text);
          check(afterFill);
          expect(afterFill.truncation).toBeNull();
          for (const note of input.notes) {
            expect(
              afterFill.notes.find(
                (candidate) =>
                  candidate.voice === note.voice && candidate.start === note.start && candidate.midi === note.midi,
              ),
            ).toBeDefined();
          }
        }

        const deletedCut = applyScoreCommand(song2Dialect, text, { type: "deleteTruncatedBar" });
        if (deletedCut.ok) {
          const afterCutDelete = parse(deletedCut.text);
          check(afterCutDelete);
          expect(afterCutDelete.truncation).toBeNull();
        } else {
          expect(deletedCut.diagnostic.code).toBe("cut-in-complete-bar");
        }

        const cutNote = input.notes.find(
          (note) => note.voice === input.truncation?.voice && note.bar === input.truncation?.bar && note.midi !== null,
        );
        if (cutNote !== undefined) {
          const rested = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: cutNote.id });
          expect(rested.ok).toBe(true);
          if (rested.ok) expect(parse(rested.text).truncation).toEqual(input.truncation);
        }
      }
    });
  }
});

describe("review fixes", () => {
  it("rewrites a bar from the model when deleting the bar that tied into it", () => {
    const text = `${VOCAL_HEADER}
K:C
V: Vocal
C16|^F16-|F16|`;
    const result = applyScoreCommand(song2Dialect, text, { type: "deleteBars", from: 1, count: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${VOCAL_HEADER}
K:C
V: Vocal
C16|^F16|`);
    const after = parse(result.text);
    check(after);
    expect(after.notes.map((note) => [note.start, note.midi, note.tie])).toEqual([
      [0, 60, false],
      [1024, 66, false],
    ]);
  });

  it("drops a short non-chord cut's hasChords after deleting the chord bar", () => {
    const text = `${VOCAL_HEADER}
K:C
% a
V: Vocal
"C"C16|
% b
V: Vocal
D16|D8`;
    const result = applyScoreCommand(song2Dialect, text, { type: "deleteBars", from: 0, count: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${VOCAL_HEADER}
K:C
% b
V: Vocal
D16|D8`);
    const after = parse(result.text);
    check(after);
    expect(after.hasChords).toBe(false);
    expect(after.truncation).toEqual({ voice: "Vocal", bar: 1, short: true });
  });

  it("keeps hasChords and the tail bytes when the surviving cut is an unfinished chord string", () => {
    const text = `${VOCAL_HEADER}
K:C
% a
V: Vocal
"C"C16|
% b
V: Vocal
D16|D8"G`;
    const result = applyScoreCommand(song2Dialect, text, { type: "deleteBars", from: 0, count: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${VOCAL_HEADER}
K:C
% b
V: Vocal
D16|D8"G`);
    const after = parse(result.text);
    check(after);
    expect(after.hasChords).toBe(true);
    expect(after.truncation).toEqual({ voice: "Vocal", bar: 1, short: true, unfinishedChord: true });
  });
});

describe("review reproduction cases", () => {
  it("inserts a rest in 5/8 by splitting it into writable values", () => {
    const text = `X:1
T:
M:5/8
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
V: Vocal
C8D2|`;
    const result = applyScoreCommand(song2Dialect, text, { type: "insertBar", bar: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = parse(result.text);
    check(output);
    const inserted = output.notes.filter((note) => note.bar === 0);
    expect(inserted.length).toBeGreaterThan(0);
    expect(inserted.every((note) => note.midi === null)).toBe(true);
    expect(inserted.reduce((sum, note) => sum + note.duration, 0)).toBe(640);
  });

  it("splits a note crossing a new 3/4 bar line into writable tied pieces", () => {
    const text = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
V: Vocal
C2D3E8F3|`;
    const result = applyScoreCommand(song2Dialect, text, {
      type: "setSectionMeter",
      section: 0,
      meter: { numerator: 3, denominator: 4 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = parse(result.text);
    check(output);
    const allowed = new Set([1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48].map((units) => units * 64));
    expect(output.notes.every((note) => allowed.has(note.duration))).toBe(true);
  });

  it("removes the last section and its marker when its only bar is the cut", () => {
    const text = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
% a
V: Vocal
C16|
% b
V: Vocal
D8^`;
    const result = applyScoreCommand(song2Dialect, text, { type: "deleteTruncatedBar" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
% a
V: Vocal
C16|`);
    const output = parse(result.text);
    check(output);
    expect(output.truncation).toBeNull();
  });

  it("keeps a rewritten partial measure's X4 remainder when a bar before it is deleted", () => {
    const text = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
V: Vocal
C16|C8-"G`;
    const result = applyScoreCommand(song2Dialect, text, { type: "deleteBars", from: 0, count: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
V: Vocal
C8"G`);
    const output = parse(result.text);
    check(output);
    expect(output.truncation).toEqual({ voice: "Vocal", bar: 0, short: true, unfinishedChord: true });
    expect(output.hasChords).toBe(true);
  });

  it("refuses to delete every bar with last-bar", () => {
    const result = applyScoreCommand(song2Dialect, KEY_METER_SCORE, {
      type: "deleteBars",
      from: 0,
      count: parse(KEY_METER_SCORE).bars.length,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("last-bar");
  });
});

describe("failure branches", () => {
  const cutSample = `${HEADER}
K:C
V: Vocal
C16|D16|
V: Ins
z16|C8`;

  it("refuses insert, delete and meter change at the cut with truncated-tail", () => {
    const inserted = applyScoreCommand(song2Dialect, cutSample, { type: "insertBar", bar: 2 });
    expect(inserted.ok).toBe(false);
    if (!inserted.ok) expect(inserted.diagnostic.code).toBe("truncated-tail");

    const deleted = applyScoreCommand(song2Dialect, cutSample, { type: "deleteBars", from: 1, count: 1 });
    expect(deleted.ok).toBe(false);
    if (!deleted.ok) expect(deleted.diagnostic.code).toBe("truncated-tail");

    const metered = applyScoreCommand(song2Dialect, cutSample, {
      type: "setSectionMeter",
      section: 0,
      meter: { numerator: 2, denominator: 4 },
    });
    expect(metered.ok).toBe(false);
    if (!metered.ok) expect(metered.diagnostic.code).toBe("truncated-tail");
  });

  it("refuses to delete the only bar with last-bar", () => {
    const text = `${VOCAL_HEADER}
K:C
V: Vocal
C8^`;
    const result = applyScoreCommand(song2Dialect, text, { type: "deleteTruncatedBar" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.code).toBe("last-bar");
  });

  it("refuses a final section with a trailing cut when its length does not fill the new meter", () => {
    const text = `${VOCAL_HEADER}
K:C
% a
V: Vocal
C16|D16|
% outro`;
    const result = applyScoreCommand(song2Dialect, text, {
      type: "setSectionMeter",
      section: 0,
      meter: { numerator: 3, denominator: 4 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.code).toBe("meter-does-not-fit");
  });

  it("turns a writer throw into write-mismatch", () => {
    const throwing = {
      ...song2Dialect,
      serialize() {
        throw new Error("writer refused");
      },
    };
    const note = parse(SECTION_SCORE).notes.find((candidate) => candidate.midi !== null);
    if (note === undefined) throw new Error("the test score has no note");
    const result = applyScoreCommand(throwing, SECTION_SCORE, { type: "toRest", noteId: note.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.code).toBe("write-mismatch");
  });
});

describe("failure texts", () => {
  it("gives every new code a sentence in both languages", () => {
    const codes = [
      "bar-out-of-range",
      "section-out-of-range",
      "meter-not-allowed",
      "no-truncation",
      "no-incomplete-bar",
      "tie-across-bar",
      "truncated-tail",
      "meter-does-not-fit",
      "last-bar",
      "cut-in-complete-bar",
    ] as const;
    for (const code of codes) {
      for (const language of ["zh", "en"] as const) {
        expect(formatDiagnostic({ code, params: {}, at: {} }, language).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("setSectionMeter reaches a voice that stops early", () => {
  it("refuses a section that reaches the cut bar of a short Ins", () => {
    const text = `${HEADER}
K:C
% a
V: Vocal
C16|D16|E16|F16|
V: Ins
Z4|
V: Vocal
E16|F16`;
    const result = applyScoreCommand(song2Dialect, text, {
      type: "setSectionMeter",
      section: 0,
      meter: { numerator: 3, denominator: 4 },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("truncated-tail");
  });

  it("refuses the whole-score meter change when Ins ends at bar 8", () => {
    const text = `${HEADER}
K:C
% a
V: Vocal
C16|D16|E16|F16|
V: Ins
Z4|
V: Vocal
E16|F16|G16|A16|
V: Ins
Z4|
V: Vocal
B16|c16|d16|e16`;
    const result = applyScoreCommand(song2Dialect, text, {
      type: "setSectionMeter",
      section: 0,
      meter: { numerator: 2, denominator: 4 },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("truncated-tail");
  });

  it("changes a section that ends before the short voice does", () => {
    const text = `${HEADER}
K:C
% a
V: Vocal
C16|D16|
V: Ins
Z2|
% b
V: Vocal
E16|F16|G16|A16`;
    const result = applyScoreCommand(song2Dialect, text, {
      type: "setSectionMeter",
      section: 0,
      meter: { numerator: 2, denominator: 4 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const score = parse(result.text);
    check(score);
    expect(score.truncation).toEqual({ voice: "Vocal", bar: 8, short: false });
    expect(score.bars).toHaveLength(8);
    expect(score.bars.slice(0, 4).map((bar) => bar.meter)).toEqual(
      Array.from({ length: 4 }, () => ({ numerator: 2, denominator: 4 })),
    );
  });
});
