// ABOUTME: What a drag of selected notes is: where on a note it was grabbed, how far the pointer has moved it, and where the notes would land.
// ABOUTME: The distance becomes the editing input of the keys, and the landing is the note commands' own arithmetic, so the ghosts show what the release will do.
import { type Grid, gridStepOf, landing, type MoveResizeCommand } from "./commands-notes";
import { tieChain } from "./commands-shared";
import type { EditingInput } from "./editing-input";
import type { Note } from "./score";
import type { EditingSession } from "./session";

/**
 * The width of the edge zones at both ends of a selected note, in pixels: where a drag resizes and does not move. A
 * finger gets the wider zone. The stylesheet draws the grips and the cursor with the same numbers.
 */
export const EDGE_ZONE = { fine: 6, coarse: 12 } as const;

/** A zone is only there while the note is at least this many zones wide; a narrower note is all body, and moves. */
export const ZONES_PER_NOTE = 3;

/** Where on a selected note a press landed: on its body, which moves the selection, or on an edge, which resizes it. */
export type Grab = { readonly kind: "move" } | { readonly kind: "resize"; readonly edge: "start" | "end" };

/**
 * What a press at `clientX` on a selected note's block grabs. A block that continues into another note of a tie has no
 * edge on that side: the chain is resized from its two ends only. `coarse` says the pointer is a finger or a pen.
 */
export function grabAt(block: Element, clientX: number, coarse: boolean): Grab {
  const zone = coarse ? EDGE_ZONE.coarse : EDGE_ZONE.fine;
  const area = block.getBoundingClientRect();
  if (area.width < ZONES_PER_NOTE * zone) return { kind: "move" };
  if (!block.hasAttribute("data-tie-prev") && clientX - area.left < zone) return { kind: "resize", edge: "start" };
  if (!block.hasAttribute("data-tie-next") && area.right - clientX < zone) return { kind: "resize", edge: "end" };
  return { kind: "move" };
}

/** A drag in progress: what was grabbed and how far the pointer has taken it, in whole ticks and whole semitones. */
export interface DragPreview {
  readonly grab: Grab;
  readonly timeTicks: number;
  readonly semitones: number;
}

/** A place in the lane, in ticks from its left and in rows from its top. */
export interface LanePlace {
  readonly tick: number;
  readonly row: number;
}

/**
 * The drag from where the press landed to where the pointer is: the time it covered, and the pitch, one semitone for
 * each row. Both are whole numbers, as the editing input rounds them, so the ghosts and the release agree. A resize has
 * no pitch.
 */
export function previewOf(grab: Grab, from: LanePlace, to: LanePlace): DragPreview {
  return {
    grab,
    timeTicks: Math.round(to.tick - from.tick),
    // Rows count down from the top and pitch up, and a row is a semitone. Zero, not minus zero, when nothing moved.
    semitones: grab.kind === "move" ? Math.round(from.row - to.row) + 0 : 0,
  };
}

/** The editing input that does what the drag shows, the one an arrow key sends for a step. */
export function inputOf(preview: DragPreview): EditingInput {
  if (preview.grab.kind === "move") {
    return { type: "move-notes", timeTicks: preview.timeTicks, semitones: preview.semitones };
  }
  return { type: "resize-notes", edge: preview.grab.edge, timeTicks: preview.timeTicks };
}

/** Whether releasing the drag would change nothing: it has not moved a tick or a semitone. */
export function isStill(preview: DragPreview): boolean {
  return preview.timeTicks === 0 && preview.semitones === 0;
}

/** A tie chain of the selection as it stands and as the drag would leave it. */
export interface Ghost {
  /** The ticks the chain covers now, from the start of its first note to the end of its last. */
  readonly start: number;
  readonly end: number;
  readonly midi: number;
  /** The ticks and the pitch it would cover after the release. */
  readonly lands: { readonly start: number; readonly end: number; readonly midi: number };
}

/**
 * The tie chains of the selected pitched notes among `notes` (one voice's, in time order), each with where the drag
 * would put it. A chain is one ghost whatever its length and however many of its notes are selected. Nothing is shown
 * when `grid` is not a grid.
 */
export function ghostsOf(
  notes: ReadonlyArray<Note>,
  selection: ReadonlyArray<string>,
  preview: DragPreview,
  grid: Grid,
): Ghost[] {
  const step = gridStepOf(grid);
  if (step === null) return [];
  const command: MoveResizeCommand =
    preview.grab.kind === "move"
      ? { type: "moveNotes", noteIds: [], timeTicks: preview.timeTicks, semitones: preview.semitones, grid }
      : { type: "resizeNotes", noteIds: [], edge: preview.grab.edge, timeTicks: preview.timeTicks, grid };
  const seen = new Set<string>();
  const ghosts: Ghost[] = [];
  for (const id of selection) {
    const note = notes.find((found) => found.id === id);
    if (note === undefined || note.midi === null) continue;
    const members = tieChain(notes, note, notes);
    const first = members[0];
    const last = members[members.length - 1];
    if (first === undefined || last === undefined || seen.has(first.id)) continue;
    seen.add(first.id);
    const chain = { start: first.start, end: last.start + last.duration, midi: note.midi };
    ghosts.push({ ...chain, lands: landing(chain, command, step) });
  }
  return ghosts;
}

/** Where a drag shows what it would do: every voice track subscribes, and draws ghosts for its own selected notes. */
export interface DragChannel {
  /** The drag in progress, or null. */
  readonly current: DragPreview | null;
  /** Shows a drag, or with null takes the ghosts down. */
  show(preview: DragPreview | null): void;
  /** Calls `listener` after every change of the drag. Returns the function that unsubscribes it. */
  subscribe(listener: () => void): () => void;
}

const channels = new WeakMap<EditingSession, DragChannel>();

/** The channel of one session, made on first use. A drag happens in one lane and is shown in all of them. */
export function dragChannel(session: EditingSession): DragChannel {
  const known = channels.get(session);
  if (known) return known;
  const listeners = new Set<() => void>();
  let current: DragPreview | null = null;
  const channel: DragChannel = {
    get current() {
      return current;
    },
    show(preview) {
      if (preview === null && current === null) return;
      current = preview;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  channels.set(session, channel);
  return channel;
}
