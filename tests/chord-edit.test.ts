// ABOUTME: Seam 1 for editing chords below the UI: the session's constraints, the places a chord can go, and the names the picker offers.
// ABOUTME: Expected positions and names are worked out by hand from the bar grid and RULES.md C1 to C3, never from the code under test.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
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
