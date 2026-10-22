// ABOUTME: The one shape of a refused score command: a diagnostic with its code, parameters and place.
// ABOUTME: Every command file builds its refusals here, so the shape is written once.
import type { ScoreCommandResult } from "./commands";
import type { CommandDiagnosticCode, DiagnosticAt, DiagnosticParams } from "./diagnostics";

/** A refused command. No score comes back, so nothing changes. */
export function commandRefusal(
  code: CommandDiagnosticCode,
  params: DiagnosticParams,
  at: DiagnosticAt = {},
): ScoreCommandResult {
  return { ok: false, diagnostic: { code, params, at } };
}
