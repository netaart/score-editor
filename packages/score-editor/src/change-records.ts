// ABOUTME: The change record of a song project: the agent batches the editor has not seen yet, each with its author, time, note, commands and the project before it.
// ABOUTME: Pure and headless: appending, listing, batch undo and clearing are plain functions, and the two edits also run as project commands.
import { commandRefusal } from "./command-refusal";
import type { ScoreCommand } from "./commands";
import type { ProjectCommand, ProjectCommandResult } from "./commands-project";
import type { SongProject } from "./score";

/**
 * A song project as a change record keeps it: the song itself, without the bookkeeping the editor keeps about the project
 * (its change records, stop marks and handed-out time).
 */
export type ProjectSnapshot = Omit<SongProject, "changeRecords" | "stoppedBatches" | "handedOutAt">;

/** One batch of agent changes the editor has not seen yet, with the project it started from. */
export interface ChangeRecord {
  /** The agent that made the batch, by the name it goes by. */
  readonly author: string;
  /** The batch's name, which the agent gives it. */
  readonly batch: string;
  /** Milliseconds since the epoch when the batch was made. */
  readonly at: number;
  /** One sentence about the batch, for whoever reads the record. */
  readonly note: string;
  /** The commands of the batch, in the order they were run. */
  readonly commands: ReadonlyArray<ScoreCommand | ProjectCommand>;
  /** The song project the batch started from. */
  readonly before: ProjectSnapshot;
}

/** What the agent says about a batch it made: a record without the project before it. */
export type ChangeBatch = Omit<ChangeRecord, "before">;

/** The change records of a project, oldest first; none when it carries none. */
export function changeRecordsOf(project: SongProject): ReadonlyArray<ChangeRecord> {
  return project.changeRecords ?? [];
}

/** The project as a record keeps it: the song, without the bookkeeping the editor keeps about the project. */
function snapshotOf(project: SongProject): ProjectSnapshot {
  const { changeRecords: _records, stoppedBatches: _stopped, handedOutAt: _handedOut, ...snapshot } = project;
  return snapshot;
}

/**
 * Appends a batch the agent made. `before` is the project the batch started from and `after` the one it left: the record
 * keeps `before` and the batch's facts, and the project keeps `after` with the record added to the end of its list.
 */
export function recordChangeBatch(before: SongProject, after: SongProject, batch: ChangeBatch): SongProject {
  const record: ChangeRecord = {
    author: batch.author,
    batch: batch.batch,
    at: batch.at,
    note: batch.note,
    commands: [...batch.commands],
    before: snapshotOf(before),
  };
  return { ...after, changeRecords: [...changeRecordsOf(after), record] };
}

/**
 * Takes the song back to before the first record of `batch`. The project becomes that record's snapshot with the records
 * before it; the batch and every batch after it leave the record. The stop marks and the handed-out time are the editor's
 * bookkeeping rather than the song, so they stay as they are now. A batch the record does not hold is refused.
 */
export function undoChangeBatch(project: SongProject, batch: string): ProjectCommandResult {
  const records = changeRecordsOf(project);
  const index = records.findIndex((record) => record.batch === batch);
  const target = records[index];
  if (target === undefined) return commandRefusal("nothing-to-undo", { batch });
  return {
    ok: true,
    project: {
      ...target.before,
      ...(index === 0 ? {} : { changeRecords: records.slice(0, index) }),
      ...(project.stoppedBatches === undefined ? {} : { stoppedBatches: project.stoppedBatches }),
      ...(project.handedOutAt === undefined ? {} : { handedOutAt: project.handedOutAt }),
    },
  };
}

/** Drops the change record: the editor has shown the batches and the user has kept them. */
export function clearChangeRecords(project: SongProject): SongProject {
  const { changeRecords: _records, ...rest } = project;
  return rest;
}
