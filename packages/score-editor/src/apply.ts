// ABOUTME: The two entry points into the generic edit layer: one works on score text, one on a song project.
// ABOUTME: Both run the dialect's check after the command; any failure returns a diagnostic and leaves the input unchanged.
import { runScoreCommand, type ScoreCommand } from "./commands";
import {
  checkProject,
  isProjectCommand,
  type ProjectCommand,
  runProjectCommand,
  styleWithTempo,
} from "./commands-project";
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

  const applied = runScoreCommand(parsed.score, command, dialect.constraints);
  if (!applied.ok) return applied;

  const written = dialect.serialize(applied.score);
  const diagnostics = dialect.check(applied.score);
  if (diagnostics.length > 0) return { ok: false, diagnostic: diagnostics[0] as Diagnostic };
  return { ok: true, text: written };
}

/**
 * The project rules after a command: a tempo change carries into a BPM in the style text, and a melody project
 * with chords carries its notice. A notice can come with a changed project; a refusal never does.
 */
function finishProject(
  dialect: ScoreDialect,
  before: SongProject,
  after: SongProject,
  command: ScoreCommand | ProjectCommand,
): ApplyProjectResult {
  const diagnostics: Diagnostic[] = [];
  let next = after;
  if (command.type === "setTempo" && next.score !== before.score) {
    const synced = styleWithTempo(next.style, command.bpm);
    if (synced.found) next = { ...next, style: synced.style };
    else diagnostics.push({ code: "style-no-bpm", params: {}, at: {} });
  }
  diagnostics.push(...checkProject(dialect, next));
  return { project: next, diagnostics };
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
    return finishProject(dialect, project, applied.project, command);
  }

  const applied = applyScoreCommand(dialect, project.score, command);
  if (!applied.ok) return { project, diagnostics: [applied.diagnostic] };
  return finishProject(dialect, project, { ...project, score: applied.text }, command);
}
