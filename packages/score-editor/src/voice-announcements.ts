// ABOUTME: What a voice track says to a screen reader: which of its notes were selected, where the insertion point is, what was deleted or moved.
// ABOUTME: It follows the session and reads only the session and the score; it never looks at another view part.
import { insertionPosition, lengthInBeats, notesByVoice, pitchName, positionOf, tieJoins } from "./arrangement";
import { messagesFor } from "./i18n";
import type { LiveRegion } from "./live-region";
import type { Score } from "./score";
import type { EditingSession } from "./session";

/** Where a selected note stood: its pitch, and the ticks it covered with the notes tied to it. */
interface Span {
  readonly midi: number;
  readonly start: number;
  readonly end: number;
}

/** The score as of one announcement, the ids of the voice's pitched notes then, and which of them were selected. */
interface Seen {
  readonly score: Score | null;
  readonly pitched: ReadonlySet<string>;
  readonly selected: ReadonlyArray<string>;
  /** The span of each selected note, in the order of `selected`. */
  readonly spans: ReadonlyArray<Span>;
}

function sameIds(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  return a.length === b.length && a.every((id, at) => id === b[at]);
}

/**
 * What an edit did to the selected notes, read off where they stood: none of them differs (null), some has another
 * length (resized), or only places and pitches differ (moved). The notes pair up in the order of the selection, which
 * the session keeps when it follows a move, so a different count is no edit of these two.
 */
function editOf(was: ReadonlyArray<Span>, now: ReadonlyArray<Span>): "moved" | "resized" | null {
  if (now.length === 0 || now.length !== was.length) return null;
  let edit: "moved" | "resized" | null = null;
  now.forEach((span, at) => {
    const before = was[at];
    if (before === undefined) return;
    if (span.end - span.start !== before.end - before.start) edit = "resized";
    else if (edit === null && (span.start !== before.start || span.midi !== before.midi)) edit = "moved";
  });
  return edit;
}

/**
 * Makes `live` speak for `voice` for as long as `signal` lives: a selection of the voice's own notes, a delete that
 * took some of them, a move or a resize of the selected notes, an undo or redo that took notes away or brought them
 * back, and, for the first voice of the score, which speaks for the time axis they share, a move of the insertion point.
 * The command does not travel with the change, so a move and a resize are read off the score: the selected notes
 * follow the edit in the same order, and what differs between each note and its predecessor says which it was.
 * While the session is read-only nothing is said, and nothing is said about a selection that `quiet` covers, as when
 * the keys step from note to note and the focus already speaks the note it lands on.
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
    if (reading.kind !== "score") return { score: null, pitched: new Set(), selected: [], spans: [] };
    const notes = notesByVoice(reading.score).get(voice) ?? [];
    const pitched = new Set(notes.filter((note) => note.midi !== null).map((note) => note.id));
    const joins = tieJoins(notes);
    const selected = selection.filter((id) => pitched.has(id));
    const spans = selected.map((id): Span => {
      const at = notes.findIndex((note) => note.id === id);
      const first = notes[at];
      let end = first?.start ?? 0;
      for (let index = at; index >= 0 && index < notes.length; index++) {
        const note = notes[index];
        if (note === undefined) break;
        end = note.start + note.duration;
        if (!joins.has(note.id)) break;
      }
      return { midi: first?.midi ?? 0, start: first?.start ?? 0, end };
    });
    return { score: reading.score, pitched, selected, spans };
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

    // A history step says what it did to the voice's notes, since the selection does not change with it: the id of a
    // deleted note stays selected as a rest, and an undo that restores the note finds it selected again.
    if ((change.cause === "undo" || change.cause === "redo") && before.score !== null) {
      const gone = [...before.pitched].filter((id) => !seen.pitched.has(id));
      const back = [...seen.pitched].filter((id) => !before.pitched.has(id));
      const goneFirst = gone[0] === undefined ? undefined : describe(before.score, gone[0]);
      const backFirst = back[0] === undefined ? undefined : describe(score, back[0]);
      // Notes gone and notes back together are a move undone or redone: they are told by where they stand, below.
      const moved = gone.length > 0 && back.length > 0;
      if (!moved && goneFirst !== undefined) {
        live.say(gone.length === 1 ? t.deletedNote(goneFirst.pitch, goneFirst.position) : t.deletedNotes(gone.length));
        return;
      }
      if (!moved && backFirst !== undefined) {
        live.say(
          back.length === 1 ? t.restoredNote(backFirst.pitch, backFirst.position) : t.restoredNotes(back.length),
        );
        return;
      }
    }
    if (change.cause === "dispatch" && before.score !== null) {
      // A delete leaves the ids selected, as rests. A move leaves a rest behind too, but the selection has gone to the
      // notes' new ids, so an id that is a rest and no longer selected is not a delete.
      const gone = before.selected.filter((id) => describe(score, id) === undefined && session.selection.includes(id));
      const first = gone[0] === undefined ? undefined : describe(before.score, gone[0]);
      if (first !== undefined) {
        live.say(gone.length === 1 ? t.deletedNote(first.pitch, first.position) : t.deletedNotes(gone.length));
        return;
      }
    }
    if ((change.cause === "dispatch" || change.cause === "undo" || change.cause === "redo") && before.score !== null) {
      const edit = editOf(before.spans, seen.spans);
      if (edit !== null) {
        const only = selected.length === 1 ? describe(score, selected[0] ?? "") : undefined;
        const span = seen.spans[0];
        if (only !== undefined && span !== undefined) {
          const length = lengthInBeats(span.end - span.start, only.position.beatTicks);
          live.say(
            edit === "resized"
              ? t.resizedNote(only.pitch, only.position, length)
              : t.movedNote(only.pitch, only.position),
          );
        } else live.say(edit === "resized" ? t.resizedNotes(selected.length) : t.movedNotes(selected.length));
        return;
      }
    }
    if (change.selection && selected.length > 0 && !sameIds(selected, before.selected) && !quiet()) {
      const only = selected.length === 1 ? describe(score, selected[0] ?? "") : undefined;
      live.say(only ? t.selectedNote(only.pitch, only.position) : t.selectedNotes(selected.length));
    }
    const { insertionPoint } = session;
    if (change.insertionPoint && insertionPoint !== null && score.voices[0] === voice) {
      live.say(t.insertionPoint(insertionPosition(score, insertionPoint.tick)));
    }
  });
  signal.addEventListener("abort", unsubscribe, { once: true });
}
