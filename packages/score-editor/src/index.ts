// ABOUTME: Main entry of @neta-art/score-editor. Importing it has no side effects and touches no DOM.
// ABOUTME: Only a call to mount() or to a view part's mount function creates nodes or listeners; the editing session touches no DOM.

export type { ApplyProjectResult, ApplyScoreResult } from "./apply";
export { applyProjectCommand, applyScoreCommand } from "./apply";
export { mountChordTrack } from "./chord-track";
export type { ScoreCommand } from "./commands";
export type { ProjectCommand } from "./commands-project";
export { mountCutNotice } from "./cut-notice";
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
export type { EditingInput, EditingInputResult } from "./editing-input";
export { handleEditingInput } from "./editing-input";
export { mount } from "./mount";
export { mountProblemView } from "./problem-view";
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
  DispatchResult,
  EditingSession,
  InsertionPoint,
  RejectedText,
  ScoreReading,
  SessionChange,
  SessionChangeCause,
  SessionListener,
  SessionOptions,
  ViewName,
  ViewState,
} from "./session";
export { createEditingSession, VIEW_NAMES } from "./session";
export { mountStaffView } from "./staff-view";
export { mountStaleNotice } from "./stale-notice";
export { mountTextView } from "./text-view";
export { mountTimeRuler } from "./time-ruler";
export type {
  BooleanToolParameter,
  ChoiceToolParameter,
  NumberToolParameter,
  ScoreTool,
  TextToolParameter,
  ToolCommandBuilder,
  ToolParameter,
  ToolParameterCheck,
  ToolParameterValue,
  ToolParameterValues,
  ToolRegistry,
  ToolResult,
  ToolText,
} from "./tool";
export { createToolRegistry, previewTool, validateToolParameters } from "./tool";
export type { ToolbarOptions } from "./toolbar";
export { mountToolbar } from "./toolbar";
export type {
  AxisPartOptions,
  ChordVocabulary,
  DialectConstraints,
  DurationSet,
  Language,
  MeterRule,
  MountedEditor,
  MountOptions,
  Notice,
  NoticeCode,
  ViewPart,
} from "./types";
export { NOTICE_CODES } from "./types";
export { mountViewSwitch } from "./view-switch";
export type { VoiceTrackOptions } from "./voice-track";
export { mountVoiceTrack } from "./voice-track";
export { mountZoomControl } from "./zoom-control";
