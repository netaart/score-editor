// ABOUTME: Seam 1 for the section commands: delete, duplicate, move, rename and naming a section at a bar.
// ABOUTME: Hand-worked texts come from RULES.md S1-S9 and W7-W11; sample sweeps check every untouched bar and note.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { applyScoreCommand, type Score, type ScoreCommand, type Section } from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

interface SampleFact {
  file: string;
}

const directory = new URL("../packages/score-dialect-song2/tests/", import.meta.url);
const facts = JSON.parse(readFileSync(new URL("samples.json", directory), "utf8")) as SampleFact[];

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

const KEY_METER_SCORE = `${HEADER}
K:C
% intro
V: Vocal
C16|D16|
V: Ins
Z2|
% verse
V: Vocal
M:3/4
K:G
B12|A12|
V: Ins
M:3/4
K:G
z12|z12|
% outro
V: Vocal
M:4/4
K:C
E16|
V: Ins
M:4/4
K:C
z16|`;

const TIE_SCORE = `${HEADER}
K:C
% a
V: Vocal
C16|^F16-|
V: Ins
Z2|
% b
V: Vocal
F16|G16|
V: Ins
Z2|
% c
V: Vocal
A16|B16|
V: Ins
Z2|`;

const CUT_SCORE = `${HEADER}
K:C
% a
V: Vocal
C16|
V: Ins
Z|
% b
V: Vocal
D16|
V: Ins
z8^`;

function parse(text: string): Score {
  const { score, diagnostics } = song2Dialect.parse(text);
  expect(diagnostics).toEqual([]);
  if (score === null) throw new Error("the score did not read");
  return score;
}

function check(score: Score): void {
  expect(song2Dialect.check(score)).toEqual([]);
}

function apply(text: string, command: ScoreCommand): string {
  const result = applyScoreCommand(song2Dialect, text, command);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`the command was refused: ${result.diagnostic.code}`);
  return result.text;
}

function refuse(text: string, command: ScoreCommand, code: string): void {
  const result = applyScoreCommand(song2Dialect, text, command);
  expect(result.ok, code).toBe(false);
  if (!result.ok) expect(result.diagnostic.code).toBe(code);
}

function wholeRestCount(body: string): number {
  if (body === "Z") return 1;
  if (body.length === 2 && body[0] === "Z" && body[1] !== undefined && "234".includes(body[1])) {
    return Number(body[1]);
  }
  return 1;
}

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

function sectionEnd(section: Section): number {
  return section.firstBar + section.barCount;
}

function sectionLength(score: Score, section: Section): number {
  return score.bars.slice(section.firstBar, sectionEnd(section)).reduce((sum, bar) => sum + bar.length, 0);
}

function holdsCut(score: Score, section: Section): boolean {
  const truncation = score.truncation;
  if (truncation === null) return false;
  return (
    (truncation.bar >= section.firstBar && truncation.bar < sectionEnd(section)) ||
    (truncation.bar === sectionEnd(section) && sectionEnd(section) === score.bars.length)
  );
}

/** Old bars outside an operation keep their meter and their notes keep their MIDI at the shifted start. */
function keptFacts(
  before: Score,
  after: Score,
  oldBar: (bar: number) => number | undefined,
  shift: (bar: number) => number,
): void {
  for (const bar of before.bars) {
    const mapped = oldBar(bar.index);
    if (mapped === undefined) continue;
    expect(after.bars[mapped]?.meter, `bar ${bar.index} meter`).toEqual(bar.meter);
  }
  for (const note of before.notes) {
    const mapped = oldBar(note.bar);
    if (mapped === undefined) continue;
    const found = after.notes.find(
      (candidate) => candidate.voice === note.voice && candidate.start === note.start + shift(note.bar),
    );
    expect(found?.midi, `${note.id} MIDI`).toBe(note.midi);
    expect(found?.duration, `${note.id} duration`).toBe(note.duration);
  }
}

const DELETED_INTRO = `${HEADER}
K:C
% verse
V: Vocal
M:3/4
K:G
B12|A12|
V: Ins
M:3/4
K:G
z12|z12|
% outro
V: Vocal
M:4/4
K:C
E16|
V: Ins
M:4/4
K:C
z16|`;

const DELETED_VERSE = `${HEADER}
K:C
% intro
V: Vocal
C16|D16|
V: Ins
Z2|
% outro
V: Vocal
E16|
V: Ins
z16|`;

