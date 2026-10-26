// ABOUTME: The editing session: the song project, its undo history, the selection and the insertion point, and the UI state view parts share.
// ABOUTME: Headless: it touches no DOM, so it imports and runs in Node and in a Worker like the rest of the headless layer.

import { ZOOM_MAX, ZOOM_MIN } from "./arrangement";
import type { ScoreCommand } from "./commands";
import { type Grid, isGridAllowed, movedIds } from "./commands-notes";
import { isProjectCommand, type ProjectCommand } from "./commands-project";
import type { Diagnostic } from "./diagnostics";
import type { DialectRegistry, ScoreDialect } from "./dialect";
import { DEFAULT_GRID, normalizeGrid, sameGrid } from "./grid";
import type { Score, SongProject } from "./score";
import type { ScoreTool, ToolParameterValues, ToolResult } from "./tool";
import { applyCommandList, applyToolRequest, previewTool as computePreview, noDialectDiagnostic } from "./tool";
import type { Language } from "./types";

/** What reading the project's score came to: a score, or the reason there is none. */
export type ScoreReading =
  | { readonly kind: "score"; readonly score: Score }
  | { readonly kind: "unreadable"; readonly diagnostics: ReadonlyArray<Diagnostic> }
  | { readonly kind: "no-dialect"; readonly modelId: string };

/** Where a paste or an inserted bar lands: a position on the shared time axis, in ticks. */
export interface InsertionPoint {
  readonly tick: number;
}

/** The UI state that several view parts must show alike. It is not part of the document and not in the history. */
export interface ViewState {
  /** Zoom of the time axis; 1 is the host's beat width, and the range is 0.01 to 4. */
  readonly zoom: number;
  /** How far the time axis is scrolled to the left, in pixels at the current zoom. */
  readonly scrollLeft: number;
  /** The interface language of every part. */
  readonly language: Language;
  /**
   * Whether the user may change the score. Parts offer editing controls and accept selection and editing keys only while
   * it is true. It does not stop `dispatch`: whoever drives the session directly decides what it sends.
   */
  readonly editable: boolean;
}

/** The views of the default editor, in the order its switcher lists them. A host that draws its own switcher offers these. */
export const VIEW_NAMES = ["arrangement", "staff", "text"] as const;

/** Which view is shown: the arrangement of tracks, the staff drawn by abcjs, or the score text. */
export type ViewName = (typeof VIEW_NAMES)[number];

