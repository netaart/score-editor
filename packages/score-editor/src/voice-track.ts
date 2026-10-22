// ABOUTME: The voice track view part: one voice's piano roll, with its head, its pitch column, its grid and a block for every note.
// ABOUTME: A voice the score does not have draws nothing; a cut voice ends in the hatched tail. While editable it also takes clicks and taps.
import {
  cutOf,
  gridRunsOf,
  gridTicks,
  lengthInBeats,
  notesByVoice,
  pitchName,
  pitchRangeOf,
  positionOf,
  tieJoins,
} from "./arrangement";
import { type BuiltAxis, type Grid, mountAxisPart } from "./axis-part";
import { tieChain } from "./commands";
import { create } from "./dom";
import { handleEditingInput } from "./editing-input";
import type { Messages } from "./i18n";
import { createInsertionPointLine, type InsertionPointLine } from "./insertion-point";
import { mountNoteFocus, type NoteFocus } from "./note-focus";
import { createPlayheadFollower, createPlayheadLine, type PlayheadLine } from "./playhead";
import { previewPlayer } from "./preview-player";
import type { Note, Score } from "./score";
import type { EditingSession, InsertionPoint } from "./session";
import type { AxisPartOptions, ViewPart } from "./types";
import { announceVoice } from "./voice-announcements";

export interface VoiceTrackOptions extends AxisPartOptions {
  /** The voice to draw, as the dialect names it, such as `Vocal`. */
  voice: string;
}

/** A press that moves farther than this, in pixels, is a drag or a scroll and not a click or a tap. */
const TAP_SLOP = 6;

/** What the track drew for the current score, kept so a change of selection touches only the notes it concerns. */
interface Drawn {
  readonly score: Score;
  readonly t: Messages;
  readonly lane: HTMLElement;
  readonly ticks: number;
  readonly joins: ReadonlySet<string>;
  readonly notes: ReadonlyArray<Note>;
  readonly blocks: Map<string, HTMLElement>;
  readonly owners: Map<Element, string>;
  readonly insertionPoint: InsertionPointLine;
  readonly playhead: PlayheadLine;
  /** The notes drawn as selected now. */
  framed: ReadonlySet<string>;
}

function labelOf(drawn: Pick<Drawn, "score" | "t" | "joins">, note: Note, selected: boolean): string {
  const position = positionOf(drawn.score.bars, note.bar, note.start);
  const length = lengthInBeats(note.duration, position.beatTicks);
  return drawn.t.noteLabel(pitchName(note.midi ?? 0), position, length, drawn.joins.has(note.id), selected);
}

/**
 * Mounts one voice's track on `el`. It draws from the session's score and follows its zoom, scroll and language. A
 * track of its own scrolls in time with the session's scroll; the default editor scrolls its tracks together. While the
 * session is editable a click or tap on a note selects it (a tie chain as a whole), a click or tap on empty space
 * drops the insertion point, and both are drawn.
 */
