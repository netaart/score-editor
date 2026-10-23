// ABOUTME: The lyric track view part: the song's lyric lines as phrase blocks over their bars, with the syllable and note-start counts.
// ABOUTME: Green when the counts are equal, yellow when not; the syllables stand on their notes, lines not on bars are listed below.
import { gridRunsOf, gridTicks } from "./arrangement";
import { type BuiltAxis, type Grid, mountAxisPart } from "./axis-part";
import type { ProjectCommand } from "./commands-project";
import { create } from "./dom";
import type { Messages } from "./i18n";
import { type LiveRegion, sayRefusals } from "./live-region";
import {
  barLineTick,
  type LyricBoundaryPlan,
  type LyricDropPlan,
  type LyricEdge,
  type LyricRow,
  lyricBoundaryPlan,
  lyricDropPlan,
  lyricRows,
  lyricSplitCommand,
} from "./lyric-edit";
import { createLyricEditor, type LyricEditor } from "./lyric-editor";
import { installLyricPointer, type LyricPreview } from "./lyric-track-pointer";
import { lyricLinesOf } from "./lyrics";
import type { LyricPhrase, Score } from "./score";
import type { EditingSession } from "./session";
import type { AxisPartOptions, ViewPart } from "./types";

/** The start of a phrase's first bar and the end of its last, in ticks. The phrase is one the score holds. */
function phraseTicks(score: Score, phrase: LyricPhrase): { start: number; end: number } {
  const first = score.bars[phrase.firstBar];
  const last = score.bars[phrase.firstBar + phrase.barCount - 1];
  const start = first?.start ?? 0;
  return { start, end: last ? last.start + last.length : start };
}

/** Sets a node's text only when it differs, so a redraw that changes nothing touches nothing. */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Marks an element as chosen or not. */
function setChosen(el: HTMLElement, chosen: boolean): void {
  if (chosen) el.dataset.selected = "";
  else delete el.dataset.selected;
}

/** A phrase block as the track keeps it, so a redraw updates the same elements and a press in progress keeps its target. */
interface PhraseView {
  readonly element: HTMLElement;
  readonly count: HTMLElement;
  readonly text: HTMLElement;
  /** The handles on the phrase's two edges, while the track is editable. */
  handles: { readonly start: HTMLElement; readonly end: HTMLElement } | null;
}

/** A line of the unaligned area as the track keeps it. */
interface ItemView {
  readonly element: HTMLElement;
  /** Whether the item is drawn for editing: a grip to drag it by and a button that chooses the line, or plain text. */
  pick: boolean;
  grip: HTMLElement | null;
  text: HTMLElement;
}

/** What the track drew for the current score. */
interface Drawn {
  readonly score: Score;
  readonly t: Messages;
  readonly lane: HTMLElement;
  /** The pinned corner: the lane's drawn time begins at its right edge when the lane is scrolled under it. */
  readonly keys: HTMLElement;
  readonly ticks: number;
  readonly empty: HTMLElement;
  readonly phrases: HTMLElement;
  readonly syllables: HTMLElement;
  readonly panel: HTMLElement;
  readonly title: HTMLElement;
  readonly badge: HTMLElement;
  readonly newLine: HTMLElement;
  readonly unaligned: HTMLElement;
  readonly editor: LyricEditor;
  readonly views: Map<number, PhraseView>;
  readonly items: Map<number, ItemView>;
  /** The marks a drag in progress draws in the lane. */
  marks: HTMLElement[];
  /** What the last draw was made from: a change in any of these draws again. */
  shown: {
    readonly project: unknown;
    readonly editable: boolean;
    readonly chosen: number | null;
    readonly adding: boolean;
  } | null;
}

/**
 * Mounts the lyric track on `el`. It draws from the session's project and follows its zoom, scroll and language: each
 * lyric line that sits on bars is a block over them with the number of its syllables over the number of its note starts,
 * green when the two are equal and yellow, with a broken line, when not; when they are equal each syllable stands at its
 * note. Lines not on bars are listed under the lane. While the session is editable a click or tap on a line chooses it
 * and opens its text in the editor under the lane.
 */
