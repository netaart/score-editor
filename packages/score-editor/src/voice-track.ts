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
import { tieChain } from "./commands-shared";
import { create } from "./dom";
import { handleEditingInput } from "./editing-input";
import type { Messages } from "./i18n";
import { createInsertionPointLine, type InsertionPointLine } from "./insertion-point";
import { installLanePointer } from "./lane-pointer";
import { sayRefusals } from "./live-region";
import { dragChannel, ghostsOf } from "./note-drag";
import { mountNoteFocus, type NoteFocus } from "./note-focus";
import { createPlayheadFollower, createPlayheadLine, type PlayheadLine } from "./playhead";
import { previewPlayer } from "./preview-player";
import type { Note, Score } from "./score";
import type { BarSelection, EditingSession, InsertionPoint } from "./session";
import { toolPreviewChannel } from "./tool-preview";
import type { AxisPartOptions, ViewPart } from "./types";
import { announceVoice } from "./voice-announcements";

export interface VoiceTrackOptions extends AxisPartOptions {
  /** The voice to draw, as the dialect names it, such as `Vocal`. */
  voice: string;
}

/** What the track drew for the current score, kept so a change of selection touches only the notes it concerns. */
interface Drawn {
  readonly score: Score;
  readonly t: Messages;
  readonly lane: HTMLElement;
  readonly ticks: number;
  readonly rows: number;
  /** The pitch of the first row, which is the top one. */
  readonly top: number;
  readonly joins: ReadonlySet<string>;
  readonly notes: ReadonlyArray<Note>;
  readonly blocks: Map<string, HTMLElement>;
  readonly owners: Map<Element, string>;
  readonly insertionPoint: InsertionPointLine;
  readonly playhead: PlayheadLine;
  /** The full-height band over the chosen bars, under the notes. */
  readonly barSelection: HTMLElement;
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
 * drops the insertion point, and both are drawn; Shift, a box and a touch and hold select several notes (see
 * `installLanePointer`).
 */
export function mountVoiceTrack(el: HTMLElement, session: EditingSession, options: VoiceTrackOptions): ViewPart {
  const { voice } = options;
  let drawn: Drawn | null = null;
  let root: HTMLElement | null = null;
  let noteFocus: NoteFocus | null = null;
  let shown: {
    selection: ReadonlyArray<string>;
    point: InsertionPoint | null;
    bars: BarSelection | null;
    editable: boolean;
  } | null = null;

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

  /**
   * Draws a ghost for each tie chain of this voice's selected notes where the drag in progress would put it, and takes
   * the ghosts of the last frame down. A ghost is an outline over the lane: the notes themselves stay where they are
   * until the release, and the bar lines show through the outline where a note would cross one.
   */
  /** One pitched tie chain per key, the way the drag and a tool preview compare where a note is. */
  function spanKeys(notes: ReadonlyArray<Note>): Set<string> {
    const keys = new Set<string>();
    const pitched = notes.filter((note) => note.midi !== null).sort((left, right) => left.start - right.start);
    for (let index = 0; index < pitched.length; index += 1) {
      const first = pitched[index] as Note;
      let last = first;
      while (last.tie) {
        const next = pitched[index + 1];
        if (next === undefined || next.start !== last.start + last.duration || next.midi !== last.midi) break;
        index += 1;
        last = next;
      }
      keys.add(`${first.voice}:${first.start}:${last.start + last.duration}:${String(first.midi)}`);
    }
    return keys;
  }

  function drawGhosts(): void {
    if (!drawn) return;
    const { lane, notes, top, ticks } = drawn;
    for (const old of lane.querySelectorAll(".sce-ghost")) old.remove();
    const doc = lane.ownerDocument;
    const draw = (start: number, end: number, midi: number): void => {
      if (!(end > start) || end < 0 || start > ticks) return;
      const el = create(doc, "div", "sce-ghost", lane);
      el.setAttribute("aria-hidden", "true");
      el.style.cssText = `--t:${start};--d:${end - start};--r:${top - midi}`;
    };
    const preview = dragChannel(session).current;
    const tool = toolPreviewChannel(session).current;
    // Every lane whose notes are being carried or previewed lets them wait quietly under the outlines, whichever lane holds the pointer.
    if (preview === null && tool === null) delete lane.dataset.ghosted;
    else lane.dataset.ghosted = "";
    if (preview !== null) {
      for (const ghost of ghostsOf(notes, session.selection, preview, session.grid)) {
        draw(ghost.lands.start, ghost.lands.end, ghost.lands.midi);
      }
    }
    if (tool === null) return;
    const dialect = session.dialect;
    const result = dialect?.parse(tool.project.score).score;
    if (result === undefined || result === null) return;
    const now = spanKeys(notes);
    for (let index = 0; index < result.notes.length; index += 1) {
      const note = result.notes[index] as Note;
      if (note.voice !== voice || note.midi === null) continue;
      let last = note;
      let at = index;
      while (last.tie) {
        const next = result.notes[at + 1];
        if (next === undefined || next.start !== last.start + last.duration || next.midi !== last.midi) break;
        at += 1;
        last = next;
      }
      index = at;
      const key = `${voice}:${note.start}:${last.start + last.duration}:${String(note.midi)}`;
      if (now.has(key)) continue;
      draw(note.start, last.start + last.duration, note.midi);
    }
  }

  /** Draws the band over the chosen run through this lane; the ruler keeps the same band in its own row. */
  function drawBarSelection(bars: BarSelection | null, editable: boolean): void {
    if (!drawn) return;
    const first = bars === null || !editable ? undefined : drawn.score.bars[bars.from];
    const last = bars === null || !editable ? undefined : drawn.score.bars[bars.from + bars.count - 1];
    if (!first || !last) {
      drawn.barSelection.hidden = true;
      return;
    }
    drawn.barSelection.hidden = false;
    drawn.barSelection.style.setProperty("--t", String(first.start));
    drawn.barSelection.style.setProperty("--d", String(last.start + last.length - first.start));
  }

  function refresh(): void {
    const editable = session.view.editable;
    const { selection, insertionPoint: point, barSelection: bars } = session;
    if (
      shown &&
      shown.selection === selection &&
      shown.point === point &&
      shown.bars === bars &&
      shown.editable === editable
    )
      return;
    shown = { selection, point, bars, editable };
    root?.setAttribute("data-editable", String(editable));
    if (!drawn) return;
    drawBarSelection(bars, editable);
    const wanted = editable ? framedFor(selection) : new Set<string>();
    for (const id of drawn.framed) if (!wanted.has(id)) markSelected(id, false);
    for (const id of wanted) if (!drawn.framed.has(id)) markSelected(id, true);
    drawn.framed = wanted;
    drawn.insertionPoint.show(editable ? point : null);
    noteFocus?.sync(editable, selection);
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
        const focus = mountNoteFocus(own, session, signal, {
          select: (noteId) => handleEditingInput(session, { type: "click-note", noteId }),
          toggle: (noteId) => handleEditingInput(session, { type: "toggle-note", noteId }),
        });
        noteFocus = focus;
        announceVoice(session, voice, live, signal, () => focus.stepping);
        const channel = dragChannel(session);
        const unsubscribeGhosts = channel.subscribe(drawGhosts);
        signal.addEventListener("abort", unsubscribeGhosts, { once: true });
        const unsubscribeTool = toolPreviewChannel(session).subscribe(drawGhosts);
        signal.addEventListener("abort", unsubscribeTool, { once: true });
        const player = previewPlayer(session);
        const follower = createPlayheadFollower(session);
        const unsubscribePlayer = player.subscribe(() => {
          drawn?.playhead.show(player.tick);
          follower.follow(player.tick);
        });
        signal.addEventListener("abort", unsubscribePlayer, { once: true });
        own.setAttribute("data-editable", String(session.view.editable));
        installLanePointer(own, session, signal, {
          lane: () => drawn,
          focus: (noteId) => focus.focus(noteId),
          preview: channel,
          refused: sayRefusals(live, session, options.onRefused),
        });
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
        const barSelection = create(doc, "div", "sce-bar-selection", lane);
        barSelection.setAttribute("aria-hidden", "true");
        barSelection.hidden = true;
        const list = create(doc, "div", "sce-notes", lane);
        list.setAttribute("role", "list");
        list.setAttribute("aria-label", voice);

        const joins = tieJoins(notes);
        const fresh: Drawn = {
          score,
          t,
          lane,
          ticks: gridTicks(score),
          rows: range.hi - range.lo,
          top: range.hi - 1,
          joins,
          notes,
          blocks: new Map(),
          owners: new Map(),
          insertionPoint: createInsertionPointLine(lane, score, t),
          playhead: createPlayheadLine(lane, score),
          barSelection,
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
