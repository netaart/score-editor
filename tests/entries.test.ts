// ABOUTME: Imports both published package entries in a plain node environment.
// ABOUTME: Guards the rule that makes server-side imports in host apps safe: no side effects, no DOM at import time.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type {
  ApplyProjectResult,
  ApplyScoreResult,
  AxisPartOptions,
  Bar,
  BooleanToolParameter,
  ChangeLogEntry,
  ChoiceToolParameter,
  Chord,
  ChordChoices,
  ChordLetter,
  ChordNameParts,
  ChordSlot,
  ChordVocabulary,
  CommandDiagnosticCode,
  CommandListResult,
  Diagnostic,
  DiagnosticAt,
  DiagnosticCode,
  DiagnosticParams,
  DialectConstraints,
  DialectRegistry,
  DispatchResult,
  DraftHandoffResult,
  DraftKeeper,
  DraftKeeperChange,
  DraftKeeperOptions,
  DraftKeeperStatus,
  DraftProject,
  DraftStore,
  DraftStoreEntry,
  DraftWriteResult,
  DurationSet,
  EditingInput,
  EditingInputResult,
  EditingSession,
  Grid,
  GridValue,
  InsertionPoint,
  KeyChange,
  Language,
  LyricAlignment,
  LyricBoundaryDrag,
  LyricBoundaryMove,
  LyricBoundaryPlan,
  LyricDrop,
  LyricDropPlan,
  LyricEdge,
  LyricLine,
  LyricPhrase,
  LyricRow,
  LyricSplit,
  LyricSyllableNote,
  Meter,
  MeterRule,
  MountedEditor,
  MountOptions,
  MoveNotesCommand,
  MoveResizeCommand,
  Note,
  NoteFilter,
  Notice,
  NoticeCode,
  NoticeDiagnosticCode,
  NumberToolParameter,
  ParseResult,
  PreviewChordEvent,
  PreviewEvent,
  PreviewNoteEvent,
  PreviewNoteOptions,
  PreviewPlayer,
  PreviewSchedule,
  PreviewStart,
  ProjectCommand,
  ProjectPanel,
  ReadingDiagnosticCode,
  RejectedText,
  ResizeNotesCommand,
  Score,
  ScoreCommand,
  ScoreDialect,
  ScoreDraft,
  ScoreReading,
  ScoreTool,
  Section,
  SessionChange,
  SessionChangeCause,
  SessionListener,
  SessionOptions,
  SongProject,
  SourceLabelOptions,
  SourceLabelPart,
  StaffViewPart,
  Tempo,
  TextToolParameter,
  ToolbarOptions,
  ToolCommandBuilder,
  ToolParameter,
  ToolParameterCheck,
  ToolParameterValue,
  ToolParameterValues,
  ToolRegistry,
  ToolResult,
  ToolText,
  Truncation,
  ViewName,
  ViewPart,
  ViewState,
  VocalRange,
  VoiceTrackOptions,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

/**
 * Every type export of `@neta-art/score-editor` at v0.2.0. Renaming or removing one stops this file compiling.
 */
type V020EditorTypes = [
  ApplyProjectResult,
  ApplyScoreResult,
  AxisPartOptions,
  Bar,
  BooleanToolParameter,
  ChoiceToolParameter,
  Chord,
  ChordChoices,
  ChordLetter,
  ChordNameParts,
  ChordSlot,
  ChordVocabulary,
  CommandDiagnosticCode,
  CommandListResult,
  Diagnostic,
  DiagnosticAt,
  DiagnosticCode,
  DiagnosticParams,
  DialectConstraints,
  DialectRegistry,
  DispatchResult,
  DraftHandoffResult,
  DraftKeeper,
  DraftKeeperChange,
  DraftKeeperOptions,
  DraftKeeperStatus,
  DraftProject,
  DraftStore,
  DraftStoreEntry,
  DraftWriteResult,
  DurationSet,
  EditingInput,
  EditingInputResult,
  EditingSession,
  Grid,
  GridValue,
  InsertionPoint,
  KeyChange,
  Language,
  LyricAlignment,
  LyricBoundaryDrag,
  LyricBoundaryMove,
  LyricBoundaryPlan,
  LyricDrop,
  LyricDropPlan,
  LyricEdge,
  LyricLine,
  LyricPhrase,
  LyricRow,
  LyricSplit,
  LyricSyllableNote,
  Meter,
  MeterRule,
  MountOptions,
  MountedEditor,
  MoveNotesCommand,
  MoveResizeCommand,
  Note,
  NoteFilter,
  Notice,
  NoticeCode,
  NoticeDiagnosticCode,
  NumberToolParameter,
  ParseResult,
  PreviewChordEvent,
  PreviewEvent,
  PreviewNoteEvent,
  PreviewNoteOptions,
  PreviewPlayer,
  PreviewSchedule,
  PreviewStart,
  ProjectCommand,
  ProjectPanel,
  ReadingDiagnosticCode,
  RejectedText,
  ResizeNotesCommand,
  Score,
  ScoreCommand,
  ScoreDialect,
  ScoreDraft,
  ScoreReading,
  ScoreTool,
  Section,
  SessionChange,
  SessionChangeCause,
  SessionListener,
  SessionOptions,
  SongProject,
  StaffViewPart,
  Tempo,
  TextToolParameter,
  ToolCommandBuilder,
  ToolParameter,
  ToolParameterCheck,
  ToolParameterValue,
  ToolParameterValues,
  ToolRegistry,
  ToolResult,
  ToolText,
  ToolbarOptions,
  Truncation,
  ViewName,
  ViewPart,
  ViewState,
  VoiceTrackOptions,
];

