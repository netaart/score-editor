// ABOUTME: Types for the skill's edit-one-bar browser helper, which the seam 1 test imports from the repository.
// ABOUTME: They name the two package entries the helper receives and the report the shipped page displays.
import type { ApplyProjectResult, Diagnostic, ScoreCommand, ScoreDialect, SongProject } from "@neta-art/score-editor";

export interface EditOneBarDependencies {
  readonly song2Dialect: ScoreDialect;
  readonly applyProjectCommand: (
    dialect: ScoreDialect,
    project: SongProject,
    command: ScoreCommand,
  ) => ApplyProjectResult;
  readonly noteId: (voice: string, start: number) => string;
  readonly isNoticeDiagnostic: (diagnostic: Diagnostic) => boolean;
  readonly formatDiagnostic: (diagnostic: Diagnostic, language: "en" | "zh") => string;
}

export interface EditOneBarOptions {
  readonly bar?: number;
  readonly chord?: string;
  readonly language?: "en" | "zh";
  readonly scoreMode?: "full" | "melody";
}

export interface EditOneBarDiagnostic {
  readonly code: Diagnostic["code"];
  readonly text: string;
  readonly at: Diagnostic["at"];
}

export interface EditOneBarResult {
  readonly ok: boolean;
  readonly stage: "read" | "find" | "command" | "check" | "written";
  readonly message: string;
  readonly noteId: string | null;
  readonly bar: number;
  readonly chord: string;
  readonly before: string;
  readonly after: string | null;
  readonly project: SongProject | null;
  readonly diagnostics: ReadonlyArray<EditOneBarDiagnostic>;
  readonly notices: ReadonlyArray<EditOneBarDiagnostic>;
  readonly refusals: ReadonlyArray<EditOneBarDiagnostic>;
  readonly changedLines: ReadonlyArray<number>;
  readonly lineCount: number;
}

export function editOneBar(
  scoreText: string,
  dependencies: EditOneBarDependencies,
  options?: EditOneBarOptions,
): EditOneBarResult;
