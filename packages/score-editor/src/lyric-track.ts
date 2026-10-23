// ABOUTME: The lyric track view part: the song's lyric lines as phrase blocks over their bars, with the syllable and note-start counts.
// ABOUTME: Green when the counts are equal, yellow when not; the syllables stand on their notes, lines not on bars are listed below.
import { gridRunsOf } from "./arrangement";
import { type BuiltAxis, type Grid, mountAxisPart } from "./axis-part";
import type { ProjectCommand } from "./commands-project";
import { create } from "./dom";
import type { Messages } from "./i18n";
import { type LiveRegion, sayRefusals } from "./live-region";
import { type LyricRow, lyricRows, lyricSplitCommand } from "./lyric-edit";
import { createLyricEditor, type LyricEditor } from "./lyric-editor";
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
}

/** A line of the unaligned area as the track keeps it. */
interface ItemView {
  readonly element: HTMLElement;
  /** Whether the item is drawn for editing: a button that chooses the line, or plain text. */
  pick: boolean;
  text: HTMLElement;
}

/** What the track drew for the current score. */
interface Drawn {
  readonly score: Score;
  readonly t: Messages;
  readonly lane: HTMLElement;
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

  const linesNow = (score: Score) => lyricLinesOf(session.project, score);

  /** Sends commands as one step. A refusal is said and changes nothing. */
  function run(commands: ReadonlyArray<ProjectCommand>): boolean {
    if (!session.view.editable || commands.length === 0) return false;
    const [only] = commands;
    const result = commands.length === 1 && only ? session.dispatch(only) : session.dispatchAll(commands);
    if (!result.ok) refuse?.(result.diagnostics);
    return result.ok;
  }

  function choose(line: number | null): void {
    if (!drawn) return;
    chosen = line;
    adding = false;
    const lines = linesNow(drawn.score);
    const picked = line === null ? undefined : lines[line];
    if (picked && line !== null) {
      drawn.editor.show("line", picked.text, { canMerge: line + 1 < lines.length, line: line + 1 });
    }
    draw();
  }

  /** Opens the editor on an empty box for a line that does not exist yet. */
  function startAdding(): void {
    if (!drawn || !session.view.editable) return;
    chosen = null;
    adding = true;
    drawn.editor.show("new", "", { canMerge: false, line: 0 });
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
      drawn.editor.show("line", row.line.text, { canMerge: row.index + 1 < rows.length, line: row.index + 1 });
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
      if (d.phrases.children[at] !== view.element) d.phrases.insertBefore(view.element, d.phrases.children[at] ?? null);
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
        item = { element, pick: false, text: create(doc, "span", "sce-lyric-item-text", element) };
        d.items.set(row.index, item);
      }
      if (item.pick !== editable) {
        item.text.remove();
        item.pick = editable;
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
          cancel: () => choose(null),
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
            const line = chosen;
            if (line === null || !run([{ type: "deleteLyricLine", line }])) return;
            live?.say(t.lyricDeleted(line + 1));
            choose(null);
          },
          add(text) {
            const at = linesNow(score).length;
            if (!run([{ type: "insertLyricLine", line: at, text, phrase: null }])) return;
            live?.say(t.lyricAdded(at + 1));
            choose(at);
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
