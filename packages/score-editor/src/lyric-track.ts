// ABOUTME: The lyric track view part: the song's lyric lines as phrase blocks over their bars, with the syllable and note-start counts.
// ABOUTME: Green when the counts are equal, yellow when not; the syllables stand on their notes, and lines not on bars are listed below.
import { gridRunsOf } from "./arrangement";
import { type BuiltAxis, type Grid, mountAxisPart } from "./axis-part";
import { create } from "./dom";
import type { Messages } from "./i18n";
import { type LyricRow, lyricRows } from "./lyric-edit";
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

/** A phrase block as the track keeps it, so a redraw updates the same elements and a press in progress keeps its target. */
interface PhraseView {
  readonly element: HTMLElement;
  readonly count: HTMLElement;
  readonly text: HTMLElement;
}

/** A line of the unaligned area as the track keeps it. */
interface ItemView {
  readonly element: HTMLElement;
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
  readonly unaligned: HTMLElement;
  readonly views: Map<number, PhraseView>;
  readonly items: Map<number, ItemView>;
  /** What the last draw was made from: a change in any of these draws again. */
  shown: { readonly project: unknown; readonly editable: boolean } | null;
}

/**
 * Mounts the lyric track on `el`. It draws from the session's project and follows its zoom, scroll and language: each
 * lyric line that sits on bars is a block over them with the number of its syllables over the number of its note starts,
 * green when the two are equal and yellow, with a broken line, when not; when they are equal each syllable stands at its
 * note. Lines not on bars are listed under the lane.
 */
export function mountLyricTrack(el: HTMLElement, session: EditingSession, options?: AxisPartOptions): ViewPart {
  let drawn: Drawn | null = null;
  let root: HTMLElement | null = null;

  function draw(): void {
    if (!drawn) return;
    const { score, t } = drawn;
    const { project } = session;
    const editable = session.view.editable;
    if (drawn.shown && drawn.shown.project === project && drawn.shown.editable === editable) return;
    drawn.shown = { project, editable };
    root?.setAttribute("data-editable", String(editable));

    const rows = lyricRows(score, lyricLinesOf(project, score));
    const placed = rows.filter((row) => row.phrase !== null && row.alignment !== null);
    const loose = rows.filter((row) => row.phrase === null);
    drawPhrases(drawn, placed);
    drawSyllables(drawn, placed);
    drawUnaligned(drawn, loose);

    drawn.empty.hidden = placed.length > 0;
    drawn.phrases.hidden = placed.length === 0;
    setText(drawn.empty, rows.length === 0 ? t.noLyrics : t.noLyricsOnBars);
    drawn.panel.hidden = !editable && loose.length === 0;
  }

  function drawPhrases(d: Drawn, placed: ReadonlyArray<LyricRow>): void {
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
          selected: false,
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

  function drawUnaligned(d: Drawn, loose: ReadonlyArray<LyricRow>): void {
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
        item = { element, text: create(doc, "span", "sce-lyric-item-text", element) };
        d.items.set(row.index, item);
      }
      setText(item.text, row.line.text);
      if (d.unaligned.children[at] !== item.element)
        d.unaligned.insertBefore(item.element, d.unaligned.children[at] ?? null);
    }
    d.unaligned.hidden = loose.length === 0;
    d.title.hidden = loose.length === 0;
    setText(d.badge, String(loose.length));
  }

  const part = mountAxisPart(
    el,
    session,
    {
      kind: "lyric-track",
      who: "mountLyricTrack",
      region: (t) => t.lyrics,
      attach(own) {
        root = own;
        own.setAttribute("data-editable", String(session.view.editable));
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
          unaligned,
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
    },
  };
}
