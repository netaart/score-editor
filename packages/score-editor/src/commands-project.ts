// ABOUTME: The song-project commands and the project-level rules: style, score mode, seed, the style BPM and melody chords.
// ABOUTME: A project command never touches the score text; applyProjectCommand is the one entry that runs these rules.

import type { ScoreCommand } from "./commands";
import type { Diagnostic } from "./diagnostics";
import type { ScoreDialect } from "./dialect";
import type { SongProject } from "./score";

/** A song-project edit that is not a score edit. The name is one word so the two command kinds stay apart. */
export type ProjectCommand =
  | { readonly type: "setStyle"; readonly style: string }
  | { readonly type: "setScoreMode"; readonly scoreMode: "full" | "melody" }
  | { readonly type: "setSeed"; readonly seed: number | null };

export type ProjectCommandResult =
  | { readonly ok: true; readonly project: SongProject }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/** The project half of the command union applyProjectCommand accepts besides ScoreCommand. */
export function isProjectCommand(command: ScoreCommand | ProjectCommand): command is ProjectCommand {
  return command.type === "setStyle" || command.type === "setScoreMode" || command.type === "setSeed";
}

/** Applies one project field edit. It never reads or writes the score text. */
export function runProjectCommand(project: SongProject, command: ProjectCommand): ProjectCommandResult {
  switch (command.type) {
    case "setStyle":
      if (typeof command.style !== "string") {
        return { ok: false, diagnostic: { code: "style-invalid", params: {}, at: {} } };
      }
      return { ok: true, project: { ...project, style: command.style } };
    case "setScoreMode":
      if (command.scoreMode !== "full" && command.scoreMode !== "melody") {
        return { ok: false, diagnostic: { code: "score-mode-invalid", params: {}, at: {} } };
      }
      return { ok: true, project: { ...project, scoreMode: command.scoreMode } };
    case "setSeed":
      if (command.seed !== null && !Number.isInteger(command.seed)) {
        return {
          ok: false,
          diagnostic: { code: "seed-not-integer", params: { seed: String(command.seed) }, at: {} },
        };
      }
      return { ok: true, project: { ...project, seed: command.seed } };
  }
}

// Several ways a style text writes a BPM: "120 BPM", "120bpm", "BPM: 120", "bpm=120", "BPM 120".
const BPM_PATTERN = /(\d+)([ \t]*)(bpm)|(bpm)([ \t]*[:=：]?[ \t]*)(\d+)/gi;

/**
 * Replaces every BPM written in a style text. A number with no BPM word next to it is left alone,
 * so a meter, a count or a year in the same sentence survives the tempo change.
 */
export function styleWithTempo(style: string, bpm: number): { readonly style: string; readonly found: boolean } {
  let found = false;
  const next = style.replace(BPM_PATTERN, (match: string, ...groups: Array<string | undefined>) => {
    const [digitsBefore, spaceBefore, wordBefore, wordAfter, spaceAfter, digitsAfter] = groups;
    if (digitsBefore !== undefined && wordBefore !== undefined) {
      found = true;
      return `${bpm}${spaceBefore ?? ""}${wordBefore}`;
    }
    if (wordAfter !== undefined && digitsAfter !== undefined) {
      found = true;
      return `${wordAfter}${spaceAfter ?? ""}${bpm}`;
    }
    return match;
  });
  return { style: found ? next : style, found };
}

/** The notices a project carries as it stands, without changing anything. */
export function checkProject(dialect: ScoreDialect, project: SongProject): ReadonlyArray<Diagnostic> {
  if (project.scoreMode !== "melody") return [];
  const parsed = dialect.parse(project.score);
  if (parsed.score === null || !parsed.score.hasChords) return [];
  return [{ code: "melody-with-chords", params: {}, at: {} }];
}
