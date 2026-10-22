// ABOUTME: What a voice track says to a screen reader: which of its notes were selected, where the insertion point is, what was deleted.
// ABOUTME: It follows the session and reads only the session and the score; it never looks at another view part.
import { barIndexAt, gridTicks, notesByVoice, pitchName, positionOf } from "./arrangement";
import { messagesFor } from "./i18n";
import type { LiveRegion } from "./live-region";
import type { Score } from "./score";
import type { EditingSession } from "./session";

/** The score as of one announcement, and the selected ids that named a pitched note of the voice then. */
interface Seen {
  readonly score: Score | null;
  readonly selected: ReadonlyArray<string>;
}

function sameIds(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  return a.length === b.length && a.every((id, at) => id === b[at]);
}

/**
 * Makes `live` speak for `voice` for as long as `signal` lives: a selection of the voice's own notes, a delete that
 * took some of them, and, for the first voice of the score, which speaks for the time axis they share, a move of the
 * insertion point. While the session is read-only nothing is said, and nothing is said about a selection that `quiet`
 * covers, as when the keys step from note to note and the focus already speaks the note it lands on.
 */
export function announceVoice(
  session: EditingSession,
  voice: string,
  live: LiveRegion,
  signal: AbortSignal,
  quiet: () => boolean,
): void {
  function look(): Seen {
    const { reading, selection } = session;
    if (reading.kind !== "score") return { score: null, selected: [] };
    const pitched = new Set(
      (notesByVoice(reading.score).get(voice) ?? []).filter((note) => note.midi !== null).map((note) => note.id),
    );
    return { score: reading.score, selected: selection.filter((id) => pitched.has(id)) };
  }

  /** The pitch and place of a pitched note, or undefined for an id that is a rest or names nothing. */
  function describe(score: Score, id: string) {
    const note = score.notes.find((found) => found.id === id);
    if (note === undefined || note.midi === null) return undefined;
    return { pitch: pitchName(note.midi), position: positionOf(score.bars, note.bar, note.start) };
  }

  let seen = look();
  const unsubscribe = session.subscribe((change) => {
    const before = seen;
    seen = look();
    const { score, selected } = seen;
    if (!session.view.editable || score === null) return;
    const t = messagesFor(session.view.language);

    if (change.cause === "dispatch" && before.score !== null) {
      const gone = before.selected.filter((id) => describe(score, id) === undefined);
      const first = gone[0] === undefined ? undefined : describe(before.score, gone[0]);
      if (first !== undefined) {
        live.say(gone.length === 1 ? t.deletedNote(first.pitch, first.position) : t.deletedNotes(gone.length));
        return;
      }
    }
    if (change.selection && selected.length > 0 && !sameIds(selected, before.selected) && !quiet()) {
      const only = selected.length === 1 ? describe(score, selected[0] ?? "") : undefined;
      live.say(only ? t.selectedNote(only.pitch, only.position) : t.selectedNotes(selected.length));
    }
    const { insertionPoint } = session;
    if (change.insertionPoint && insertionPoint !== null && score.voices[0] === voice) {
      const { bars } = score;
      const atEnd = insertionPoint.tick >= gridTicks(score);
      live.say(
        t.insertionPoint(atEnd ? null : positionOf(bars, barIndexAt(bars, insertionPoint.tick), insertionPoint.tick)),
      );
    }
  });
  signal.addEventListener("abort", unsubscribe, { once: true });
}
