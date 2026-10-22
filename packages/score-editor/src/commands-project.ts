// ABOUTME: The song-project commands: edits of the project that are not edits of a parsed Score, applied by applyProjectCommand.
// ABOUTME: More project commands join this union in later tickets; replaceScoreText is the one the text view sends.
import type { ScoreCommand } from "./commands";

/**
 * A song-project edit that is not a score edit. `replaceScoreText` replaces the whole score text with another one, and is
 * how a person's typing reaches the project: a readable text is taken, an unreadable one is refused with its diagnostic.
 */
export type ProjectCommand = { readonly type: "replaceScoreText"; readonly text: string };

/** Whether `command` is one of the project commands, which the score entry does not know. */
export function isProjectCommand(command: ScoreCommand | ProjectCommand): command is ProjectCommand {
  return command.type === "replaceScoreText";
}
