// ABOUTME: Seam 1 for the section menu's logic: what a section offers and why an action is unavailable, read through the package entry in Node.
// ABOUTME: Expected answers are worked out by hand from the section rules in RULES.md and the README; the commands are only used to cross-check them.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createDialectRegistry,
  createEditingSession,
  type EditingSession,
  type SessionChange,
  type SongProject,
  sectionActions,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";
import { UNREADABLE_SCORE } from "./scores";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C`;

/** An unnamed opening bar, then verse (two bars) and chorus (one bar). */
const THREE = `${HEADER}
V: Vocal
C16|
% verse
V: Vocal
D16|E16|
% chorus
V: Vocal
F16|
`;

/** The same song with the chorus cut off in the middle of its second bar. */
const CUT = `${HEADER}
V: Vocal
C16|
% verse
V: Vocal
D16|E16|
% chorus
V: Vocal
F16|G8
`;

/** One named section of one bar. */
const ONLY = `${HEADER}
% a
V: Vocal
C16|
`;

const dialects = createDialectRegistry([song2Dialect]);

function open(score: string): EditingSession {
  const project: SongProject = {
    style: "pop",
    lyrics: "",
    score,
    scoreMode: "full",
    seed: 7,
    modelId: "song2",
    sourceKey: "section-actions-test",
  };
  return createEditingSession({ project, dialects });
}

/** What each action of a section is, in the order the menu lists them: its name, and the code it is unavailable with. */
function summary(session: EditingSession, section: number) {
  const actions = sectionActions(session, section);
  if (actions === null) throw new Error("the section has no actions");
  return actions.map((action) => {
    return [action.name, action.unavailable?.code ?? null] as const;
  });
}

describe("what a section offers", () => {
  it("lists rename, start, the two moves, duplicate and delete, in the menu's order", () => {
    const names = sectionActions(open(THREE), 1)?.map((action) => action.name);
    expect(names).toEqual(["rename", "start", "move-earlier", "move-later", "duplicate", "delete"]);
  });

  it("offers a named section after the unnamed opening everything except moving before the unnamed music", () => {
    expect(summary(open(THREE), 1)).toEqual([
      ["rename", null],
      ["start", null],
      ["move-earlier", "section-before-unnamed"],
      ["move-later", null],
      ["duplicate", null],
      ["delete", null],
    ]);
  });

  it("offers the unnamed opening rename, start and delete, and refuses duplicate and the moves", () => {
    expect(summary(open(THREE), 0)).toEqual([
      ["rename", null],
      ["start", null],
      ["move-earlier", "section-unnamed"],
      ["move-later", "section-unnamed"],
      ["duplicate", "section-unnamed"],
      ["delete", null],
    ]);
  });

  it("refuses to move the last section later, and still lets a section of one bar start a section", () => {
    expect(summary(open(THREE), 2)).toEqual([
      ["rename", null],
      ["start", null],
      ["move-earlier", null],
      ["move-later", "section-move-end"],
      ["duplicate", null],
      ["delete", null],
    ]);
  });

  it("refuses to move the first section earlier", () => {
    const first = summary(open(ONLY), 0);
    expect(first).toContainEqual(["move-earlier", "section-move-start"]);
    expect(first).toContainEqual(["move-later", "section-move-end"]);
  });

  it("cannot delete the only section, because no bar would remain", () => {
    expect(summary(open(ONLY), 0)).toContainEqual(["delete", "last-bar"]);
  });

  it("keeps the section that holds the cut tail where it is, and allows deleting it", () => {
    expect(summary(open(CUT), 2)).toEqual([
      ["rename", null],
      ["start", null],
      ["move-earlier", "truncated-tail"],
      ["move-later", "section-move-end"],
      ["duplicate", "truncated-tail"],
      ["delete", null],
    ]);
    expect(summary(open(CUT), 1)).toContainEqual(["move-later", "truncated-tail"]);
  });

  it("names the command each available action runs, and none for the two that first need a name", () => {
    const commands = sectionActions(open(THREE), 1)?.map((action) => action.command);
    expect(commands).toEqual([
      null,
      null,
      { type: "moveSection", section: 1, direction: "earlier" },
      { type: "moveSection", section: 1, direction: "later" },
      { type: "duplicateSection", section: 1 },
      { type: "deleteSection", section: 1 },
    ]);
  });

  it("gives the reason as the diagnostic of the refusal itself, with the section counted from 1", () => {
    const earlier = sectionActions(open(THREE), 2)?.find((action) => action.name === "move-later");
    expect(earlier?.unavailable).toEqual({ code: "section-move-end", params: { section: 3 }, at: { bar: 4 } });
  });

  it("agrees with the commands: an available action is taken, an unavailable one is refused with the same code", () => {
    for (const score of [THREE, CUT, ONLY]) {
      const session = open(score);
      const count = session.reading.kind === "score" ? session.reading.score.sections.length : 0;
      for (let section = 0; section < count; section += 1) {
        for (const action of sectionActions(session, section) ?? []) {
          if (action.command === null) continue;
          const result = session.dispatch(action.command);
          if (action.unavailable === null) {
            expect(result.ok, `${action.name} of section ${section} in ${score}`).toBe(true);
            expect(session.undo()).toBe(true);
          } else {
            expect(result.ok, `${action.name} of section ${section}`).toBe(false);
            expect(result.diagnostics[0]?.code).toBe(action.unavailable.code);
          }
        }
      }
      expect(session.project.score).toBe(score);
    }
  });

  it("answers nothing for a section that does not exist", () => {
    expect(sectionActions(open(THREE), 3)).toBeNull();
    expect(sectionActions(open(THREE), -1)).toBeNull();
    expect(sectionActions(open(THREE), 1.5)).toBeNull();
  });

  it("answers nothing while the score cannot be read", () => {
    expect(sectionActions(open(UNREADABLE_SCORE), 0)).toBeNull();
  });

  it("asks without changing the project, the history or anyone listening", () => {
    const session = open(THREE);
    const changes: SessionChange[] = [];
    session.subscribe((change) => changes.push(change));
    const before = session.project;
    sectionActions(session, 1);
    sectionActions(session, 0);
    expect(session.project).toBe(before);
    expect(session.canUndo).toBe(false);
    expect(changes).toEqual([]);
  });
});