describe("deleteSection", () => {
  it("moves the next section's key and meter to the start of both voice blocks when the first section goes", () => {
    const output = apply(KEY_METER_SCORE, { type: "deleteSection", section: 0 });

    expect(output).toBe(DELETED_INTRO);
    const before = parse(KEY_METER_SCORE);
    const after = parse(output);
    check(after);
    keptFacts(
      before,
      after,
      (bar) => (bar < 2 ? undefined : bar - 2),
      (bar) => (bar < 2 ? 0 : -2048),
    );
    expect(after.sections.map((section) => [section.name, section.firstBar, section.barCount])).toEqual([
      ["verse", 0, 2],
      ["outro", 2, 1],
    ]);
  });

  it("deletes a middle section and joins the same key and meter without a redundant K: or M: line", () => {
    const output = apply(KEY_METER_SCORE, { type: "deleteSection", section: 1 });

    expect(output).toBe(DELETED_VERSE);
    const before = parse(KEY_METER_SCORE);
    const after = parse(output);
    check(after);
    keptFacts(
      before,
      after,
      (bar) => (bar < 2 ? bar : bar > 3 ? bar - 2 : undefined),
      (bar) => (bar > 3 ? -1536 : 0),
    );
    expect(after.keys).toEqual([{ at: 0, key: "C" }]);
    const beforePieces = splitBars(KEY_METER_SCORE);
    const afterPieces = splitBars(output);
    for (const [key, piece] of beforePieces) {
      const [voice, bar] = key.split(":");
      const at = Number(bar);
      if (at >= 2 && at <= 3) continue;
      expect(afterPieces.get(`${voice}:${at > 3 ? at - 2 : at}`), key).toBe(piece);
    }
  });

  it("deletes the last section, and the end of the score is the previous section", () => {
    const output = apply(KEY_METER_SCORE, { type: "deleteSection", section: 2 });

    const after = parse(output);
    check(after);
    expect(after.sections.map((section) => section.name)).toEqual(["intro", "verse"]);
    expect(after.bars).toHaveLength(4);
    expect(after.keys).toEqual([
      { at: 0, key: "C" },
      { at: 2048, key: "G" },
    ]);
  });

  it("deletes the unnamed section", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|
V: Ins
Z|
% verse
V: Vocal
D16|
V: Ins
z16|`;
    const output = apply(text, { type: "deleteSection", section: 0 });
    const after = parse(output);
    check(after);
    expect(after.sections).toEqual([{ name: "verse", firstBar: 0, barCount: 1 }]);
    expect(output.startsWith(`${HEADER}\nK:C\n% verse\n`)).toBe(true);
  });

  it("deletes the last section with a cut tail and leaves a complete score", () => {
    const output = apply(CUT_SCORE, { type: "deleteSection", section: 1 });

    expect(output).toBe(`${HEADER}
K:C
% a
V: Vocal
C16|
V: Ins
Z|`);
    const after = parse(output);
    check(after);
    expect(after.truncation).toBeNull();
  });

  it("keeps the cut for the last section when a section before it is deleted", () => {
    const output = apply(CUT_SCORE, { type: "deleteSection", section: 0 });
    const after = parse(output);
    check(after);
    expect(after.truncation).toEqual({ voice: "Ins", bar: 0, short: true });
    expect(output).toContain("z8^");
  });

  it("refuses an index outside the score and leaves the text unchanged", () => {
    refuse(KEY_METER_SCORE, { type: "deleteSection", section: 3 }, "section-out-of-range");
  });

  it("refuses to delete the only section because the score would have no bars", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|
V: Ins
Z|`;
    refuse(text, { type: "deleteSection", section: 0 }, "last-bar");
  });
});

it("writes the destination bar from the model when deleting the section that tied into it", () => {
  const text = `${VOCAL_HEADER}
K:C
% a
V: Vocal
C16|
% b
V: Vocal
^F16-|
% c
V: Vocal
F16|`;
  const output = apply(text, { type: "deleteSection", section: 1 });

  expect(output).toBe(`${VOCAL_HEADER}
K:C
% a
V: Vocal
C16|
% c
V: Vocal
^F16|`);
  const after = parse(output);
  check(after);
  expect(after.notes.map((note) => [note.start, note.midi, note.tie])).toEqual([
    [0, 60, false],
    [1024, 66, false],
  ]);
});

