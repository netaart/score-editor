// ABOUTME: The editing session: the song project, its undo history, the selection and the insertion point, and the UI state view parts share.
// ABOUTME: Headless: it touches no DOM, so it imports and runs in Node and in a Worker like the rest of the headless layer.
import { applyProjectCommand } from "./apply";
import type { ScoreCommand } from "./commands";
import type { Diagnostic } from "./diagnostics";
import type { DialectRegistry } from "./dialect";
import type { Score, SongProject } from "./score";

/** What reading the project's score came to: a score, or the reason there is none. */
export type ScoreReading =
  | { readonly kind: "score"; readonly score: Score }
  | { readonly kind: "unreadable"; readonly diagnostics: ReadonlyArray<Diagnostic> }
  | { readonly kind: "no-dialect"; readonly modelId: string };

/** Where a paste or an inserted bar lands: a position on the shared time axis, in ticks. */
export interface InsertionPoint {
  readonly tick: number;
}

export interface SessionOptions {
  /** The song project to edit. */
  project: SongProject;
  /** The score dialects the session can read and write, built by the host with `createDialectRegistry`. */
  dialects: DialectRegistry;
}

/** What a dispatch came to. A refused command carries its diagnostics and the project it left untouched. */
export type DispatchResult =
  | { readonly ok: true; readonly project: SongProject; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly project: SongProject; readonly diagnostics: ReadonlyArray<Diagnostic> };

/** What caused a change the session announces. */
export type SessionChangeCause = "dispatch" | "undo" | "redo" | "select" | "insertion-point";

/** One announced change: its cause, and which parts of the session's state it touched. */
export interface SessionChange {
  readonly cause: SessionChangeCause;
  /** The song project (and with it the undo history) changed. */
  readonly project: boolean;
  readonly selection: boolean;
  readonly insertionPoint: boolean;
  /** The view state (zoom, scroll, language) changed. */
  readonly view: boolean;
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
   * The ids of the selected notes. The selection is UI state: it is not in the history. An id that names no note of
   * the current score is dropped, so the selection always names notes that exist.
   */
  readonly selection: ReadonlyArray<string>;
  /** The insertion point, or null when none is set. UI state: not in the history. */
  readonly insertionPoint: InsertionPoint | null;
  /** Applies one command to the project. A refused command changes nothing and returns its diagnostics. */
  dispatch(command: ScoreCommand): DispatchResult;
  /** Selects exactly these notes. Ids that name no note are left out. */
  select(noteIds: ReadonlyArray<string>): void;
  /** Puts the insertion point at `point`, or removes it with null. A tick must be a whole number, zero or more. */
  setInsertionPoint(point: InsertionPoint | null): void;
  /** Goes back to the project before the last applied command. False, and nothing changes, when there is none. */
  undo(): boolean;
  /** Goes forward again after an `undo`. False, and nothing changes, when there is nothing to redo. */
  redo(): boolean;
  /**
   * Calls `listener` after every change, in the order listeners subscribed. A change a listener causes is announced
   * after the current one has reached every listener. Returns the function that unsubscribes it.
   */
  subscribe(listener: SessionListener): () => void;
}

export function createEditingSession(options: SessionOptions): EditingSession {
  let project = options.project;
  /** The history keeps whole song projects, oldest first; the current project is in neither list. */
  const past: SongProject[] = [];
  const future: SongProject[] = [];
  const { dialects } = options;
  let selection: ReadonlyArray<string> = [];
  let insertionPoint: InsertionPoint | null = null;
  let cached: { modelId: string; score: string; reading: ScoreReading } | null = null;
  const listeners: Array<{ call: SessionListener; active: boolean }> = [];
  const queue: SessionChange[] = [];
  let delivering = false;

  function announce(change: SessionChange): void {
    queue.push(change);
    if (delivering) return;
    delivering = true;
    let failure: { error: unknown } | null = null;
    try {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        for (const listener of [...listeners]) {
          if (!listener.active) continue;
          try {
            listener.call(next);
          } catch (error) {
            failure ??= { error };
          }
        }
      }
    } finally {
      delivering = false;
    }
    if (failure) throw failure.error;
  }

  function read(): ScoreReading {
    if (cached?.modelId === project.modelId && cached.score === project.score) return cached.reading;
    const dialect = dialects.find(project.modelId);
    let reading: ScoreReading;
    if (!dialect) {
      reading = { kind: "no-dialect", modelId: project.modelId };
    } else {
      const { score, diagnostics } = dialect.parse(project.score);
      reading = score ? { kind: "score", score } : { kind: "unreadable", diagnostics };
    }
    cached = { modelId: project.modelId, score: project.score, reading };
    return reading;
  }

  /** The ids of `ids` that name a note of the current score, once each, in the order given. */
  function existing(ids: ReadonlyArray<string>): string[] {
    const reading = read();
    if (reading.kind !== "score") return [];
    const known = new Set(reading.score.notes.map((note) => note.id));
    return [...new Set(ids)].filter((id) => known.has(id));
  }

  function sameIds(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
    return a.length === b.length && a.every((id, at) => id === b[at]);
  }

  /** Announces that the project changed, and that the selection with it when notes it named are gone. */
  function projectChanged(cause: SessionChangeCause): void {
    const kept = existing(selection);
    const selectionChanged = !sameIds(kept, selection);
    selection = kept;
    announce({ cause, project: true, selection: selectionChanged, insertionPoint: false, view: false });
  }

  /** Makes `next` the current project as a new step of the history. */
  function commit(next: SongProject, cause: SessionChangeCause): void {
    past.push(project);
    future.length = 0;
    project = next;
    projectChanged(cause);
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
    get selection() {
      return selection;
    },
    get insertionPoint() {
      return insertionPoint;
    },
    setInsertionPoint(point) {
      if (point !== null && !(Number.isInteger(point.tick) && point.tick >= 0)) {
        throw new RangeError("The insertion point must be a whole number of ticks, zero or more.");
      }
      if (point?.tick === insertionPoint?.tick) return;
      insertionPoint = point === null ? null : { tick: point.tick };
      announce({ cause: "insertion-point", project: false, selection: false, insertionPoint: true, view: false });
    },
    select(noteIds) {
      const next = existing(noteIds);
      if (sameIds(next, selection)) return;
      selection = next;
      announce({ cause: "select", project: false, selection: true, insertionPoint: false, view: false });
    },
    dispatch(command) {
      const dialect = dialects.find(project.modelId);
      if (!dialect) {
        return {
          ok: false,
          project,
          diagnostics: [{ code: "no-dialect", params: { modelId: project.modelId }, at: {} }],
        };
      }
      const applied = applyProjectCommand(dialect, project, command);
      if (applied.diagnostics.length > 0) return { ok: false, project, diagnostics: applied.diagnostics };
      commit(applied.project, "dispatch");
      return { ok: true, project, diagnostics: [] };
    },
    undo() {
      const previous = past.pop();
      if (previous === undefined) return false;
      future.push(project);
      project = previous;
      projectChanged("undo");
      return true;
    },
    redo() {
      const next = future.pop();
      if (next === undefined) return false;
      past.push(project);
      project = next;
      projectChanged("redo");
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
