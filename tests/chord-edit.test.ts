// ABOUTME: Seam 1 for editing chords below the UI: the session's constraints, the places a chord can go, and the names the picker offers.
// ABOUTME: Expected positions and names are worked out by hand from the bar grid and RULES.md C1 to C3, never from the code under test.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  chordSlots,
  createDialectRegistry,
  createEditingSession,
  type EditingSession,
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

const dialects = createDialectRegistry([song2Dialect]);

const project: SongProject = {
  style: "",
  lyrics: "",
  score: "",
  scoreMode: "full",
  seed: null,
  modelId: "song2",
  sourceKey: "chord-edit-test",
};

/** Vocal: bar 1 is C D E F as quarter notes, bar 2 is a half rest then a half note. Ins: bar 1 is eight eighth notes. */
const TWO_VOICES = `${HEADER}
K:C
V: Vocal
C4D4E4F4|z8G8|
V: Ins
C2D2E2F2G2A2B2c2|C16|`;

function open(overrides: Partial<SongProject> = {}): EditingSession {
  return createEditingSession({ project: { ...project, score: TWO_VOICES, ...overrides }, dialects });
}

describe("the session's constraints", () => {
  it("are those of the dialect that reads the project's model", () => {
    const constraints = open().constraints;
    expect(constraints?.voices).toEqual([
      { name: "Vocal", required: true, allowsChords: true },
      { name: "Ins", required: false, allowsChords: false },
    ]);
    expect(constraints?.chords.slashBass).toBe(true);
  });

  it("are null when the host imported no dialect for the model", () => {
    expect(open({ modelId: "other-model" }).constraints).toBeNull();
  });
});

/** The same Vocal with three chords: C and Am on notes, G on the half rest that starts bar 2. */
const CHORDED = `${HEADER}
K:C
V: Vocal
"C"C4D4"Am"E4F4|"G"z8G8|
V: Ins
C2D2E2F2G2A2B2c2|C16|`;

describe("the places a chord can go", () => {
  it("are the starts of the notes and rests of the voice that allows chords, with the chord there and the chord before", () => {
    const session = open({ score: CHORDED });
    const { reading, constraints } = session;
    if (reading.kind !== "score" || constraints === null) throw new Error("the fixture did not read");

    const slots = chordSlots(reading.score, constraints);

    expect(slots.map((slot) => [slot.noteId, slot.start, slot.duration, slot.chord, slot.before])).toEqual([
      ["Vocal:0", 0, 256, "C", null],
      ["Vocal:256", 256, 256, null, "C"],
      ["Vocal:512", 512, 256, "Am", "C"],
      ["Vocal:768", 768, 256, null, "Am"],
      ["Vocal:1024", 1024, 512, "G", "Am"],
      ["Vocal:1536", 1536, 512, null, "G"],
    ]);
    expect(slots.every((slot) => slot.voice === "Vocal")).toBe(true);
  });
});

describe("the places a chord can go in a dialect where two voices allow chords", () => {
  it("are the starts of both, and the voice listed first owns a start that both have", () => {
    const session = open();
    const { reading, constraints } = session;
    if (reading.kind !== "score" || constraints === null) throw new Error("the fixture did not read");
    const both = {
      ...constraints,
      voices: constraints.voices.map((voice) => ({ ...voice, allowsChords: true })),
    };

    const slots = chordSlots(reading.score, both);

    // Vocal starts at 0, 256, 512, 768, 1024 and 1536; Ins starts every 128 ticks in bar 1 and again at 1024.
    expect(slots.map((slot) => slot.start)).toEqual([0, 128, 256, 384, 512, 640, 768, 896, 1024, 1536]);
    expect(
      slots.filter((slot) => [0, 256, 512, 768, 1024, 1536].includes(slot.start)).map((slot) => slot.voice),
    ).toEqual(["Vocal", "Vocal", "Vocal", "Vocal", "Vocal", "Vocal"]);
    expect(slots.filter((slot) => slot.voice === "Ins").map((slot) => slot.noteId)).toEqual([
      "Ins:128",
      "Ins:384",
      "Ins:640",
      "Ins:896",
    ]);
  });

  it("are none when no voice allows chords", () => {
    const session = open();
    const { reading, constraints } = session;
    if (reading.kind !== "score" || constraints === null) throw new Error("the fixture did not read");
    const none = { ...constraints, voices: constraints.voices.map((voice) => ({ ...voice, allowsChords: false })) };

    expect(chordSlots(reading.score, none)).toEqual([]);
  });
});
