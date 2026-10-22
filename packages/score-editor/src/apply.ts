// ABOUTME: The two entry points into the generic headless layer: one works on score text, one on a song project.
// ABOUTME: Both run the dialect's check after the command; any failure returns a diagnostic and leaves the input unchanged.
import { commandRefusal } from "./command-refusal";
import { commandAt, runScoreCommand, type ScoreCommand } from "./commands";
import { applyProjectRules, isProjectCommand, type ProjectCommand, runProjectCommand } from "./commands-project";
import type { Diagnostic, DiagnosticAt } from "./diagnostics";
import type { ScoreDialect } from "./dialect";
import type { Score, SongProject } from "./score";

export type ApplyScoreResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

export type ApplyProjectResult = {
  readonly project: SongProject;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
};

function fallbackDiagnostic(): Diagnostic {
  return { code: "token", params: { reason: "unrecognized" }, at: {} };
}

/** A diagnostic the dialect left without a bar points where the command acted; one that has its own place keeps it. */
function located(diagnostic: Diagnostic, acted: DiagnosticAt): Diagnostic {
  return diagnostic.at.bar === undefined ? { ...diagnostic, at: { ...acted, ...diagnostic.at } } : diagnostic;
}

/**
 * Where a refused command acted. A command on several notes points at the note that makes the score stop passing the
 * check, taking them in the order the command names them: the place the same notes would have been refused at one after
 * the other. It is found by halving, so a refused edit of a whole score costs a handful of checks, not one per note.
 */
function refusedAt(dialect: ScoreDialect, score: Score, command: ScoreCommand): DiagnosticAt {
  if (command.type !== "toRests" || command.noteIds.length < 2) return commandAt(score, command);
  const failsWith = (count: number): boolean => {
    const applied = runScoreCommand(score, { type: "toRests", noteIds: command.noteIds.slice(0, count) }, dialect.constraints);
    return applied.ok && dialect.check(applied.score).length > 0;
  };
  let passes = 0;
  let fails = command.noteIds.length;
  while (fails - passes > 1) {
    const middle = Math.floor((passes + fails) / 2);
    if (failsWith(middle)) fails = middle;
    else passes = middle;
  }
  const noteId = command.noteIds[fails - 1];
  return noteId === undefined ? commandAt(score, command) : commandAt(score, { type: "toRest", noteId });
}

/** Reads, applies one command, writes, and checks. On any failure the result carries no new text. */
export function applyScoreCommand(dialect: ScoreDialect, text: string, command: ScoreCommand): ApplyScoreResult {
  const kind = (command as { readonly type: string }).type;
  if (isProjectCommand({ type: kind })) {
    const refused = commandRefusal("not-a-score-command", { type: kind });
    if (!refused.ok) return { ok: false, diagnostic: refused.diagnostic };
  }

  const parsed = dialect.parse(text);
  if (parsed.score === null) {
    return { ok: false, diagnostic: parsed.diagnostics[0] ?? fallbackDiagnostic() };
  }

  const applied = runScoreCommand(parsed.score, command, dialect.constraints);
  if (!applied.ok) return applied;

  let written: string;
  try {
    written = dialect.serialize(applied.score);
  } catch {
    return { ok: false, diagnostic: { code: "write-mismatch", params: {}, at: {} } };
  }
  const diagnostics = dialect.check(applied.score);
  const first = diagnostics[0];
  if (first !== undefined) return { ok: false, diagnostic: located(first, refusedAt(dialect, parsed.score, command)) };
  return { ok: true, text: written };
}

/**
 * Applies one command to a project. A ScoreCommand edits the score text through the score entry; a ProjectCommand
 * edits only the project fields. The project is returned unchanged on a failure.
 */
export function applyProjectCommand(
  dialect: ScoreDialect,
  project: SongProject,
  command: ScoreCommand | ProjectCommand,
): ApplyProjectResult {
  if (isProjectCommand(command)) {
    const applied = runProjectCommand(project, command);
    if (!applied.ok) return { project, diagnostics: [applied.diagnostic] };
    return applyProjectRules(dialect, applied.project, command);
  }

  const applied = applyScoreCommand(dialect, project.score, command);
  if (!applied.ok) return { project, diagnostics: [applied.diagnostic] };
  return applyProjectRules(dialect, { ...project, score: applied.text }, command);
}