describe("package entries in a node environment", () => {
  it("runs where there is no DOM or browser global to touch", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
  });

  it("imports the editor entry", async () => {
    const editor = await import("@neta-art/score-editor");
    expect(typeof editor.mount).toBe("function");
  });

  it("exports the editing session and every view part, and keeps what 0.1.0 exported", async () => {
    const editor = await import("@neta-art/score-editor");
    const functions = [
      "createEditingSession",
      "filterNotes",
      "handleEditingInput",
      "mountChordTrack",
      "mountCutNotice",
      "mountFilterPanel",
      "mountProblemView",
      "mountStaffView",
      "mountStaleNotice",
      "mountTextView",
      "mountTimeRuler",
      "mountToolbar",
      "mountViewSwitch",
      "mountVoiceTrack",
      "mountZoomControl",
      "mountSourceLabel",
      "changeLogEntries",
      "preHandoffNotices",
      "vocalRange",
      "createDraftKeeper",
      "contentHash",
      "draftText",
      "readDraft",
      "applyCommandList",
      // What 0.1.0 exported.
      "mount",
      "applyProjectCommand",
      "applyScoreCommand",
      "createDialectRegistry",
      "formatDiagnostic",
      "noteId",
    ];
    for (const name of functions) expect(typeof editor[name as keyof typeof editor], name).toBe("function");
    expect(typeof editor.TICKS_PER_QUARTER).toBe("number");
    expect(typeof editor.DRAFT_FORMAT_VERSION).toBe("number");
    expect([...editor.NOTICE_CODES]).toEqual([
      "command-refused",
      "draft-source-changed",
      "draft-save-failed",
      "score-save-failed",
      "score-load-failed",
      "handoff-not-sent",
      "prehandoff-no-sections",
      "prehandoff-syllables-far",
      "prehandoff-vocal-range",
      "prehandoff-melody-chords",
    ]);
    expect(Array.isArray(editor.COMMAND_DIAGNOSTIC_CODES)).toBe(true);
  });

  it("keeps every type export of 0.2.0", () => {
    const kept: V020EditorTypes | null = null;
    expect(kept).toBeNull();
  });

  it("exports the App-05 types", () => {
    const kept: [ChangeLogEntry, SourceLabelOptions, SourceLabelPart, VocalRange] | null = null;
    expect(kept).toBeNull();
  });

  it("keeps every runtime export of 0.2.0", async () => {
    const editor = await import("@neta-art/score-editor");
    const editorValues = [
      "COMMAND_DIAGNOSTIC_CODES",
      "DRAFT_FORMAT_VERSION",
      "LYRICS_MAX_CHARACTERS",
      "NOTICE_CODES",
      "NOTICE_DIAGNOSTIC_CODES",
      "READING_DIAGNOSTIC_CODES",
      "TICKS_PER_QUARTER",
      "VIEW_NAMES",
      "alignLyricLine",
      "alignedLyricLines",
      "applyCommandList",
      "applyProjectCommand",
      "applyScoreCommand",
      "barLineTick",
      "checkProject",
      "chordChoices",
      "chordSlots",
      "contentHash",
      "createDialectRegistry",
      "createDraftKeeper",
      "createEditingSession",
      "createToolRegistry",
      "draftText",
      "filterNotes",
      "formatDiagnostic",
      "handleEditingInput",
      "isNoticeDiagnostic",
      "joinLyrics",
      "layoutLyrics",
      "lyricBoundaryPlan",
      "lyricCharacterCount",
      "lyricDropPlan",
      "lyricLinesOf",
      "lyricRows",
      "lyricSplitCommand",
      "lyricSyllables",
      "mount",
      "mountChordTrack",
      "mountCutNotice",
      "mountDraftConflict",
      "mountFilterPanel",
      "mountLyricTrack",
      "mountProblemView",
      "mountProjectPanel",
      "mountStaffView",
      "mountStaleNotice",
      "mountSynthPreview",
      "mountTextView",
      "mountTimeRuler",
      "mountToolbar",
      "mountViewSwitch",
      "mountVoiceTrack",
      "mountZoomControl",
      "nearestChordSlot",
      "noteId",
      "noteOnsets",
      "previewNote",
      "previewPlayer",
      "previewTool",
      "readDraft",
      "schedulePreview",
      "splitChordName",
      "syllableCount",
      "tickAtSeconds",
      "unalignedLyricLines",
      "validateToolParameters",
    ] as const;
    for (const name of editorValues) expect(name in editor, name).toBe(true);

    const dialect = await import("@neta-art/score-dialect-song2");
    const dialectValues = ["song2Constraints", "song2Dialect", "song2Id"] as const;
    for (const name of dialectValues) expect(name in dialect, name).toBe(true);
  });

  it("refuses to mount a view part without a DOM instead of failing obscurely", async () => {
    const {
      createDialectRegistry,
      createEditingSession,
      mountFilterPanel,
      mountStaffView,
      mountStaleNotice,
      mountTextView,
      mountTimeRuler,
      mountToolbar,
      mountViewSwitch,
      mountZoomControl,
    } = await import("@neta-art/score-editor");
    const project = {
      style: "",
      lyrics: "",
      score: "",
      scoreMode: "full",
      seed: null,
      modelId: "song2",
      sourceKey: "n",
    } as const;
    const session = createEditingSession({ project, dialects: createDialectRegistry([]) });
    expect(() => mountTimeRuler({} as HTMLElement, session)).toThrow(/browser/i);
    expect(() => mountFilterPanel({} as HTMLElement, session)).toThrow(/browser/i);
    expect(() => mountToolbar({} as HTMLElement, session)).toThrow(/browser/i);
    expect(() => mountZoomControl({} as HTMLElement, session)).toThrow(/browser/i);
    expect(() => mountStaffView({} as HTMLElement, session)).toThrow(/browser/i);
    expect(() => mountStaleNotice({} as HTMLElement, session)).toThrow(/browser/i);
    expect(() => mountTextView({} as HTMLElement, session)).toThrow(/browser/i);
    expect(() => mountViewSwitch({} as HTMLElement, session)).toThrow(/browser/i);
  });

  it("imports the song2 dialect entry", async () => {
    const dialect = await import("@neta-art/score-dialect-song2");
    expect(dialect.song2Id).toBe("song2");
  });

  it("refuses to mount without a DOM instead of failing obscurely", async () => {
    const { createDialectRegistry, mount } = await import("@neta-art/score-editor");
    const project = {
      style: "",
      lyrics: "",
      score: "",
      scoreMode: "full",
      seed: null,
      modelId: "song2",
      sourceKey: "node-test",
    } as const;
    const options = { language: "en", project, dialects: createDialectRegistry([]) } as const;
    expect(() => mount({} as HTMLElement, options)).toThrow(/browser/i);
  });
});

