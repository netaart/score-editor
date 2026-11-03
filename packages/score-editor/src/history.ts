// ABOUTME: The history's step records and the batch rules: who made an edit, which batch it belongs to, and which steps a batch undo reaches.
// ABOUTME: Pure and headless. The editing session keeps the stacks; this file says what a step records and what a batch undo takes back.
import type { SongProject } from "./score";

/** Who made an edit, the batch of the agent run it belongs to, and one sentence about it. Every field is optional. */
export interface EditOrigin {
  /** Who made the edit: a person is "user", an agent is the name it goes by. Defaults to "user". */
  readonly author?: string;
  /** The batch the edit belongs to. One agent run is one batch. Absent for an edit that belongs to none. */
  readonly batch?: string;
  /** One sentence about the edit, for whoever reads the history. Defaults to the empty text. */
  readonly note?: string;
}

/** One step of the history as the session records it: who made it, its batch when it has one, and its sentence. */
export interface HistoryStep {
  readonly author: string;
  readonly batch?: string;
  readonly note: string;
}

/**
 * The commands that move the history. A session takes them through `dispatch`, as it takes an edit; they add no step.
 * `undoBatch` takes back the steps of one batch and every step after its first, and takes the steps of other authors
 * among them back only when `confirm` is true.
 */
export type HistoryCommand =
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "undoBatch"; readonly batch: string; readonly confirm?: boolean };

export function isHistoryCommand(command: { readonly type: string }): command is HistoryCommand {
  return command.type === "undo" || command.type === "redo" || command.type === "undoBatch";
}

/** What a batch undo takes back, given the history's steps oldest first. */
export interface BatchUndo {
  /** The steps it takes back: every step from the batch's first one to the top of the history. */
  readonly count: number;
  /** Of those, the steps another author made, oldest first. A batch undo asks before it takes these back. */
  readonly otherAuthorSteps: ReadonlyArray<HistoryStep>;
}

/** The batch undo for a batch, or undefined when no step of the batch is in the history. */
export function batchUndoOf(steps: ReadonlyArray<HistoryStep>, batch: string): BatchUndo | undefined {
  const first = steps.findIndex((step) => step.batch === batch);
  if (first < 0) return undefined;
  const reached = steps.slice(first);
  const authors = new Set(reached.filter((step) => step.batch === batch).map((step) => step.author));
  return {
    count: reached.length,
    otherAuthorSteps: reached.filter((step) => step.batch !== batch && !authors.has(step.author)),
  };
}

/**
 * The project with the stop marks the session holds: the batches the user stopped, in the order they were stopped. A
 * project that already carries exactly them is returned as it is, so a project with no marks stays without the field.
 */
export function withStoppedBatches(project: SongProject, stopped: ReadonlyArray<string>): SongProject {
  const current = project.stoppedBatches ?? [];
  if (current.length === stopped.length && current.every((batch, at) => batch === stopped[at])) return project;
  return { ...project, stoppedBatches: stopped };
}

/**
 * The record of an edit given the origin it was made with. An edit with no origin is the user's, in no batch, with no
 * sentence.
 */
export function stepOf(origin?: EditOrigin): HistoryStep {
  const batch = origin?.batch;
  return {
    author: origin?.author ?? "user",
    ...(batch === undefined ? {} : { batch }),
    note: origin?.note ?? "",
  };
}
