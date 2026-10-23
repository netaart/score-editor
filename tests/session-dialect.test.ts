// ABOUTME: Seam 1 for the session's read-only view of the dialect that reads its project, which the tempo, key and project panel controls draw from.
// ABOUTME: The session is imported from the package entry in Node; the expected limits are the ones RULES.md states for song2.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  checkProject,
  createDialectRegistry,
  createEditingSession,
  isNoticeDiagnostic,
  type SongProject,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

const SCORE = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
V: Vocal
"C"C4D4E4F4|G16|`;

const project: SongProject = {
  style: "warm pop, 120 BPM",
  lyrics: "",
  score: SCORE,
  scoreMode: "melody",
  seed: null,
  modelId: "song2",
  sourceKey: "session-dialect-test",
};

const dialects = createDialectRegistry([song2Dialect]);

describe("the dialect of a session", () => {
  it("is the one the registry holds for the project's model, with the limits a control needs", () => {
    const session = createEditingSession({ project, dialects });

    expect(session.dialect).toBe(song2Dialect);
    expect(session.dialect?.constraints.tempo).toEqual({ unit: "1/4", min: 20, max: 400 });
    expect(session.dialect?.constraints.keys.major).toContain("Eb");
    expect(session.dialect?.constraints.keys.minor).toContain("F#m");
  });

  it("is undefined when the registry has no dialect for the model, and follows a registry that is replaced", () => {
    const session = createEditingSession({ project: { ...project, modelId: "other-model" }, dialects });
    expect(session.dialect).toBeUndefined();

    const other = createEditingSession({ project, dialects });
    other.replaceDialects(createDialectRegistry([]));
    expect(other.dialect).toBeUndefined();
    other.replaceDialects(dialects);
    expect(other.dialect).toBe(song2Dialect);
  });

  it("lets a panel ask what the project carries as it stands, and see a fix take the notice away in one step each", () => {
    const session = createEditingSession({ project, dialects });
    const carried = () => {
      const dialect = session.dialect;
      if (!dialect) throw new Error("the registry has song2");
      return checkProject(dialect, session.project).map((diagnostic) => diagnostic.code);
    };
    expect(carried()).toEqual(["melody-with-chords"]);
    expect(isNoticeDiagnostic({ code: "melody-with-chords", params: {}, at: {} })).toBe(true);

    expect(session.dispatch({ type: "removeChords" }).ok).toBe(true);
    expect(carried()).toEqual([]);
    expect(session.undo()).toBe(true);
    expect(carried()).toEqual(["melody-with-chords"]);
    expect(session.canUndo).toBe(false);

    expect(session.dispatch({ type: "setScoreMode", scoreMode: "full" }).ok).toBe(true);
    expect(carried()).toEqual([]);
    expect(session.undo()).toBe(true);
    expect(session.project.scoreMode).toBe("melody");
    expect(session.canUndo).toBe(false);
  });
});