describe("abcjs stays out of the entries", () => {
  const root = new URL("../", import.meta.url);
  const entries = ["packages/score-editor/dist/index.js", "packages/score-dialect-song2/dist/index.js"].map(
    (path) => new URL(path, root).href,
  );
  const abcjs = pathToFileURL(createRequire(new URL("packages/score-editor/package.json", root)).resolve("abcjs")).href;

  /**
   * A plain Node process, with no DOM, imports the built entries and then abcjs itself, and reports how many files of
   * abcjs the CommonJS loader holds after each. Where nothing is shared with this test, the entries are loaded as a server
   * loads them, and the second figure shows the check can see abcjs when it is loaded.
   */
  function modulesOfAbcjsSeen(): { afterEntries: number; afterAbcjs: number } {
    const script = `
      import { createRequire } from "node:module";
      const loaded = createRequire(import.meta.url).cache;
      const seen = () => Object.keys(loaded).filter((file) => /[\\\\/]abcjs[\\\\/]/.test(file)).length;
      for (const entry of ${JSON.stringify(entries)}) await import(entry);
      const afterEntries = seen();
      await import(${JSON.stringify(abcjs)});
      console.log(JSON.stringify({ afterEntries, afterAbcjs: seen() }));
    `;
    return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" }));
  }

  it("is not loaded by importing either package entry, which only a view part's mount asks for", () => {
    const { afterEntries, afterAbcjs } = modulesOfAbcjsSeen();

    expect(afterAbcjs, "the check can see abcjs when it is loaded").toBeGreaterThan(0);
    expect(afterEntries).toBe(0);
  }, 20_000);
});
