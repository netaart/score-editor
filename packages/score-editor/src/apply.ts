// ABOUTME: The two entry points into the generic headless layer: one works on score text, one on a song project.
// ABOUTME: Both run the dialect's check after the command; any failure returns a diagnostic and leaves the input unchanged.
import { runScoreCommand, type ScoreCommand } from "./commands";
import type { Diagnostic } from "./diagnostics";
import type { ScoreDialect } from "./dialect";
import type { SongProject } from "./score";

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
  if (diagnostics.length > 0) return { ok: false, diagnostic: diagnostics[0] as Diagnostic };
  return { ok: true, text: written };
}

/** Applies one command to a project. Only its score text can change, and only when nothing failed. */
export function applyProjectCommand(
  dialect: ScoreDialect,
  project: SongProject,
  command: ScoreCommand,
): ApplyProjectResult {
  const applied = applyScoreCommand(dialect, project.score, command);
  if (!applied.ok) return { project, diagnostics: [applied.diagnostic] };
  return { project: { ...project, score: applied.text }, diagnostics: [] };
}