it("drops a short non-chord cut's hasChords after deleting the chord section", () => {
  const text = `${VOCAL_HEADER}
K:C
% a
V: Vocal
"C"C16|
% b
V: Vocal
D16|D8`;
  const output = apply(text, { type: "deleteSection", section: 0 });

  expect(output).toBe(`${VOCAL_HEADER}
K:C
% b
V: Vocal
D16|D8`);
  const after = parse(output);
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
  const output = apply(text, { type: "deleteSection", section: 0 });

  expect(output).toBe(`${VOCAL_HEADER}
K:C
% b
V: Vocal
D16|D8"G`);
  const after = parse(output);
  check(after);
  expect(after.hasChords).toBe(true);
  expect(after.truncation).toEqual({ voice: "Vocal", bar: 1, short: true, unfinishedChord: true });
});

const DUPLICATED_VERSE = `${HEADER}
K:C
% intro
V: Vocal
C16|D16|
V: Ins
Z2|
% verse
V: Vocal
M:3/4
K:G
B12|A12|
V: Ins
M:3/4
K:G
z12|z12|
% verse
V: Vocal
B12|A12|
V: Ins
z12|z12|
% outro
V: Vocal
M:4/4
K:C
E16|
V: Ins
M:4/4
K:C
z16|`;

describe("duplicateSection", () => {
  it("puts the copy directly after the original and keeps the same name", () => {
    const output = apply(KEY_METER_SCORE, { type: "duplicateSection", section: 1 });

    expect(output).toBe(DUPLICATED_VERSE);
    const before = parse(KEY_METER_SCORE);
    const after = parse(output);
    check(after);
    expect(after.sections.map((section) => [section.name, section.firstBar, section.barCount])).toEqual([
      ["intro", 0, 2],
      ["verse", 2, 2],
      ["verse", 4, 2],
      ["outro", 6, 1],
    ]);
    keptFacts(
      before,
      after,
      (bar) => (bar < 4 ? bar : bar + 2),
      (bar) => (bar >= 4 ? 1536 : 0),
    );
    const beforePieces = splitBars(KEY_METER_SCORE);
    const afterPieces = splitBars(output);
    for (const [key, piece] of beforePieces) {
      const [voice, bar] = key.split(":");
      const at = Number(bar);
      if (at >= 2 && at <= 3) continue;
      expect(afterPieces.get(`${voice}:${at >= 4 ? at + 2 : at}`), key).toBe(piece);
    }
  });

  it("clears the original's outgoing tie at the new copy boundary but keeps the copy's tie into the next section", () => {
    const text = `${VOCAL_HEADER}
K:C
% a
V: Vocal
^F16-|
% b
V: Vocal
F16|`;
    const output = apply(text, { type: "duplicateSection", section: 0 });

    expect(output).toBe(`${VOCAL_HEADER}
K:C
% a
V: Vocal
^F16|
% a
V: Vocal
^F16-|
% b
V: Vocal
F16|`);
    const after = parse(output);
    check(after);
    expect(
      after.notes.filter((note) => note.voice === "Vocal").map((note) => [note.start, note.midi, note.tie]),
    ).toEqual([
      [0, 66, false],
      [1024, 66, true],
      [2048, 66, false],
    ]);
  });

  it("refuses the unnamed section and leaves the text unchanged", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|
V: Ins
Z|
% verse
V: Vocal
D16|
V: Ins
z16|`;
    refuse(text, { type: "duplicateSection", section: 0 }, "section-unnamed");
  });

  it("refuses a section that holds the cut tail", () => {
    refuse(CUT_SCORE, { type: "duplicateSection", section: 1 }, "truncated-tail");
  });

  it("refuses an index outside the score", () => {
    refuse(KEY_METER_SCORE, { type: "duplicateSection", section: 3 }, "section-out-of-range");
  });
});

const OUTRO_FIRST = `${HEADER}
K:C
% intro
V: Vocal
C16|D16|
V: Ins
Z2|
% outro
V: Vocal
E16|
V: Ins
z16|
% verse
V: Vocal
M:3/4
K:G
B12|A12|
V: Ins
M:3/4
K:G
z12|z12|`;

const TIE_BROKEN = `${HEADER}
K:C
% a
V: Vocal
C16|^F16|
V: Ins
Z2|
% c
V: Vocal
A16|B16|
V: Ins
Z2|
% b
V: Vocal
^F16|G16|
V: Ins
Z2|`;

describe("moveSection", () => {
  it("moves a section one place earlier and states the key and meter that change at the new boundary", () => {
    const output = apply(KEY_METER_SCORE, { type: "moveSection", section: 2, direction: "earlier" });

    expect(output).toBe(OUTRO_FIRST);
    const before = parse(KEY_METER_SCORE);
    const after = parse(output);
    check(after);
    expect(after.sections.map((section) => section.name)).toEqual(["intro", "outro", "verse"]);
    for (const bar of before.bars) {
      if (bar.index < 2) expect(after.bars[bar.index]?.meter).toEqual(bar.meter);
    }
  });

  it("breaks the tie at a newly formed boundary and writes the accidental the first note now needs", () => {
    const output = apply(TIE_SCORE, { type: "moveSection", section: 1, direction: "later" });

    expect(output).toBe(TIE_BROKEN);
    const after = parse(output);
    check(after);
    const vocal = after.notes.filter((note) => note.voice === "Vocal").sort((a, b) => a.start - b.start);
    expect(vocal.map((note) => [note.start, note.midi, note.tie])).toEqual([
      [0, 60, false],
      [1024, 66, false],
      [2048, 69, false],
      [3072, 71, false],
      [4096, 66, false],
      [5120, 67, false],
    ]);
  });

  it("writes the destination bar when its incoming tie goes away but its position stays", () => {
    const text = `${VOCAL_HEADER}
K:C
% a
V: Vocal
C16|
% b
V: Vocal
^F16-|
% c
V: Vocal
F16|`;
    const output = apply(text, { type: "moveSection", section: 1, direction: "earlier" });

    expect(output).toBe(`${VOCAL_HEADER}
K:C
% b
V: Vocal
^F16|
% a
V: Vocal
C16|
% c
V: Vocal
^F16|`);
    const after = parse(output);
    check(after);
    expect(
      after.notes.filter((note) => note.voice === "Vocal").map((note) => [note.start, note.midi, note.tie]),
    ).toEqual([
      [0, 66, false],
      [1024, 60, false],
      [2048, 66, false],
    ]);
  });

  it("states a key at a boundary whose old section did not need one", () => {
    const text = `${HEADER}
K:C
% a
V: Vocal
C16|
V: Ins
Z|
% b
V: Vocal
K:G
G16|
V: Ins
K:G
z16|
% c
V: Vocal
G16|
V: Ins
z16|`;
    const output = apply(text, { type: "moveSection", section: 1, direction: "later" });

    expect(output).toBe(`${HEADER}
K:C
% a
V: Vocal
C16|
V: Ins
Z|
% c
V: Vocal
K:G
G16|
V: Ins
K:G
z16|
% b
V: Vocal
G16|
V: Ins
z16|`);
    const after = parse(output);
    check(after);
    expect(after.keys).toEqual([
      { at: 0, key: "C" },
      { at: 1024, key: "G" },
    ]);
  });

  it("moves a section one place later", () => {
    const output = apply(KEY_METER_SCORE, { type: "moveSection", section: 0, direction: "later" });
    const after = parse(output);
    check(after);
    expect(after.sections.map((section) => section.name)).toEqual(["verse", "intro", "outro"]);
  });

  it("refuses the first section moving earlier and the last moving later", () => {
    refuse(KEY_METER_SCORE, { type: "moveSection", section: 0, direction: "earlier" }, "section-move-start");
    refuse(KEY_METER_SCORE, { type: "moveSection", section: 2, direction: "later" }, "section-move-end");
  });

  it("refuses the unnamed section and a named section moving before it", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|
V: Ins
Z|
% verse
V: Vocal
D16|
V: Ins
z16|`;
    refuse(text, { type: "moveSection", section: 0, direction: "later" }, "section-unnamed");
    refuse(text, { type: "moveSection", section: 1, direction: "earlier" }, "section-before-unnamed");
  });

  it("refuses a move that would touch the cut tail", () => {
    refuse(CUT_SCORE, { type: "moveSection", section: 1, direction: "earlier" }, "truncated-tail");
  });
});

