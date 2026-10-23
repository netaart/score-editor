// ABOUTME: The one shape of a refused command: a diagnostic with its code, parameters and place.
// ABOUTME: Every command file builds its refusals here, so the shape is written once.
import type { CommandDiagnosticCode, Diagnostic, DiagnosticAt, DiagnosticParams } from "./diagnostics";

/** A refused command. No score or project comes back, so nothing changes. */
export interface CommandRefusal {
  readonly ok: false;
  readonly diagnostic: Diagnostic;
}

/** Builds the one refusal shape every command file returns. */
export function commandRefusal(
  code: CommandDiagnosticCode,
  params: DiagnosticParams,
  at: DiagnosticAt = {},
): CommandRefusal {
  return { ok: false, diagnostic: { code, params, at } };
}
