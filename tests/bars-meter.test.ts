// ABOUTME: Seam 1 for the bar choice and the meter offers: the session keeps a base-0 bar range outside the history.
// ABOUTME: The meter choices are filtered by the dialect's MeterRule, with hand-written rules here rather than song2's own.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createDialectRegistry,
  createEditingSession,
  type EditingSession,
  meterAllowed,
  meterChoices,
  type SessionChange,
  type SongProject,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

const SCORE = `X:1
T:
M:2/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
V: Vocal
C4D4|E4F4|G8|A8|
V: Ins
C4D4|E4F4|G8|A8|`;

const project: SongProject = {
  style: "pop",
  lyrics: "",
  score: SCORE,
  scoreMode: "full",
  seed: null,
  modelId: "song2",
  sourceKey: "bars-meter-test",
};

function open(overrides: Partial<SongProject> = {}): EditingSession {
  return createEditingSession({
    project: { ...project, ...overrides },
    dialects: createDialectRegistry([song2Dialect]),
  });
}

function listen(session: EditingSession): SessionChange[] {
  const changes: SessionChange[] = [];
  session.subscribe((change) => changes.push(change));
  return changes;
}

describe("the chosen bars", () => {
  it("are a base-0 range in UI state, separate from the note selection and outside the history", () => {
    const session = open();
    const changes = listen(session);

    session.setBarSelection({ from: 1, count: 2 });

    expect(session.barSelection).toEqual({ from: 1, count: 2 });
    expect(session.selection).toEqual([]);
    expect(session.canUndo).toBe(false);
    expect(changes).toEqual([
      { cause: "bar-selection", project: false, selection: false, insertionPoint: false, view: false },
    ]);
  });

  it("is trimmed to the bars that exist and cleared when the project changes", () => {
    const session = open();
    session.setBarSelection({ from: 3, count: 5 });
    expect(session.barSelection).toEqual({ from: 3, count: 1 });

    session.dispatch({ type: "insertBar", bar: 0 });
    expect(session.barSelection).toBeNull();
    expect(session.canUndo).toBe(true);
  });

  it("says nothing when the same range is chosen again", () => {
    const session = open();
    session.setBarSelection({ from: 0, count: 1 });
    const changes = listen(session);
    session.setBarSelection({ from: 0, count: 1 });
    expect(changes).toEqual([]);
  });
});

describe("the meter the control may offer", () => {
  it("keeps the common meters a dialect's rule allows and leaves out the rest", () => {
    const song2 = meterChoices(song2Dialect.constraints).map((m) => `${m.numerator}/${m.denominator}`);
    expect(song2).toContain("4/4");
    expect(song2).toContain("5/8");
    expect(song2).toContain("12/8");

    const narrow = {
      ...song2Dialect.constraints,
      meter: {
        form: "fraction" as const,
        numerator: { min: 2, max: 4 },
        denominator: { min: 2, max: 4, powerOfTwo: true },
        symbolic: false,
      },
    };
    expect(meterChoices(narrow).map((m) => `${m.numerator}/${m.denominator}`)).toEqual([
      "2/2",
      "3/2",
      "4/2",
      "2/4",
      "3/4",
      "4/4",
    ]);
  });

  it("accepts only positive integers inside the rule, with a power-of-two denominator", () => {
    const rule = song2Dialect.constraints.meter;
    expect(meterAllowed({ numerator: 7, denominator: 8 }, rule)).toBe(true);
    expect(meterAllowed({ numerator: 0, denominator: 4 }, rule)).toBe(false);
    expect(meterAllowed({ numerator: 4, denominator: 0 }, rule)).toBe(false);
    expect(meterAllowed({ numerator: 4, denominator: 6 }, rule)).toBe(false);
    expect(meterAllowed({ numerator: 4.5, denominator: 4 }, rule)).toBe(false);
    expect(meterAllowed({ numerator: 1000000, denominator: 4 }, rule)).toBe(false);
  });

  it("leaves a dialect with no allowed common meter with no radio choices, and the custom row still reaches its range", () => {
    const none = {
      ...song2Dialect.constraints,
      meter: {
        form: "fraction" as const,
        numerator: { min: 11, max: 13 },
        denominator: { min: 16, max: 16, powerOfTwo: true },
        symbolic: false,
      },
    };
    expect(meterChoices(none)).toEqual([]);
    expect(meterAllowed({ numerator: 11, denominator: 16 }, none.meter)).toBe(true);
  });
});
