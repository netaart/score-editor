// ABOUTME: The project commands that carry a host's change of a project's style, score mode and seed into a session that holds the user's edits.
// ABOUTME: A field with no project command (the model) and the stored lyric lines are not carried; the original's own fields are never compared here.
import type { ProjectCommand } from "./commands-project";
import type { SongProject } from "./score";

/** The commands, in the order of the project's fields, that turn the host's previous project into the one it passes now. */
export function hostChanges(previous: SongProject, next: SongProject): ReadonlyArray<ProjectCommand> {
  const commands: ProjectCommand[] = [];
  if (next.style !== previous.style) commands.push({ type: "setStyle", style: next.style });
  if (next.scoreMode !== previous.scoreMode) commands.push({ type: "setScoreMode", scoreMode: next.scoreMode });
  if (next.seed !== previous.seed) commands.push({ type: "setSeed", seed: next.seed });
  return commands;
}
