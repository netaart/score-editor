// ABOUTME: Main entry of @neta-art/score-editor. Importing it has no side effects and touches no DOM.
// ABOUTME: Only a call to mount() or to a view part's mount function creates nodes or listeners; the editing session touches no DOM.

export type { ApplyProjectResult, ApplyScoreResult } from "./apply";
export { applyProjectCommand, applyScoreCommand } from "./apply";
export { mountChordTrack } from "./chord-track";
export type { ScoreCommand } from "./commands";
export type { Grid, GridValue, MoveNotesCommand, MoveResizeCommand, ResizeNotesCommand } from "./commands-notes";
export type { ProjectCommand } from "./commands-project";
export { checkProject } from "./commands-project";
export { mountCutNotice } from "./cut-notice";
export type {
  CommandDiagnosticCode,
  Diagnostic,
  DiagnosticAt,
  DiagnosticCode,
  DiagnosticParams,
  NoticeDiagnosticCode,
  ReadingDiagnosticCode,
} from "./diagnostics";
export {
  COMMAND_DIAGNOSTIC_CODES,
  formatDiagnostic,
  isNoticeDiagnostic,
  NOTICE_DIAGNOSTIC_CODES,
  READING_DIAGNOSTIC_CODES,
} from "./diagnostics";
export type { DialectRegistry, ParseResult, ScoreDialect } from "./dialect";
export { createDialectRegistry } from "./dialect";
export { mountDraftConflict } from "./draft-conflict";
// Drafts below the UI.
export type {
  DraftHandoffResult,
  DraftKeeper,
  DraftKeeperChange,
  DraftKeeperOptions,
  DraftKeeperStatus,
} from "./draft-keeper";
export { createDraftKeeper } from "./draft-keeper";
export type { DraftProject, ScoreDraft } from "./drafts";
export { contentHash, DRAFT_FORMAT_VERSION, draftText, readDraft } from "./drafts";
export type { EditingInput, EditingInputResult } from "./editing-input";
export { handleEditingInput } from "./editing-input";
// The lyric track: the rules a host's own lyric view can reuse.
export type {
  LyricBoundaryDrag,
  LyricBoundaryMove,
  LyricBoundaryPlan,
  LyricDrop,
  LyricDropPlan,
  LyricEdge,
  LyricRow,
  LyricSplit,
} from "./lyric-edit";
export { barLineTick, lyricBoundaryPlan, lyricDropPlan, lyricRows, lyricSplitCommand } from "./lyric-edit";
export { mountLyricTrack } from "./lyric-track";
export type { LyricAlignment, LyricSyllableNote } from "./lyrics";
export {
  alignedLyricLines,
  alignLyricLine,
  joinLyrics,
  LYRICS_MAX_CHARACTERS,
  layoutLyrics,
  lyricCharacterCount,
  lyricLinesOf,
  lyricSyllables,
  noteOnsets,
  syllableCount,
  unalignedLyricLines,
} from "./lyrics";
export { mount } from "./mount";
// The synth preview.
export type { PreviewNoteOptions } from "./preview-note";
export { previewNote } from "./preview-note";
export type { PreviewPlayer, PreviewStart } from "./preview-player";
export { previewPlayer } from "./preview-player";
export type { PreviewChordEvent, PreviewEvent, PreviewNoteEvent, PreviewSchedule } from "./preview-schedule";
export { schedulePreview } from "./preview-schedule";
export { mountProblemView } from "./problem-view";
export type {
  Bar,
  Chord,
  KeyChange,
  LyricLine,
  LyricPhrase,
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
export { mountSynthPreview } from "./synth-preview";
export { mountTextView } from "./text-view";
export { mountTimeRuler } from "./time-ruler";
export type {
  BooleanToolParameter,
  ChoiceToolParameter,
  CommandListResult,
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
export { applyCommandList, createToolRegistry, previewTool, validateToolParameters } from "./tool";
export type { ToolbarOptions } from "./toolbar";
export { mountToolbar } from "./toolbar";
export type {
  AxisPartOptions,
  ChordVocabulary,
  DialectConstraints,
  DraftStore,
  DraftStoreEntry,
  DraftWriteResult,
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