const RENAMED_VERSE = `${HEADER}
K:C
% intro
V: Vocal
C16|D16|
V: Ins
Z2|
% chorus
V: Vocal
M:3/4
K:G
B12|A12|
V: Ins
M:3/4
K:G
z12|z12|
% outro
V: Vocal
M:4/4
K:C
E16|
V: Ins
M:4/4
K:C
z16|`;

describe("renameSection and nameSection", () => {
  it("renames an existing section and changes no music", () => {
    const output = apply(KEY_METER_SCORE, { type: "renameSection", section: 1, name: "chorus" });
    expect(output).toBe(RENAMED_VERSE);
    const before = parse(KEY_METER_SCORE);
    const after = parse(output);
    check(after);
    expect(after.bars).toEqual(before.bars);
    expect(after.notes).toEqual(before.notes);
  });

  it("names the unnamed section by putting a marker at bar 0", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|D16|
V: Ins
Z2|`;
    const output = apply(text, { type: "renameSection", section: 0, name: "intro" });
    expect(output).toBe(`${HEADER}
K:C
% intro
V: Vocal
C16|D16|
V: Ins
Z2|`);
    check(parse(output));
  });

  it("names a bar at a group start and at a bar inside a group", () => {
    const oneGroup = `${HEADER}
K:C
V: Vocal
C16|D16|E16|F16|
V: Ins
Z4|`;
    const atStart = apply(oneGroup, { type: "nameSection", bar: 0, name: "intro" });
    expect(atStart).toBe(`${HEADER}
K:C
% intro
V: Vocal
C16|D16|E16|F16|
V: Ins
Z4|`);

    const inside = apply(oneGroup, { type: "nameSection", bar: 2, name: "bridge" });
    expect(inside).toBe(`${HEADER}
K:C
V: Vocal
C16|D16|
V: Ins
Z2|
% bridge
V: Vocal
E16|F16|
V: Ins
Z2|`);
    const after = parse(inside);
    check(after);
    expect(after.sections.map((section) => [section.name, section.firstBar, section.barCount])).toEqual([
      [null, 0, 2],
      ["bridge", 2, 2],
    ]);
  });

  it("renames instead of adding a second marker when the bar already starts a named section", () => {
    const output = apply(KEY_METER_SCORE, { type: "nameSection", bar: 2, name: "chorus" });
    expect(output).toBe(RENAMED_VERSE);
  });

  it("refuses empty, blank, line-break and trailing-space names with their own codes", () => {
    refuse(KEY_METER_SCORE, { type: "renameSection", section: 1, name: "" }, "section-name-empty");
    refuse(KEY_METER_SCORE, { type: "renameSection", section: 1, name: "   " }, "section-name-blank");
    refuse(KEY_METER_SCORE, { type: "renameSection", section: 1, name: "a\nb" }, "section-name-line-break");
    refuse(KEY_METER_SCORE, { type: "renameSection", section: 1, name: "verse " }, "section-name-trailing-space");
    refuse(KEY_METER_SCORE, { type: "nameSection", bar: 2, name: "" }, "section-name-empty");
  });

  it("refuses a bar outside the score for naming", () => {
    refuse(KEY_METER_SCORE, { type: "nameSection", bar: 5, name: "outro" }, "bar-out-of-range");
  });

  it("refuses a section index outside the score for renaming", () => {
    refuse(KEY_METER_SCORE, { type: "renameSection", section: 3, name: "x" }, "section-out-of-range");
  });
});

describe("section commands on every sample", () => {
  for (const fact of facts) {
    const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
    const before = parse(text);

    it(`${fact.file}: delete every section that leaves a score`, () => {
      for (let index = 0; index < before.sections.length; index += 1) {
        const section = before.sections[index] as Section;
        const result = applyScoreCommand(song2Dialect, text, { type: "deleteSection", section: index });
        expect(result.ok, `delete ${section.name ?? "unnamed"}`).toBe(true);
        if (!result.ok) continue;
        const after = parse(result.text);
        check(after);
        const count = section.barCount;
        const length = sectionLength(before, section);
        keptFacts(
          before,
          after,
          (bar) => (bar < section.firstBar ? bar : bar >= sectionEnd(section) ? bar - count : undefined),
          (bar) => (bar >= sectionEnd(section) ? -length : 0),
        );
      }
    });

    it(`${fact.file}: duplicate every named section without a cut`, () => {
      for (let index = 0; index < before.sections.length; index += 1) {
        const section = before.sections[index] as Section;
        if (section.name === null) {
          refuse(text, { type: "duplicateSection", section: index }, "section-unnamed");
          continue;
        }
        const hasCut = holdsCut(before, section);
        const result = applyScoreCommand(song2Dialect, text, { type: "duplicateSection", section: index });
        if (hasCut) {
          expect(result.ok, `duplicate ${section.name} with a cut`).toBe(false);
          continue;
        }
        expect(result.ok, `duplicate ${section.name}`).toBe(true);
        if (!result.ok) continue;
        const after = parse(result.text);
        check(after);
        const length = sectionLength(before, section);
        keptFacts(
          before,
          after,
          (bar) => (bar < sectionEnd(section) ? bar : bar + section.barCount),
          (bar) => (bar >= sectionEnd(section) ? length : 0),
        );
      }
    });

    it(`${fact.file}: move every section earlier and later`, () => {
      for (let index = 0; index < before.sections.length; index += 1) {
        const section = before.sections[index] as Section;
        for (const direction of ["earlier", "later"] as const) {
          const result = applyScoreCommand(song2Dialect, text, { type: "moveSection", section: index, direction });
          const neighbour = direction === "earlier" ? index - 1 : index + 1;
          const other = before.sections[neighbour];
          const hasCut = holdsCut(before, section) || (other !== undefined && holdsCut(before, other));
          if (section.name === null) {
            refuse(text, { type: "moveSection", section: index, direction }, "section-unnamed");
          } else if (neighbour < 0) {
            refuse(text, { type: "moveSection", section: index, direction }, "section-move-start");
          } else if (neighbour >= before.sections.length) {
            refuse(text, { type: "moveSection", section: index, direction }, "section-move-end");
          } else if ((before.sections[neighbour] as Section).name === null) {
            refuse(text, { type: "moveSection", section: index, direction }, "section-before-unnamed");
          } else if (hasCut) {
            expect(result.ok, `move ${section.name} ${direction} with a cut`).toBe(false);
          } else {
            expect(result.ok, `move ${section.name} ${direction}`).toBe(true);
            if (!result.ok) continue;
            const after = parse(result.text);
            check(after);
            const neighbourSection = other as Section;
            const involved = (bar: number) =>
              (bar >= section.firstBar && bar < sectionEnd(section)) ||
              (bar >= neighbourSection.firstBar && bar < sectionEnd(neighbourSection));
            const involvedStart = Math.min(section.firstBar, neighbourSection.firstBar);
            const involvedEnd = Math.max(sectionEnd(section), sectionEnd(neighbourSection));
            const outgoingTie =
              involvedStart > 0 && before.notes.some((note) => note.bar === involvedStart - 1 && note.tie);
            const incomingTie = before.notes.some(
              (note) =>
                note.bar === involvedEnd &&
                before.notes.some(
                  (previous) =>
                    previous.voice === note.voice && previous.tie && previous.start + previous.duration === note.start,
                ),
            );
            const boundaryBar = (bar: number) =>
              (outgoingTie && bar === involvedStart - 1) || (incomingTie && bar === involvedEnd);
            const beforePieces = splitBars(text);
            const afterPieces = splitBars(result.text);
            for (const [key, piece] of beforePieces) {
              const at = Number(key.split(":")[1]);
              if (involved(at) || boundaryBar(at)) continue;
              expect(afterPieces.get(key), `${fact.file} move ${section.name} ${direction} ${key}`).toBe(piece);
            }
            for (const note of before.notes) {
              if (involved(note.bar)) continue;
              const found = after.notes.find(
                (candidate) => candidate.voice === note.voice && candidate.start === note.start,
              );
              expect(found?.midi, `${fact.file} move ${section.name} ${direction} ${note.id}`).toBe(note.midi);
            }
            expect(after.sections[index]?.name).toBe(neighbourSection.name);
            expect(after.sections[neighbour]?.name).toBe(section.name);
          }
        }
      }
    });

    it(`${fact.file}: rename every section`, () => {
      for (let index = 0; index < before.sections.length; index += 1) {
        const output = apply(text, { type: "renameSection", section: index, name: `renamed-${index}` });
        const after = parse(output);
        check(after);
        expect(after.sections[index]?.name).toBe(`renamed-${index}`);
        expect(after.bars).toEqual(before.bars);
        expect(after.notes).toEqual(before.notes);
      }
    });
  }
});
