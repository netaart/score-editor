// ABOUTME: Reading a text as a project's score: the one rule the replace-text command and the session's text check share.
// ABOUTME: A text is taken when the dialect reads it and its check passes; it is then stored the way the dialect writes it.
import type { Diagnostic } from "./diagnostics";
import type { ScoreDialect } from "./dialect";
import type { Score } from "./score";

export type ScoreTextReading =
  | { readonly ok: true; readonly text: string; readonly score: Score }
  | { readonly ok: false; readonly diagnostics: ReadonlyArray<Diagnostic> };

/** What a refusal carries when a dialect reports no score and no diagnostic, which the dialect contract rules out. */
export function fallbackDiagnostic(): Diagnostic {
  return { code: "token", params: { reason: "unrecognized" }, at: {} };
}

/**
 * Reads `text` with the dialect: every reading diagnostic when it cannot be read, every check diagnostic when it reads
 * but does not survive a write and read back, else the score and the text the dialect writes for it. A text the dialect
 * reads is written back byte for byte, but for line endings, which are written as LF.
 */
export function readScoreText(dialect: ScoreDialect, text: string): ScoreTextReading {
  const parsed = dialect.parse(text);
  if (parsed.score === null) {
    return { ok: false, diagnostics: parsed.diagnostics.length > 0 ? parsed.diagnostics : [fallbackDiagnostic()] };
  }
  const problems = dialect.check(parsed.score);
  if (problems.length > 0) return { ok: false, diagnostics: problems };
  return { ok: true, text: dialect.serialize(parsed.score), score: parsed.score };
}