export function mountLyricTrack(el: HTMLElement, session: EditingSession, options?: AxisPartOptions): ViewPart {
  let drawn: Drawn | null = null;
  let root: HTMLElement | null = null;
  let live: LiveRegion | null = null;
  let refuse: ReturnType<typeof sayRefusals> | null = null;
  /** The line the person chose, by its place in the project's lines. Part-local: it is not in the session or its history. */
  let chosen: number | null = null;
  /** The editor is open on a new line. */
  let adding = false;
  /** The phrase that is the track's one tab stop: the chosen line, else the one the keys left off at, else the first. */
  let stop: number | null = null;

  const linesNow = (score: Score) => lyricLinesOf(session.project, score);

  /** Sends commands as one step. A refusal is said and changes nothing. */
  function run(commands: ReadonlyArray<ProjectCommand>): boolean {
    if (!session.view.editable || commands.length === 0) return false;
    const [only] = commands;
    const result = commands.length === 1 && only ? session.dispatch(only) : session.dispatchAll(commands);
    if (!result.ok) refuse?.(result.diagnostics);
    return result.ok;
  }

  /** Puts the focus on a line's phrase, or on its item in the unaligned area. */
  function focusLine(line: number): void {
    const view = drawn?.views.get(line);
    if (view) view.element.focus();
    else drawn?.items.get(line)?.text.focus();
  }

  /** Takes a line out, and leaves the focus on the line that takes its place, else on the one before. */
  function removeLine(line: number): void {
    const d = drawn;
    if (!d || !run([{ type: "deleteLyricLine", line }])) return;
    live?.say(d.t.lyricDeleted(line + 1));
    choose(null);
    const placed = lyricRows(d.score, linesNow(d.score)).filter((row) => row.phrase !== null);
    const near = placed.find((row) => row.index >= line) ?? placed.at(-1);
    if (near) focusLine(near.index);
  }

  function choose(line: number | null): void {
    if (!drawn) return;
    chosen = line;
    adding = false;
    const lines = linesNow(drawn.score);
    const picked = line === null ? undefined : lines[line];
    if (picked && line !== null) {
      const canPlace = lyricRows(drawn.score, lines)[line]?.phrase === null;
      drawn.editor.show("line", picked.text, { canMerge: line + 1 < lines.length, line: line + 1, canPlace });
    }
    draw();
  }

  /** Opens the editor on an empty box for a line that does not exist yet. */
  function startAdding(): void {
    if (!drawn || !session.view.editable) return;
    chosen = null;
    adding = true;
    drawn.editor.show("new", "", { canMerge: false, line: 0, canPlace: false });
    draw();
    drawn.editor.focus();
  }

  function draw(): void {
    if (!drawn) return;
    const { score, t } = drawn;
    const { project } = session;
    const editable = session.view.editable;
    const rows = lyricRows(score, lyricLinesOf(project, score));
    if (chosen !== null && (!editable || chosen >= rows.length)) chosen = null;
    if (!editable) adding = false;
    if (
      drawn.shown &&
      drawn.shown.project === project &&
      drawn.shown.editable === editable &&
      drawn.shown.chosen === chosen &&
      drawn.shown.adding === adding
    ) {
      return;
    }
    const first = drawn.shown === null;
    drawn.shown = { project, editable, chosen, adding };
    if (chosen !== null) stop = chosen;
    root?.setAttribute("data-editable", String(editable));

    const placed = rows.filter((row) => row.phrase !== null && row.alignment !== null);
    const loose = rows.filter((row) => row.phrase === null);
    drawPhrases(drawn, placed, editable);
    drawSyllables(drawn, placed);
    drawUnaligned(drawn, loose, editable);

    drawn.empty.hidden = placed.length > 0;
    drawn.phrases.hidden = placed.length === 0;
    setText(drawn.empty, rows.length === 0 ? t.noLyrics : t.noLyricsOnBars);
    drawn.panel.hidden = !editable && loose.length === 0;
    drawn.newLine.hidden = !editable;
    drawn.editor.element.hidden = chosen === null && !adding;
    const row = chosen === null ? undefined : rows[chosen];
    if (row && first) {
      drawn.editor.show("line", row.line.text, {
        canMerge: row.index + 1 < rows.length,
        line: row.index + 1,
        canPlace: row.phrase === null,
      });
    } else if (row) {
      drawn.editor.sync(row.line.text, row.index + 1 < rows.length);
    }
  }

  function drawPhrases(d: Drawn, placed: ReadonlyArray<LyricRow>, editable: boolean): void {
    const wanted = new Set(placed.map((row) => row.index));
    for (const [line, view] of d.views) {
      if (wanted.has(line)) continue;
      view.element.remove();
      d.views.delete(line);
    }
    const doc = d.lane.ownerDocument;
    for (const [at, row] of placed.entries()) {
      const { phrase, alignment } = row;
      if (!phrase || !alignment) continue;
      let view = d.views.get(row.index);
      if (!view) {
        const element = create(doc, "div", "sce-lyric-phrase");
        element.setAttribute("role", "listitem");
        element.dataset.line = String(row.index);
        const body = create(doc, "div", "sce-lyric-body", element);
        view = {
          element,
          count: create(doc, "span", "sce-lyric-count", body),
          text: create(doc, "span", "sce-lyric-text", body),
          handles: null,
        };
        d.views.set(row.index, view);
      }
      const { start, end } = phraseTicks(d.score, phrase);
      const style = `--t:${start};--d:${end - start}`;
      if (view.element.getAttribute("style") !== style) view.element.setAttribute("style", style);
      view.element.dataset.state = alignment.equal ? "equal" : "differ";
      const selected = editable && chosen === row.index;
      setChosen(view.element, selected);
      setText(view.count, d.t.lyricCount(alignment.syllables.length, alignment.onsets.length));
      setText(view.text, row.line.text);
      view.element.setAttribute(
        "aria-label",
        d.t.lyricPhraseLabel({
          line: row.index + 1,
          text: row.line.text,
          first: phrase.firstBar + 1,
          last: phrase.firstBar + phrase.barCount,
          syllables: alignment.syllables.length,
          starts: alignment.onsets.length,
          equal: alignment.equal,
          selected,
        }),
      );
      drawHandles(d, view, row, phrase, editable);
      if (d.phrases.children[at] !== view.element) d.phrases.insertBefore(view.element, d.phrases.children[at] ?? null);
    }
    if (stop === null || !d.views.has(stop)) stop = placed[0]?.index ?? null;
    for (const [line, view] of d.views) {
      if (editable) view.element.setAttribute("tabindex", line === stop ? "0" : "-1");
      else view.element.removeAttribute("tabindex");
    }
  }

  /** The two edge handles of a phrase: sliders on the bar lines, which a pointer drags and the keys step by one bar. */
  function drawHandles(d: Drawn, view: PhraseView, row: LyricRow, phrase: LyricPhrase, editable: boolean): void {
    if (!editable) {
      view.handles?.start.remove();
      view.handles?.end.remove();
      view.handles = null;
      return;
    }
    const doc = d.lane.ownerDocument;
    if (!view.handles) {
      const made = (edge: LyricEdge) => {
        const handle = create(doc, "div", "sce-lyric-handle", view.element);
        handle.setAttribute("role", "slider");
        handle.dataset.edge = edge;
        return handle;
      };
      view.handles = { start: made("start"), end: made("end") };
    }
    const lines = linesNow(d.score);
    const limits = (edge: LyricEdge): { lowest: number; highest: number } => {
      const low = lyricBoundaryPlan(d.score, lines, { line: row.index, edge, tick: 0 });
      const high = lyricBoundaryPlan(d.score, lines, { line: row.index, edge, tick: d.ticks });
      return { lowest: low?.boundary ?? 0, highest: high?.boundary ?? 0 };
    };
    const tab = chosen === row.index ? "0" : "-1";
    for (const edge of ["start", "end"] as const) {
      const handle = view.handles[edge];
      // A start edge sits on the bar that begins the phrase; an end edge on the bar that ends it. Both read as bar numbers.
      const now = edge === "start" ? phrase.firstBar + 1 : phrase.firstBar + phrase.barCount;
      const { lowest, highest } = limits(edge);
      const shift = edge === "start" ? 1 : 0;
      handle.setAttribute("aria-valuemin", String(lowest + shift));
      handle.setAttribute("aria-valuemax", String(highest + shift));
      handle.setAttribute("aria-valuenow", String(now));
      handle.setAttribute("aria-valuetext", d.t.lyricBarValue(now));
      handle.setAttribute(
        "aria-label",
        edge === "start" ? d.t.lyricStartHandle(row.index + 1, now) : d.t.lyricEndHandle(row.index + 1, now),
      );
      handle.setAttribute("tabindex", tab);
    }
  }

  function drawSyllables(d: Drawn, placed: ReadonlyArray<LyricRow>): void {
    const doc = d.lane.ownerDocument;
    const fragment = doc.createDocumentFragment();
    for (const row of placed) {
      const notes = row.alignment?.notes;
      if (!row.phrase || !notes) continue;
      const { end } = phraseTicks(d.score, row.phrase);
      for (const [at, { syllable, note }] of notes.entries()) {
        const next = notes[at + 1]?.note.start ?? end;
        const cell = create(doc, "div", "sce-lyric-syl");
        cell.setAttribute("style", `--t:${note.start};--w:${next - note.start}`);
        cell.textContent = syllable;
        fragment.appendChild(cell);
      }
    }
    d.syllables.replaceChildren(fragment);
  }

  function drawUnaligned(d: Drawn, loose: ReadonlyArray<LyricRow>, editable: boolean): void {
    const wanted = new Set(loose.map((row) => row.index));
    for (const [line, item] of d.items) {
      if (wanted.has(line)) continue;
      item.element.remove();
      d.items.delete(line);
    }
    const doc = d.lane.ownerDocument;
    for (const [at, row] of loose.entries()) {
      let item = d.items.get(row.index);
      if (!item) {
        const element = create(doc, "li", "sce-lyric-item");
        element.setAttribute("role", "listitem");
        element.dataset.line = String(row.index);
        item = { element, pick: false, grip: null, text: create(doc, "span", "sce-lyric-item-text", element) };
        d.items.set(row.index, item);
      }
      if (item.pick !== editable) {
        item.text.remove();
        item.grip?.remove();
        item.pick = editable;
        // The grip is where a line is picked up to be dropped on bars; it is not a control a keyboard reaches, and the
        // editor under the lane offers the same placement by a bar number.
        item.grip = editable ? create(doc, "span", "sce-lyric-grip", item.element) : null;
        item.grip?.setAttribute("aria-hidden", "true");
        item.text = editable
          ? create(doc, "button", "sce-lyric-item-text sce-lyric-pick", item.element)
          : create(doc, "span", "sce-lyric-item-text", item.element);
        if (item.text instanceof HTMLButtonElement) item.text.type = "button";
      }
      setText(item.text, row.line.text);
      const selected = editable && chosen === row.index;
      setChosen(item.element, selected);
      if (editable)
        item.text.setAttribute("aria-label", d.t.lyricUnalignedLabel(row.index + 1, row.line.text, selected));
      else item.text.removeAttribute("aria-label");
      if (d.unaligned.children[at] !== item.element)
        d.unaligned.insertBefore(item.element, d.unaligned.children[at] ?? null);
    }
    d.unaligned.hidden = loose.length === 0;
    d.title.hidden = loose.length === 0;
    setText(d.badge, String(loose.length));
  }

  function clearPreview(d: Drawn): void {
    for (const mark of d.marks) mark.remove();
    d.marks = [];
    for (const view of d.views.values()) view.element.removeAttribute("data-previewing");
    d.lane.removeAttribute("data-dropping");
  }

  /** Shows what a drag in progress would do: the blocks it moves, and the bar line or the bar it lands on. */
  function preview(show: LyricPreview | null): void {
    const d = drawn;
    if (!d) return;
    clearPreview(d);
    if (!show) {
      // Draw the project as it is: a drag that was given up leaves the blocks where the project has them.
      d.shown = null;
      draw();
      return;
    }
    const doc = d.lane.ownerDocument;
    if (show.kind === "boundary") {
      for (const move of show.plan.moves) {
        const view = d.views.get(move.line);
        if (!view) continue;
        const { start, end } = phraseTicks(d.score, move.phrase);
        view.element.setAttribute("style", `--t:${start};--d:${end - start}`);
        view.element.setAttribute("data-previewing", "");
      }
      const guide = create(doc, "div", "sce-lyric-guide", d.lane);
      guide.setAttribute("aria-hidden", "true");
      guide.setAttribute("style", `--t:${barLineTick(d.score, show.plan.boundary)}`);
      d.marks.push(guide);
    } else {
      const { start, end } = phraseTicks(d.score, show.plan.phrase);
      const mark = create(doc, "div", "sce-lyric-drop", d.lane);
      mark.setAttribute("aria-hidden", "true");
      mark.dataset.free = String(show.plan.free);
      mark.setAttribute("style", `--t:${start};--d:${end - start}`);
      d.marks.push(mark);
      d.lane.setAttribute("data-dropping", "");
    }
  }

  function sendBoundary(line: number, plan: LyricBoundaryPlan): void {
    const d = drawn;
    const moved = plan.moves.find((move) => move.line === line)?.phrase;
    if (!d || !moved || !run(plan.commands)) return;
    live?.say(d.t.lyricMoved(line + 1, moved.firstBar + 1, moved.firstBar + moved.barCount));
  }

  /** Gives a line a phrase and says where it stands now: the project keeps lines on bars in the order of their bars. */
  function placeLine(line: number, phrase: LyricPhrase): void {
    const d = drawn;
    if (!d) return;
    const text = linesNow(d.score)[line]?.text;
    if (!run([{ type: "setLyricLinePhrase", line, phrase }])) return;
    const now = linesNow(d.score).findIndex(
      (found) => found.text === text && found.phrase?.firstBar === phrase.firstBar,
    );
    live?.say(d.t.lyricPlaced((now < 0 ? line : now) + 1, phrase.firstBar + 1));
  }

  function sendDrop(line: number, plan: LyricDropPlan): void {
    if (plan.commands.length > 0) placeLine(line, plan.phrase);
  }

  /**
   * The keys of a phrase: Left and Right (and Home and End) step to the neighbouring line and choose it, Enter and Space
   * open its text, Delete and Backspace take the line out, Escape lets the line go.
   */
  function onPhraseKey(event: KeyboardEvent, d: Drawn, line: number): void {
    const order = [...d.phrases.children].map((child) => Number((child as HTMLElement).dataset.line));
    const at = order.indexOf(line);
    const target =
      event.key === "ArrowRight"
        ? order[at + 1]
        : event.key === "ArrowLeft"
          ? order[at - 1]
          : event.key === "Home"
            ? order[0]
            : event.key === "End"
              ? order.at(-1)
              : undefined;
    if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (target !== undefined) {
        choose(target);
        focusLine(target);
      }
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(line);
      d.editor.focus();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeLine(line);
    } else if (event.key === "Escape" && chosen !== null) {
      event.preventDefault();
      choose(null);
    }
  }

  /** The keys of a handle: Left and Right move its edge one bar line. */
  function onKeyDown(event: KeyboardEvent): void {
    const d = drawn;
    if (!d || !session.view.editable || event.defaultPrevented || event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.classList.contains("sce-lyric-phrase") && event.target.dataset.line !== undefined) {
      onPhraseKey(event, d, Number(event.target.dataset.line));
      return;
    }
    const handle = event.target.closest<HTMLElement>(".sce-lyric-handle");
    const owner = handle?.closest<HTMLElement>("[data-line]");
    const edge = handle?.dataset.edge;
    if (!handle || !owner || (edge !== "start" && edge !== "end")) return;
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const line = Number(owner.dataset.line);
    const row = lyricRows(d.score, linesNow(d.score))[line];
    if (!row?.phrase) return;
    const now = edge === "start" ? row.phrase.firstBar : row.phrase.firstBar + row.phrase.barCount;
    const plan = lyricBoundaryPlan(d.score, linesNow(d.score), { line, edge, tick: barLineTick(d.score, now + step) });
    if (plan && plan.moves.length > 0) sendBoundary(line, plan);
  }

  /** A press on a phrase or on an item of the unaligned area chooses its line. */
  function onClick(event: MouseEvent): void {
    if (!session.view.editable || !(event.target instanceof Element)) return;
    const owner = event.target.closest<HTMLElement>(".sce-lyric-phrase, .sce-lyric-item");
    if (!owner || owner.dataset.line === undefined) return;
    choose(Number(owner.dataset.line));
  }

  const part = mountAxisPart(
    el,
    session,
    {
      kind: "lyric-track",
      who: "mountLyricTrack",
      region: (t) => t.lyrics,
      attach(own, signal, region) {
        root = own;
        live = region;
        refuse = sayRefusals(region, session, options?.onRefused);
        own.setAttribute("data-editable", String(session.view.editable));
        own.addEventListener("click", onClick, { signal });
        own.addEventListener("keydown", onKeyDown, { signal });
        installLyricPointer(own, signal, {
          editable: () => session.view.editable,
          tickAt(clientX) {
            const d = drawn;
            const rect = d?.lane.getBoundingClientRect();
            return d && rect && rect.width > 0 ? ((clientX - rect.left) / rect.width) * d.ticks : null;
          },
          overLane(x, y) {
            const d = drawn;
            if (!d) return false;
            const lane = d.lane.getBoundingClientRect();
            const keys = d.keys.getBoundingClientRect();
            const surface = (options?.scroller ?? own).getBoundingClientRect();
            const left = Math.max(lane.left, keys.right, surface.left);
            const right = Math.min(lane.right, surface.right);
            return x >= left && x < right && y >= lane.top && y < lane.bottom;
          },
          boundaryPlan: (line, edge, tick) =>
            drawn ? lyricBoundaryPlan(drawn.score, linesNow(drawn.score), { line, edge, tick }) : null,
          dropPlan: (line, tick) => (drawn ? lyricDropPlan(drawn.score, linesNow(drawn.score), { line, tick }) : null),
          preview,
          sendBoundary,
          sendDrop,
        });
      },
      refresh: draw,
      build(canvas, score, t): BuiltAxis {
        const doc = canvas.ownerDocument;
        const group = create(doc, "div", "sce-track-group", canvas);
        const head = create(doc, "div", "sce-track-head", group);
        create(doc, "span", "sce-track-name", head).textContent = t.lyrics;
        const track = create(doc, "div", "sce-track", group);
        const keys = create(doc, "div", "sce-keys", track);
        const lane = create(doc, "div", "sce-lyric-lane", track);
        const grids: Grid[] = [];
        for (const run of gridRunsOf(score)) {
          const element = create(doc, "div", "sce-grid", lane);
          element.setAttribute("aria-hidden", "true");
          element.style.cssText = `--t:${run.start};--d:${run.end - run.start}`;
          grids.push({ element, run });
        }
        const empty = create(doc, "span", "sce-empty", lane);
        const phrases = create(doc, "div", "sce-lyric-phrases", lane);
        phrases.setAttribute("role", "list");
        phrases.setAttribute("aria-label", t.lyrics);
        const syllables = create(doc, "div", "sce-lyric-syllables", lane);
        syllables.setAttribute("aria-hidden", "true");

        const panel = create(doc, "div", "sce-lyric-panel", group);
        const panelHead = create(doc, "div", "sce-lyric-panel-head", panel);
        const title = create(doc, "span", "sce-lyric-title", panelHead);
        title.append(t.lyricUnaligned);
        const badge = create(doc, "span", "sce-badge", title);
        const newLine = create(doc, "button", "sce-button sce-lyric-new", panelHead);
        newLine.type = "button";
        newLine.textContent = t.lyricNewLine;
        newLine.addEventListener("click", startAdding);
        const editor = createLyricEditor(doc, t, {
          commit(text) {
            const line = chosen;
            if (line === null || !run([{ type: "setLyricLineText", line, text }])) return false;
            live?.say(t.lyricTextSet(line + 1));
            return true;
          },
          cancel() {
            const line = chosen;
            choose(null);
            if (line !== null) focusLine(line);
          },
          split(offset) {
            const line = chosen;
            const command = line === null ? null : lyricSplitCommand(score, linesNow(score), { line, offset });
            if (line !== null && command && run([command])) live?.say(t.lyricSplitDone(line + 1));
          },
          merge() {
            const line = chosen;
            if (line !== null && run([{ type: "mergeLyricLines", line }])) live?.say(t.lyricMerged(line + 1));
          },
          remove() {
            if (chosen !== null) removeLine(chosen);
          },
          place(bar) {
            if (chosen !== null) placeLine(chosen, { firstBar: bar - 1, barCount: 1 });
          },
          add(text) {
            const at = linesNow(score).length;
            if (!run([{ type: "insertLyricLine", line: at, text, phrase: null }])) return;
            live?.say(t.lyricAdded(at + 1));
            choose(null);
            focusLine(at);
          },
        });
        editor.element.hidden = true;
        panel.appendChild(editor.element);
        const unaligned = create(doc, "ul", "sce-lyric-unaligned", panel);
        unaligned.setAttribute("role", "list");
        unaligned.setAttribute("aria-label", t.lyricUnaligned);

        drawn = {
          score,
          t,
          lane,
          keys,
          ticks: gridTicks(score),
          empty,
          phrases,
          syllables,
          panel,
          title,
          badge,
          newLine,
          unaligned,
          editor,
          views: new Map(),
          items: new Map(),
          marks: [],
          shown: null,
        };
        draw();
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
      live = null;
      refuse = null;
    },
  };
}
