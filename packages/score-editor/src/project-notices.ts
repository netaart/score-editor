// ABOUTME: The notices a song project carries as it stands, asked of its dialect and remembered until the project changes, and which of a command's notices are news.
// ABOUTME: The song-project rules stay in checkProject and applyProjectRules; this only asks them and tells the answers apart.
import { checkProject } from "./commands-project";
import type { Diagnostic } from "./diagnostics";
import type { ScoreDialect } from "./dialect";
import type { SongProject } from "./score";
import type { EditingSession } from "./session";

const remembered = new WeakMap<SongProject, { dialect: ScoreDialect; notices: ReadonlyArray<Diagnostic> }>();

/**
 * What the session's project carries as a notice now (`checkProject`). The answer is kept for the project it was asked
 * of, so a part that draws on every change of zoom or scroll asks the dialect to read the score once per project.
 */
export function carriedNotices(session: EditingSession): ReadonlyArray<Diagnostic> {
  const { dialect, project } = session;
  if (dialect === undefined) return [];
  const kept = remembered.get(project);
  if (kept && kept.dialect === dialect) return kept.notices;
  const notices = checkProject(dialect, project);
  remembered.set(project, { dialect, notices });
  return notices;
}

/**
 * The notices a taken command came back with that the project does not carry on its own: what the command itself has to
 * say, such as a style without a BPM after a tempo change. A notice the project states all the time (the panel shows
 * it) is not repeated at every edit.
 */
export function newsOf(session: EditingSession, taken: ReadonlyArray<Diagnostic>): ReadonlyArray<Diagnostic> {
  const carried = carriedNotices(session);
  return taken.filter((notice) => !carried.some((known) => known.code === notice.code));
}
