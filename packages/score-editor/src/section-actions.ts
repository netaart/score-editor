// ABOUTME: What one section offers the section menu: its six actions in menu order, the command each runs, and why one cannot.
// ABOUTME: Headless. Each command is tried with the session's tool preview, so a reason is the command layer's own refusal.
import type { ScoreCommand } from "./commands";
import type { Diagnostic } from "./diagnostics";
import type { EditingSession } from "./session";
import type { ScoreTool } from "./tool";

/** The actions of a section, in the order the menu lists them. */
export type SectionActionName = "rename" | "start" | "move-earlier" | "move-later" | "duplicate" | "delete";

/**
 * Why an action cannot be done. `refused` carries the diagnostic of the command that would be refused, so its words come
 * from `formatDiagnostic`. `single-bar` says a section of one bar has no other bar to start a section at.
 */
export type SectionUnavailable =
  | { readonly kind: "refused"; readonly diagnostic: Diagnostic }
  | { readonly kind: "single-bar" };

export interface SectionAction {
  readonly name: SectionActionName;
  /**
   * The command that does it, counted from the section's place in the score. `null` for `rename` and `start`: they need
   * a name, and `start` a bar too, before there is a command (`renameSection`, `nameSection`).
   */
  readonly command: ScoreCommand | null;
  /** Why the action cannot be done now, or `null` while it can. */
  readonly unavailable: SectionUnavailable | null;
}

const PROBE_NAME = { en: "Section action", zh: "段落操作" } as const;

/** The refusal `command` would meet on the session's project, or `null` when it would be taken. Nothing is changed. */
function refusalOf(session: EditingSession, command: ScoreCommand): Diagnostic | null {
  const probe: ScoreTool = { id: "section-action", name: PROBE_NAME, commands: () => [command] };
  const result = session.previewTool(probe);
  return result.ok ? null : (result.diagnostics[0] ?? null);
}

/**
 * What the section at `section` (counted from 0) offers: rename, start a section at one of its bars, move it earlier or
 * later, duplicate it and delete it. An action the command layer would refuse is listed with the refusal, so a menu can
 * show it muted and say why. Returns `null` while the score cannot be read or when there is no such section. It asks the
 * commands without applying them: the project, the history and the listeners are untouched.
 */
export function sectionActions(session: EditingSession, section: number): ReadonlyArray<SectionAction> | null {
  const { reading } = session;
  if (reading.kind !== "score") return null;
  const found = Number.isInteger(section) ? reading.score.sections[section] : undefined;
  if (found === undefined) return null;

  const commanded = (name: SectionActionName, command: ScoreCommand): SectionAction => {
    const diagnostic = refusalOf(session, command);
    return { name, command, unavailable: diagnostic === null ? null : { kind: "refused", diagnostic } };
  };
  return [
    { name: "rename", command: null, unavailable: null },
    { name: "start", command: null, unavailable: found.barCount < 2 ? { kind: "single-bar" } : null },
    commanded("move-earlier", { type: "moveSection", section, direction: "earlier" }),
    commanded("move-later", { type: "moveSection", section, direction: "later" }),
    commanded("duplicate", { type: "duplicateSection", section }),
    commanded("delete", { type: "deleteSection", section }),
  ];
}
