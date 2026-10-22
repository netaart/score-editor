// ABOUTME: The two questions parts ask of the session about the views: is the arrangement shown, are the other views behind the text.
// ABOUTME: Each is one test with one name, so every part that depends on it gives the same answer.
import type { EditingSession } from "./session";

/** Whether the arrangement is the view shown: the controls and gestures that act on its notes mean something only then. */
export function arrangementShown(session: EditingSession): boolean {
  return session.activeView === "arrangement";
}

/**
 * Whether the views that draw the project are behind the text view: it holds text that cannot be read, while the project's
 * own score can be, so they show the last score that read. A project that never read has no such score to be behind.
 */
export function viewsBehindText(session: EditingSession): boolean {
  return session.rejectedText !== null && session.reading.kind === "score";
}
