// ABOUTME: The change record of a song project: the agent batches the editor has not seen yet, each with its author, time, note, commands and the project before it.
// ABOUTME: Pure and headless: appending, listing, batch undo and clearing are plain functions, and the two edits also run as project commands.
import type { ScoreCommand } from "./commands";
import type { ProjectCommand } from "./commands-project";
import type { SongProject } from "./score";

/** A song project as a change record keeps it: everything but its own change records and stop marks. */
export type ProjectSnapshot = Omit<SongProject, "changeRecords" | "stoppedBatches">;

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