export function mountVoiceTrack(el: HTMLElement, session: EditingSession, options: VoiceTrackOptions): ViewPart {
  const { voice } = options;
  let drawn: Drawn | null = null;
  let root: HTMLElement | null = null;
  let noteFocus: NoteFocus | null = null;
  let shown: { selection: ReadonlyArray<string>; point: InsertionPoint | null; editable: boolean } | null = null;

  /** The ids drawn as selected for a selection: every selected note of this voice, with the whole chain it is tied into. */
  function framedFor(selection: ReadonlyArray<string>): Set<string> {
    const framed = new Set<string>();
    if (!drawn) return framed;
    for (const id of selection) {
      const note = drawn.notes.find((found) => found.id === id);
      if (note === undefined || note.midi === null) continue;
      for (const member of tieChain(drawn.notes, note)) framed.add(member.id);
    }
    return framed;
  }

  /** Marks a note's block as selected or not, in its look and in its accessible name. */
  function markSelected(id: string, selected: boolean): void {
    const block = drawn?.blocks.get(id);
    const note = drawn?.notes.find((found) => found.id === id);
    if (!drawn || !block || !note) return;
    if (selected) block.dataset.selected = "";
    else delete block.dataset.selected;
    block.setAttribute("aria-label", labelOf(drawn, note, selected));
  }

  function refresh(): void {
    const editable = session.view.editable;
    const { selection, insertionPoint: point } = session;
    if (shown && shown.selection === selection && shown.point === point && shown.editable === editable) return;
    shown = { selection, point, editable };
    root?.setAttribute("data-editable", String(editable));
    if (!drawn) return;
    const wanted = editable ? framedFor(selection) : new Set<string>();
    for (const id of drawn.framed) if (!wanted.has(id)) markSelected(id, false);
    for (const id of wanted) if (!drawn.framed.has(id)) markSelected(id, true);
    drawn.framed = wanted;
    drawn.insertionPoint.show(editable ? point : null);
    noteFocus?.sync(editable, selection);
  }

  /** A click or tap that landed inside the track: on a note, or else on the lane at some position in time. */
  function press(event: PointerEvent): void {
    if (!drawn || !(event.target instanceof Element)) return;
    const block = event.target.closest(".sce-note");
    const noteId = block ? drawn.owners.get(block) : undefined;
    if (noteId !== undefined) {
      const { handled } = handleEditingInput(session, { type: "click-note", noteId });
      // A mouse press has focused the note by now. A touch or pen release comes before the browser moves the focus, so
      // moving it from here would draw the keyboard ring on a tap; the browser focuses the note next, without the ring.
      if (handled && event.pointerType === "mouse") noteFocus?.focus(noteId);
      return;
    }
    if (!event.target.closest(".sce-lane")) return;
    const area = drawn.lane.getBoundingClientRect();
    if (!(area.width > 0)) return;
    handleEditingInput(session, {
      type: "click-empty",
      tick: ((event.clientX - area.left) / area.width) * drawn.ticks,
    });
  }

  const part = mountAxisPart(
    el,
    session,
    {
      kind: "voice-track",
      who: "mountVoiceTrack",
      region: () => voice,
      attach(own, signal, live) {
        root = own;
        const focus = mountNoteFocus(own, session, signal, (noteId) =>
          handleEditingInput(session, { type: "click-note", noteId }),
        );
        noteFocus = focus;
        announceVoice(session, voice, live, signal, () => focus.stepping);
        const player = previewPlayer(session);
        const follower = createPlayheadFollower(session);
        const moved = player.subscribe(() => {
          drawn?.playhead.show(player.tick);
          follower.follow(player.tick);
        });
        signal.addEventListener("abort", moved, { once: true });
        own.setAttribute("data-editable", String(session.view.editable));
        let down: { id: number; x: number; y: number } | null = null;
        own.addEventListener(
          "pointerdown",
          (event) => {
            const primary = event.isPrimary && (event.pointerType !== "mouse" || event.button === 0);
            down = primary ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
          },
          { signal },
        );
        own.addEventListener(
          "pointercancel",
          () => {
            down = null;
          },
          { signal },
        );
        own.addEventListener(
          "pointerup",
          (event) => {
            const start = down;
            down = null;
            if (!start || start.id !== event.pointerId) return;
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP) return;
            press(event);
          },
          { signal },
        );
      },
      refresh,
      build(canvas, score, t): BuiltAxis | null {
        drawn = null;
        shown = null;
        noteFocus?.draw(null);
        if (!score.voices.includes(voice)) return null;
        const doc = canvas.ownerDocument;
        const notes = notesByVoice(score).get(voice) ?? [];
        const range = pitchRangeOf(notes);
        const group = create(doc, "div", "sce-track-group", canvas);
        const head = create(doc, "div", "sce-track-head", group);
        create(doc, "span", "sce-track-name", head).textContent = voice;
        const track = create(doc, "div", "sce-track", group);
        const keys = create(doc, "div", "sce-keys", track);
        for (let octave = range.hi - 12; octave >= range.lo; octave -= 12) {
          create(doc, "div", "sce-octave", keys).textContent = pitchName(octave);
        }
        const lane = create(doc, "div", "sce-lane", track);
        const grids: Grid[] = [];
        for (const run of gridRunsOf(score)) {
          const element = create(doc, "div", "sce-grid", lane);
          element.setAttribute("aria-hidden", "true");
          element.style.cssText = `--t:${run.start};--d:${run.end - run.start}`;
          grids.push({ element, run });
        }
        lane.style.setProperty("--sce-rows", String(range.hi - range.lo));
        const cut = cutOf(score);
        if (cut && cut.voice === voice && gridTicks(score) > cut.missingFrom) {
          const tail = create(doc, "div", "sce-cut", lane);
          tail.setAttribute("aria-hidden", "true");
          tail.style.cssText = `--t:${cut.missingFrom};--d:${gridTicks(score) - cut.missingFrom}`;
        }
        const list = create(doc, "div", "sce-notes", lane);
        list.setAttribute("role", "list");
        list.setAttribute("aria-label", voice);

        const joins = tieJoins(notes);
        const fresh: Drawn = {
          score,
          t,
          lane,
          ticks: gridTicks(score),
          joins,
          notes,
          blocks: new Map(),
          owners: new Map(),
          insertionPoint: createInsertionPointLine(lane, score, t),
          playhead: createPlayheadLine(lane, score),
          framed: new Set(),
        };
        const blocks = doc.createDocumentFragment();
        for (const [index, note] of notes.entries()) {
          if (note.midi === null) continue;
          const block = create(doc, "div", "sce-note");
          block.setAttribute("role", "listitem");
          block.style.cssText = `--t:${note.start};--d:${note.duration};--r:${range.hi - 1 - note.midi}`;
          if (joins.has(note.id)) block.dataset.tieNext = "";
          if (index > 0 && joins.has(notes[index - 1]?.id ?? "")) block.dataset.tiePrev = "";
          block.setAttribute("aria-label", labelOf(fresh, note, false));
          fresh.blocks.set(note.id, block);
          fresh.owners.set(block, note.id);
          blocks.appendChild(block);
        }
        list.appendChild(blocks);
        drawn = fresh;
        fresh.playhead.show(previewPlayer(session).tick);
        noteFocus?.draw({
          order: notes.filter((note) => note.midi !== null).map((note) => note.id),
          blocks: fresh.blocks,
          owners: fresh.owners,
        });
        return { axes: [lane], grids, corner: keys, timeline: lane, barCount: 0 };
      },
    },
    options,
  );
  return {
    destroy() {
      part.destroy();
      drawn = null;
      root = null;
      noteFocus = null;
    },
  };
}