/** Text a view offered as the score that the session did not take, with what is wrong with it. UI state: not in the history. */
export interface RejectedText {
  readonly text: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export interface SessionOptions {
  /** The song project to edit. */
  project: SongProject;
  /** The score dialects the session can read and write, built by the host with `createDialectRegistry`. */
  dialects: DialectRegistry;
  /** The interface language of the parts bound to the session. Defaults to "en". */
  language?: Language;
  /** Whether the user may edit. Defaults to true; see `ViewState.editable`. */
  editable?: boolean;
  /** The view shown first. Defaults to "arrangement". */
  activeView?: ViewName;
  /** The grid the editing starts on. Defaults to 1/4. A value the editor does not offer is a RangeError. */
  grid?: Grid;
}

/**
 * What a dispatch came to. A refused command carries its diagnostics and the project it left untouched. A command the
 * session took can still carry notices (`isNoticeDiagnostic`): the project is changed and usable, and the notice says
 * something the user should know about it, such as a style without a BPM after a tempo change. A notice is not a refusal.
 */
export type DispatchResult =
  | { readonly ok: true; readonly project: SongProject; readonly diagnostics: ReadonlyArray<Diagnostic> }
  | { readonly ok: false; readonly project: SongProject; readonly diagnostics: ReadonlyArray<Diagnostic> };

/** What caused a change the session announces. */
export type SessionChangeCause =
  | "dispatch"
  | "undo"
  | "redo"
  | "select"
  | "insertion-point"
  | "view"
  | "replace"
  | "active-view"
  | "rejected-text"
  | "grid";

/**
 * One announced change: its cause, and which parts of the session's state it touched. A change of the shown view, of
 * the rejected text or of the grid touches none of the four booleans and is told by its cause alone.
 */
export interface SessionChange {
  readonly cause: SessionChangeCause;
  /** The song project (and with it the undo history) changed. */
  readonly project: boolean;
  readonly selection: boolean;
  readonly insertionPoint: boolean;
  /** The view state (zoom, scroll, language, editable) changed. */
  readonly view: boolean;
  /**
   * The project command a `"dispatch"` change was made by, so a log can tell a text typed into the score from the other
   * edits. Absent on every other change, and on a dispatch of a score command or a tool run: those are told by the
   * changed project alone.
   */
  readonly command?: ProjectCommand;
  /**
   * The grid that was dropped for the default because the project or the dialects no longer allow it. It is present on
   * the one change that dropped it, with `gridDropped` absent from every later change since the grid is then the
   * default already. A host can use it to say once what changed.
   */
  readonly gridDropped?: Grid;
}

export type SessionListener = (change: SessionChange) => void;

export interface EditingSession {
  /** The current song project: the one document the editor edits. */
  readonly project: SongProject;
  /** Whether `undo` has a project to go back to. */
  readonly canUndo: boolean;
  /** Whether `redo` has a project to go forward to. */
  readonly canRedo: boolean;
  /**
   * The project's score as its dialect reads it. Every view part draws from this one reading, which stays the
   * same object until the score text, the model or the dialects change.
   */
  readonly reading: ScoreReading;
  /**
   * The dialect that reads the project's model, or undefined when the registry has none. It is how a control learns what
   * the dialect allows (`dialect.constraints`) and how a panel asks what the project carries (`checkProject`). It follows
   * `replaceDialects` and a project of another model.
   */
  readonly dialect: ScoreDialect | undefined;
  /**
   * The ids of the selected notes. The selection is UI state: it is not in the history. An id that names no note of
   * the current score is dropped, so the selection always names notes that exist.
   */
  readonly selection: ReadonlyArray<string>;
  /** The insertion point, or null when none is set. UI state: not in the history. */
  readonly insertionPoint: InsertionPoint | null;
  /** The view state: zoom, horizontal scroll, language and whether the user may edit, shared by every part bound to the session. */
  readonly view: ViewState;
  /**
   * Which view is shown. UI state like the selection: not in the history and not a field of `view`. The default editor shows
   * this view; a host that lays its own views out reads it to show the same one, or sets it from its own switcher.
   */
  readonly activeView: ViewName;
  /**
   * Text the text view holds that the session did not take, because it cannot be read; null while the text view holds
   * nothing of the kind. While there is some, the project keeps the last readable score and the views that draw it are
   * stale. A change of the project drops it, since the text view then shows the project's score again.
   */
  readonly rejectedText: RejectedText | null;
  /**
   * The time grid that notes move, resize and land on, and that the insertion point steps by. UI state of the session
   * like the selection: not in the project and not in the history. It starts at 1/4.
   */
  readonly grid: Grid;
  /**
   * Applies one command to the project, as one step of the history. A refused command changes nothing and returns its
   * diagnostics; a command that leaves the project as it was adds no step and announces nothing. A command that comes
   * back with notices only is taken: the project changes as one step, and the result is `ok` with the notices in
   * `diagnostics`.
   */
  dispatch(command: ScoreCommand | ProjectCommand): DispatchResult;
  /**
   * Applies a list of commands as one step of the history, through the same path as `dispatch`: all of them apply, in
   * order, or none does, and the listeners hear one change. It is how a gesture that needs several commands, such as
   * dragging a boundary two lyric lines share, stays one undo. A notice does not stop the list, and the notices of the
   * steps that were taken come back once each; any other diagnostic refuses all of it. An empty list, or one that leaves
   * the project as it was, adds no step.
   */
  dispatchAll(commands: ReadonlyArray<ScoreCommand | ProjectCommand>): DispatchResult;
  /**
   * What `dispatch` of `replaceScoreText` with `text` would say, without changing or announcing anything: the
   * diagnostics it would be refused with, the notices it would be taken with, and none when it would take the text
   * plainly. `isNoticeDiagnostic` tells the two apart; a result with no other diagnostic is a text the session takes. The
   * check is that command's own path, the song-project rules included, so the two cannot disagree.
   */
  checkScoreText(text: string): ReadonlyArray<Diagnostic>;
  /**
   * Runs a tool on the session: validates its parameters, builds its commands, and applies all of them as one history
   * step through the same command path as `dispatch`. One failing step refuses the whole run and leaves project and
   * history unchanged. A step that comes back with a notice does not fail the run: the run is `ok` and carries the
   * notices, each once.
   */
  runTool(tool: ScoreTool, values?: ToolParameterValues): ToolResult;
  /** The project a tool would make from the current project and selection, without changing or announcing anything. */
  previewTool(tool: ScoreTool, values?: ToolParameterValues): ToolResult;
  /** Selects exactly these notes. Ids that name no note are left out. */
  select(noteIds: ReadonlyArray<string>): void;
  /** Puts the insertion point at `point`, or removes it with null. A tick must be a whole number, zero or more. */
  setInsertionPoint(point: InsertionPoint | null): void;
  /** Shows another view. Throws a RangeError for a name that is not in `VIEW_NAMES`. */
  setActiveView(name: ViewName): void;
  /** Says which text the text view holds that was not taken, or that it holds none (null). Does nothing when the text is the same. */
  setRejectedText(next: RejectedText | null): void;
  /**
   * Sets the grid. A value the editor does not offer is a RangeError. It does not ask the score: a grid the score cannot
   * write is refused by the note commands with `grid-not-allowed`, and `allowsGrid` says beforehand.
   */
  setGrid(grid: Grid): void;
  /**
   * Whether the score the session reads can be edited on this grid: the check the note commands make, run once for a
   * control to ask. False while the score cannot be read.
   */
  allowsGrid(grid: Grid): boolean;
  /** Changes the view state by the keys given. Zoom is kept within its range, scroll at zero or more. */
  setView(patch: Partial<ViewState>): void;
  /**
   * Replaces the project from outside, as a host does with new data. This starts a new document: the history, the
   * selection and the insertion point go, and the view state stays. Does nothing when every field is the same.
   */
  replaceProject(next: SongProject): void;
  /** Reads the project with other dialects. The history stays. Does nothing for the registry already in use. */
  replaceDialects(next: DialectRegistry): void;
  /** Goes back to the project before the last applied command. False, and nothing changes, when there is none. */
  undo(): boolean;
  /** Goes forward again after an `undo`. False, and nothing changes, when there is nothing to redo. */
  redo(): boolean;
  /**
   * Calls `listener` after every change, in the order listeners subscribed. A change a listener causes is announced
   * after the current one has reached every listener. A listener that throws does not reach the caller of the change:
   * its error goes to `reportError`, or is rethrown in a microtask where there is none. Returns the function that
   * unsubscribes it.
   */
  subscribe(listener: SessionListener): () => void;
}

/** Every field counts, so a field added to the project later is compared without a change here. */
function sameProject(a: SongProject, b: SongProject): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof SongProject>;
  for (const key of keys) if (!Object.is(a[key], b[key])) return false;
  return true;
}

