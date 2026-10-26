// ABOUTME: Seam 1 for the bars a command rewrote: one-bar edits, a tie across a barline, whole-score commands and the session.
// ABOUTME: Expected bar numbers are worked out by hand from the score text; they are 1-based, as the change log names them.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  applyProjectCommand,
  applyScoreCommand,
  createDialectRegistry,
  createEditingSession,
  type SongProject,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

/** Bar 1: C D E F as quarter notes. Bar 2: a whole note G. */
const SCORE = `${HEADER}
K:C
V: Vocal
C4D4E4F4|G16|`;

/** The F at the end of bar 1 ties into the F at the start of bar 2. */
const TIED_SCORE = `${HEADER}
K:C
V: Vocal
C4D4E4F4-|F4G4A4B4|`;

const project: SongProject = {
  style: "pop",
  lyrics: "la la",
  score: SCORE,
  scoreMode: "full",
  seed: 7,
  modelId: "song2",
  sourceKey: "rewritten-bars-test",
};

const dialects = createDialectRegistry([song2Dialect]);

describe("the rewritten bars of a score command", () => {
  it("reports the one bar a note command changed", () => {
    const result = applyScoreCommand(song2Dialect, SCORE, { type: "toRest", noteId: "Vocal:0" });
    expect(result.ok && result.rewrittenBars).toEqual([1]);
  });

  it("brings the neighbour a tie crosses the barline into", () => {
    const result = applyScoreCommand(song2Dialect, TIED_SCORE, { type: "toRest", noteId: "Vocal:768" });
    expect(result.ok && result.rewrittenBars).toEqual([1, 2]);
  });

  it("reports the bars a whole-score transpose rewrote", () => {
    const result = applyScoreCommand(song2Dialect, SCORE, { type: "transpose", semitones: 12 });
    expect(result.ok && result.rewrittenBars).toEqual([1, 2]);
  });

  it("reports the bar range an inserted bar renumbers", () => {
    const result = applyScoreCommand(song2Dialect, SCORE, { type: "insertBar", bar: 1 });
    expect(result.ok && result.rewrittenBars).toEqual([2, 3]);
  });

  it("reports only the new bar when one is appended", () => {
    const result = applyScoreCommand(song2Dialect, SCORE, { type: "insertBar", bar: 2 });
    expect(result.ok && result.rewrittenBars).toEqual([3]);
  });

  it("reports no remaining bar when the tail is deleted", () => {
    const result = applyScoreCommand(song2Dialect, SCORE, { type: "deleteBars", from: 1, count: 1 });
    expect(result.ok && (result.rewrittenBars ?? [])).toEqual([]);
  });

  it("reports every bar a key change or a voice octave rewrites", () => {
    const key = applyScoreCommand(song2Dialect, SCORE, { type: "setKey", key: "D" });
    expect(key.ok && key.rewrittenBars).toEqual([1, 2]);
    const octave = applyScoreCommand(song2Dialect, SCORE, { type: "voiceOctave", octaves: 1 });
    expect(octave.ok && octave.rewrittenBars).toEqual([1, 2]);
  });

  it("reports the bars an instrumental version rewrites", () => {
    const result = applyScoreCommand(song2Dialect, SCORE, { type: "instrumentalVersion" });
    expect(result.ok && result.rewrittenBars).toEqual([1, 2]);
  });

  it("reports the bar a removed chord sat in", () => {
    const chorded = SCORE.replace("V: Vocal\nC4", 'V: Vocal\n"C"C4');
    const result = applyScoreCommand(song2Dialect, chorded, { type: "removeChords" });
    expect(result.ok && result.rewrittenBars).toEqual([1]);
  });

  it("reports no bar for a tempo change, which rewrites the header only", () => {
    const result = applyScoreCommand(song2Dialect, SCORE, { type: "setTempo", bpm: 140 });
    expect(result.ok && (result.rewrittenBars ?? [])).toEqual([]);
  });

  it("reports the bars a replaced score text changed", () => {
    const changed = SCORE.replace("G16|", "A16|");
    const result = applyProjectCommand(song2Dialect, project, { type: "replaceScoreText", text: changed });
    expect(result.rewrittenBars).toEqual([2]);
  });
});

describe("the rewritten bars the session keeps", () => {
  function open(score = SCORE) {
    return createEditingSession({ project: { ...project, score }, dialects });
  }

  it("keeps the last edit's bars and gives them back after undo and redo", () => {
    const session = open();
    expect(session.rewrittenBars).toEqual([]);
    session.dispatch({ type: "toRest", noteId: "Vocal:0" });
    expect(session.rewrittenBars).toEqual([1]);
    session.dispatch({ type: "toRest", noteId: "Vocal:1024" });
    expect(session.rewrittenBars).toEqual([2]);
    // Undo and redo report the bars of the step they moved, which is the bar the screen just changed.
    expect(session.undo()).toBe(true);
    expect(session.rewrittenBars).toEqual([2]);
    expect(session.redo()).toBe(true);
    expect(session.rewrittenBars).toEqual([2]);
  });

  it("unites the bars of a list applied as one step", () => {
    const session = open();
    session.dispatchAll([
      { type: "toRest", noteId: "Vocal:0" },
      { type: "toRest", noteId: "Vocal:1024" },
    ]);
    expect(session.rewrittenBars).toEqual([1, 2]);
  });

  it("reports a dispatch result's bars", () => {
    const session = open();
    expect(session.dispatch({ type: "toRest", noteId: "Vocal:1024" }).rewrittenBars).toEqual([2]);
  });
});
