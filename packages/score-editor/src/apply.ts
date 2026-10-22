// ABOUTME: The two entry points into the generic headless layer: one works on score text, one on a song project.
// ABOUTME: Both run the dialect's check after the command; any failure returns a diagnostic and leaves the input unchanged.
import { commandAt, runScoreCommand, type ScoreCommand } from "./commands";
import { isProjectCommand, type ProjectCommand } from "./commands-project";
import type { Diagnostic, DiagnosticAt } from "./diagnostics";
import type { ScoreDialect } from "./dialect";
import type { SongProject } from "./score";
import { fallbackDiagnostic, readScoreText } from "./score-text";

export type ApplyScoreResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

export type ApplyProjectResult = {
  readonly project: SongProject;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
};

/** A diagnostic the dialect left without a bar points where the command acted; one that has its own place keeps it. */
function located(diagnostic: Diagnostic, acted: DiagnosticAt): Diagnostic {
  return diagnostic.at.bar === undefined ? { ...diagnostic, at: { ...acted, ...diagnostic.at } } : diagnostic;
}

/** Reads, applies one command, writes, and checks. On any failure the result carries no new text. */
export function applyScoreCommand(dialect: ScoreDialect, text: string, command: ScoreCommand): ApplyScoreResult {
  const parsed = dialect.parse(text);
  if (parsed.score === null) {
    return { ok: false, diagnostic: parsed.diagnostics[0] ?? fallbackDiagnostic() };
  }

  const applied = runScoreCommand(parsed.score, command);
  if (!applied.ok) return applied;

  const written = dialect.serialize(applied.score);
  const diagnostics = dialect.check(applied.score);
  const first = diagnostics[0];
  if (first !== undefined) return { ok: false, diagnostic: located(first, commandAt(parsed.score, command)) };
  return { ok: true, text: written };
}

/** Replaces the score text with another one, when the dialect takes it; the first diagnostic is the refusal. */
function replaceScoreText(dialect: ScoreDialect, project: SongProject, text: string): ApplyProjectResult {
  const read = readScoreText(dialect, text);
  if (!read.ok) return { project, diagnostics: read.diagnostics.slice(0, 1) };
  return { project: { ...project, score: read.text }, diagnostics: [] };
}

/**
 * Applies one command to a project. A ScoreCommand edits the score text through the score entry; a ProjectCommand acts
 * on the project itself. Only the score text changes, and only when nothing failed.
 */
export function applyProjectCommand(
  dialect: ScoreDialect,
  project: SongProject,
  command: ScoreCommand | ProjectCommand,
): ApplyProjectResult {
  if (isProjectCommand(command)) return replaceScoreText(dialect, project, command.text);
  const applied = applyScoreCommand(dialect, project.score, command);
  if (!applied.ok) return { project, diagnostics: [applied.diagnostic] };
  return { project: { ...project, score: applied.text }, diagnostics: [] };
}