/** A listener's failure must not reach the caller of a change that is already applied, so it is reported apart. */
function reportListenerError(error: unknown): void {
  if (typeof reportError === "function") {
    reportError(error);
    return;
  }
  queueMicrotask(() => {
    throw error;
  });
}

function startingGrid(grid: Grid | undefined): Grid {
  if (grid === undefined) return DEFAULT_GRID;
  const normal = normalizeGrid(grid);
  if (normal === null) throw new RangeError("The grid is not one the editor offers.");
  return normal;
}

export function createEditingSession(options: SessionOptions): EditingSession {
  let project = options.project;
  /** The history keeps whole song projects, oldest first; the current project is in neither list. */
  const past: SongProject[] = [];
  const future: SongProject[] = [];
  let dialects = options.dialects;
  let selection: ReadonlyArray<string> = [];
  let insertionPoint: InsertionPoint | null = null;
  let activeView: ViewName = options.activeView ?? "arrangement";
  let rejectedText: RejectedText | null = null;
  let grid: Grid = startingGrid(options.grid);
  let view: ViewState = {
    zoom: 1,
    scrollLeft: 0,
    language: options.language ?? "en",
    editable: options.editable ?? true,
  };
  let cached: { modelId: string; score: string; dialects: DialectRegistry; reading: ScoreReading } | null = null;
  const listeners: Array<{ call: SessionListener; active: boolean }> = [];
  const queue: SessionChange[] = [];
  let delivering = false;

  function announce(cause: SessionChangeCause, touched: Partial<Omit<SessionChange, "cause">>): void {
    queue.push({ cause, project: false, selection: false, insertionPoint: false, view: false, ...touched });
    if (delivering) return;
    delivering = true;
    try {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        for (const listener of [...listeners]) {
          if (!listener.active) continue;
          try {
            listener.call(next);
          } catch (error) {
            reportListenerError(error);
          }
        }
      }
    } finally {
      delivering = false;
    }
  }

  /** Runs `found` with the dialect of the project's model, or `missing` when the registry has none for it. */
  function withDialect<T>(found: (dialect: ScoreDialect) => T, missing: (modelId: string) => T): T {
    const dialect = dialects.find(project.modelId);
    return dialect ? found(dialect) : missing(project.modelId);
  }

  function read(): ScoreReading {
    if (cached?.modelId === project.modelId && cached.score === project.score && cached.dialects === dialects) {
      return cached.reading;
    }
    const reading = withDialect<ScoreReading>(
      (dialect) => {
        const { score, diagnostics } = dialect.parse(project.score);
        return score ? { kind: "score", score } : { kind: "unreadable", diagnostics };
      },
      (modelId) => ({ kind: "no-dialect", modelId }),
    );
    cached = { modelId: project.modelId, score: project.score, dialects, reading };
    return reading;
  }

  function idsStillInScore(ids: ReadonlyArray<string>): string[] {
    const reading = read();
    if (reading.kind !== "score") return [];
    const known = new Set(reading.score.notes.map((note) => note.id));
    return [...new Set(ids)].filter((id) => known.has(id));
  }

  function sameIds(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
    return a.length === b.length && a.every((id, at) => id === b[at]);
  }

  /**
   * Leaves the grid in force when the score can write it, and otherwise puts the default grid in force and returns the
   * one it dropped. A score that cannot be read says nothing about what it can write, so the grid stays. The default
   * itself is never dropped again: it is the grid the session goes back to, whether or not this score can write it.
   */
  function droppedGrid(): Grid | undefined {
    const found = read();
    if (found.kind !== "score" || sameGrid(grid, DEFAULT_GRID)) return undefined;
    const allowed = withDialect(
      (dialect) => isGridAllowed(found.score, grid, dialect.constraints),
      () => true,
    );
    if (allowed) return undefined;
    const dropped = grid;
    grid = DEFAULT_GRID;
    return dropped;
  }

  /**
   * `following` is the selection to keep, when the change moved the notes it names to ids of their own; it replaces the
   * current selection before ids that name no note are dropped.
   */
  function projectChanged(
    cause: SessionChangeCause,
    command?: ProjectCommand,
    following?: ReadonlyArray<string>,
  ): void {
    const kept = idsStillInScore(following ?? selection);
    const selectionChanged = !sameIds(kept, selection);
    selection = kept;
    rejectedText = null;
    const gridDropped = droppedGrid();
    announce(cause, {
      project: true,
      selection: selectionChanged,
      ...(command === undefined ? {} : { command }),
      ...(gridDropped === undefined ? {} : { gridDropped }),
    });
  }

  /**
   * The selection a move or a resize leaves: the notes it named are found again by their new ids, which are their new
   * starts. Undefined for every other command, which keeps the selection as ids that still name a note.
   */
  function followedSelection(commands: ReadonlyArray<ScoreCommand | ProjectCommand>): string[] | undefined {
    const only = commands[0];
    const reading = read();
    if (commands.length !== 1 || only === undefined || reading.kind !== "score") return undefined;
    if (only.type !== "moveNotes" && only.type !== "resizeNotes") return undefined;
    const moved = movedIds(reading.score, only);
    return [...new Set(selection.map((id) => moved.get(id) ?? id))];
  }

  /** The selections around a step that moved notes, so an undo and a redo put the selection back with the notes. */
  const selectionBefore = new WeakMap<SongProject, ReadonlyArray<string>>();
  const selectionAfter = new WeakMap<SongProject, ReadonlyArray<string>>();

  function commit(
    next: SongProject,
    cause: SessionChangeCause,
    command?: ProjectCommand,
    following?: ReadonlyArray<string>,
  ): void {
    if (following !== undefined) {
      selectionBefore.set(project, selection);
      selectionAfter.set(next, following);
    }
    past.push(project);
    future.length = 0;
    project = next;
    projectChanged(cause, command, following);
  }

  /** The one path a list of commands takes into the history: all apply, or none does. */
  function applyCommands(
    commands: ReadonlyArray<ScoreCommand | ProjectCommand>,
    named?: ProjectCommand,
  ): DispatchResult {
    return withDialect<DispatchResult>(
      (dialect) => {
        const following = followedSelection(commands);
        const applied = applyCommandList(dialect, project, commands);
        if (!applied.ok) return { ok: false, project, diagnostics: applied.diagnostics };
        if (!sameProject(project, applied.project)) commit(applied.project, "dispatch", named, following);
        return { ok: true, project, diagnostics: applied.diagnostics };
      },
      (modelId) => ({ ok: false, project, diagnostics: [noDialectDiagnostic(modelId)] }),
    );
  }

  return {
    get project() {
      return project;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    get reading() {
      return read();
    },
    get dialect() {
      return dialects.find(project.modelId);
    },
    get selection() {
      return selection;
    },
    replaceProject(next) {
      if (sameProject(project, next)) return;
      const hadSelection = selection.length > 0;
      const hadInsertionPoint = insertionPoint !== null;
      past.length = 0;
      future.length = 0;
      project = next;
      selection = [];
      insertionPoint = null;
      rejectedText = null;
      const gridDropped = droppedGrid();
      announce("replace", {
        project: true,
        selection: hadSelection,
        insertionPoint: hadInsertionPoint,
        ...(gridDropped === undefined ? {} : { gridDropped }),
      });
    },
    replaceDialects(next) {
      if (next === dialects) return;
      dialects = next;
      projectChanged("replace");
    },
    get view() {
      return view;
    },
    setView(patch) {
      const zoom =
        patch.zoom !== undefined && Number.isFinite(patch.zoom)
          ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, patch.zoom))
          : view.zoom;
      const scrollLeft =
        patch.scrollLeft !== undefined && Number.isFinite(patch.scrollLeft)
          ? Math.max(0, patch.scrollLeft)
          : view.scrollLeft;
      const language = patch.language ?? view.language;
      const editable = patch.editable ?? view.editable;
      if (
        zoom === view.zoom &&
        scrollLeft === view.scrollLeft &&
        language === view.language &&
        editable === view.editable
      ) {
        return;
      }
      view = { zoom, scrollLeft, language, editable };
      announce("view", { view: true });
    },
    get insertionPoint() {
      return insertionPoint;
    },
    get activeView() {
      return activeView;
    },
    setActiveView(name) {
      if (!VIEW_NAMES.includes(name)) throw new RangeError(`No view is called "${String(name)}".`);
      if (name === activeView) return;
      activeView = name;
      announce("active-view", {});
    },
    get rejectedText() {
      return rejectedText;
    },
    setRejectedText(next) {
      if (next === null ? rejectedText === null : rejectedText?.text === next.text) return;
      rejectedText = next;
      announce("rejected-text", {});
    },
    get grid() {
      return grid;
    },
    setGrid(next) {
      const normal = normalizeGrid(next);
      if (normal === null) throw new RangeError("The grid is not one the editor offers.");
      if (sameGrid(normal, grid)) return;
      grid = normal;
      announce("grid", {});
    },
    allowsGrid(candidate) {
      const found = read();
      if (found.kind !== "score") return false;
      return withDialect(
        (dialect) => isGridAllowed(found.score, candidate, dialect.constraints),
        () => false,
      );
    },
    checkScoreText(text) {
      return withDialect<ReadonlyArray<Diagnostic>>(
        (dialect) => applyCommandList(dialect, project, [{ type: "replaceScoreText", text }]).diagnostics,
        (modelId) => [noDialectDiagnostic(modelId)],
      );
    },
    setInsertionPoint(point) {
      if (point !== null && !(Number.isInteger(point.tick) && point.tick >= 0)) {
        throw new RangeError("The insertion point must be a whole number of ticks, zero or more.");
      }
      if (point?.tick === insertionPoint?.tick) return;
      insertionPoint = point === null ? null : { tick: point.tick };
      announce("insertion-point", { insertionPoint: true });
    },
    select(noteIds) {
      const next = idsStillInScore(noteIds);
      if (sameIds(next, selection)) return;
      selection = next;
      announce("select", { selection: true });
    },
    dispatch(command) {
      return applyCommands([command], isProjectCommand(command) ? command : undefined);
    },
    dispatchAll(commands) {
      return applyCommands(commands);
    },
    runTool(tool, values = {}) {
      const result = applyToolRequest(tool, { project, selection, values }, dialects);
      if (result.ok && !sameProject(project, result.project)) commit(result.project, "dispatch");
      return result;
    },
    previewTool(tool, values = {}) {
      return computePreview(tool, project, selection, values, dialects);
    },
    undo() {
      const previous = past.pop();
      if (previous === undefined) return false;
      future.push(project);
      project = previous;
      projectChanged("undo", undefined, selectionBefore.get(previous));
      return true;
    },
    redo() {
      const next = future.pop();
      if (next === undefined) return false;
      past.push(project);
      project = next;
      projectChanged("redo", undefined, selectionAfter.get(next));
      return true;
    },
    subscribe(call) {
      const listener = { call, active: true };
      listeners.push(listener);
      return () => {
        listener.active = false;
        const at = listeners.indexOf(listener);
        if (at >= 0) listeners.splice(at, 1);
      };
    },
  };
}
