// ABOUTME: Main entry of @neta-art/score-editor. Importing it has no side effects and touches no DOM.
// ABOUTME: Only a call to mount() creates nodes or listeners.

export type {
  CommandDiagnosticCode,
  Diagnostic,
  DiagnosticAt,
  DiagnosticCode,
  DiagnosticParams,
  ReadingDiagnosticCode,
} from "./diagnostics";
export {
  COMMAND_DIAGNOSTIC_CODES,
  formatDiagnostic,
  READING_DIAGNOSTIC_CODES,
} from "./diagnostics";
export type { DialectRegistry, ParseResult, ScoreDialect } from "./dialect";
export { createDialectRegistry } from "./dialect";
export { mount } from "./mount";
export type {
  Bar,
  Chord,
  KeyChange,
  Meter,
  Note,
  Score,
  Section,
  SongProject,
  Tempo,
  Truncation,
} from "./score";
export { noteId, TICKS_PER_QUARTER } from "./score";
export type {
  ChordVocabulary,
  DialectConstraints,
  DurationSet,
  Language,
  MeterRule,
  MountedEditor,
  MountOptions,
  Notice,
  NoticeCode,
  SpikeNote,
  SpikeScore,
} from "./types";
