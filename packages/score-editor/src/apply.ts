// ABOUTME: The two entry points into the generic headless layer: one works on score text, one on a song project.
// ABOUTME: Both run the dialect's check after the command; any failure returns a diagnostic and leaves the input unchanged.
import { commandRefusal } from "./command-refusal";
import { commandAt, runScoreCommand, type ScoreCommand } from "./commands";
import { withRemappedLyrics } from "./commands-lyrics";
import { applyProjectRules, isProjectCommand, type ProjectCommand, runProjectCommand } from "./commands-project";
import type { CommandReport } from "./commands-voice";
import type { Diagnostic, DiagnosticAt } from "./diagnostics";
import type { ScoreDialect } from "./dialect";
import type { SongProject } from "./score";
import { fallbackDiagnostic } from "./score-text";

export type ApplyScoreResult =
  | { readonly ok: true; readonly text: string; readonly report?: CommandReport }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

export type ApplyProjectResult = {
  readonly project: SongProject;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
  /** What the score command did, when it has more to say than its text. */
  readonly reports?: ReadonlyArray<CommandReport>;
};

/** A diagnostic the dialect left without a bar points where the command acted; one that has its own place keeps it. */
function located(diagnostic: Diagnostic, acted: DiagnosticAt): Diagnostic {
  return diagnostic.at.bar === undefined ? { ...diagnostic, at: { ...acted, ...diagnostic.at } } : diagnostic;
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
    return {
      ok: false,
      diagnostic: { code: "write-mismatch", params: {}, at: commandAt(parsed.score, command) },
    };
  }
  const diagnostics = dialect.check(applied.score);
  const first = diagnostics[0];
  if (first !== undefined) return { ok: false, diagnostic: located(first, commandAt(parsed.score, command)) };
  return applied.report === undefined
    ? { ok: true, text: written }
    : { ok: true, text: written, report: applied.report };
}

/**
 * Applies one command to a project. A ScoreCommand edits the score text through the score entry; a ProjectCommand edits
 * the project's fields, or, for `replaceScoreText`, takes a whole new score text. Either way the song-project rules run
 * after it. The project is returned unchanged on a failure.
 */
export function applyProjectCommand(
  dialect: ScoreDialect,
  project: SongProject,
  command: ScoreCommand | ProjectCommand,
): ApplyProjectResult {
  if (isProjectCommand(command)) {
    const applied = runProjectCommand(dialect, project, command);
    if (!applied.ok) return { project, diagnostics: [applied.diagnostic] };
    return applyProjectRules(dialect, applied.project, command);
  }

  const applied = applyScoreCommand(dialect, project.score, command);
  if (!applied.ok) return { project, diagnostics: [applied.diagnostic] };
  const next = withRemappedLyrics(dialect, project, command, applied.text);
  const checked = applyProjectRules(dialect, next, command);
  return applied.report === undefined ? checked : { ...checked, reports: [applied.report] };
}
