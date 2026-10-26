// ABOUTME: The time ruler view part: the bar numbers, the section bands and the key and meter marks above the tracks.
// ABOUTME: Bar numbers thin out as the zoom narrows, choose a run of bars by pointer or key, and a cut score ends its marks with the cut.
import { barIndexAt, gridTicks, labelRank, marksOf } from "./arrangement";
import { type BuiltAxis, headerRow, mountAxisPart } from "./axis-part";
import { create } from "./dom";
import { type Messages, messagesFor } from "./i18n";
import type { Score } from "./score";
import type { EditingSession } from "./session";
import type { AxisPartOptions, ViewPart } from "./types";

function buildRuler(
  canvas: HTMLElement,
  score: Score,
  t: Messages,
): { corner: HTMLElement; timeline: HTMLElement; selection: HTMLElement } {
  const doc = canvas.ownerDocument;
  const row = headerRow(canvas, "sce-ruler", t.bars);
  const numbers = doc.createDocumentFragment();
  for (const bar of score.bars) {
    const label = create(doc, "span", "sce-bar-number");
    label.setAttribute("role", "listitem");
    label.dataset.rank = String(labelRank(bar.index));
    label.dataset.bar = String(bar.index);
    label.tabIndex = -1;
    label.style.setProperty("--t", String(bar.start));
    label.textContent = String(bar.index + 1);
    numbers.appendChild(label);
  }
  row.timeline.appendChild(numbers);
  const selection = create(doc, "div", "sce-bar-selection", row.timeline);
  selection.setAttribute("aria-hidden", "true");
  selection.hidden = true;
  return { corner: row.corner, timeline: row.timeline, selection };
}

/** One band per section that has bars; a marker with no bars after it has nothing to cover. */
function buildSections(canvas: HTMLElement, score: Score, t: Messages): HTMLElement {
  const doc = canvas.ownerDocument;
  const { timeline } = headerRow(canvas, "sce-sections", t.sections);
  for (const section of score.sections) {
    const first = score.bars[section.firstBar];
    const last = score.bars[section.firstBar + section.barCount - 1];
    if (section.barCount < 1 || !first || !last) continue;
    const band = create(doc, "div", "sce-section", timeline);
    band.setAttribute("role", "listitem");
    band.style.cssText = `--t:${first.start};--d:${last.start + last.length - first.start}`;
    create(doc, "span", "sce-section-name", band).textContent = section.name ?? t.unnamedSection;
  }
  return timeline;
}

/** The key and meter flags: what is in force at the start, then each change at the position it takes effect. */
function buildMarks(canvas: HTMLElement, score: Score, t: Messages): HTMLElement {
  const doc = canvas.ownerDocument;
  const { timeline } = headerRow(canvas, "sce-marks", t.marks);
  const end = gridTicks(score);
  const marks = marksOf(score);
  const flags = doc.createDocumentFragment();
  marks.forEach((mark, index) => {
    const next = marks[index + 1]?.at ?? end;
    const flag = create(doc, "div", "sce-mark");
    flag.setAttribute("role", "listitem");
    flag.style.cssText = `--t:${mark.at};--w:${Math.max(0, next - mark.at)}`;
    const items = create(doc, "div", "sce-mark-items", flag);
    const names: string[] = [];
    if (mark.meter) {
      create(doc, "span", "sce-mark-item", items).textContent = t.meterText(mark.meter);
      names.push(t.meterName(mark.meter));
    }
    if (mark.key) {
      create(doc, "span", "sce-mark-item", items).textContent = t.keyText(mark.key);
      names.push(t.keyText(mark.key));
    }
    if (mark.cut) {
      const text = mark.cut.short ? t.incompleteBar : t.cutOff;
      create(doc, "span", "sce-mark-item", items).textContent = text;
      names.push(text);
      if (!mark.cut.short) flag.dataset.edge = "end";
    }
    flag.setAttribute("aria-label", names.join(", "));
    flags.appendChild(flag);
  });
  timeline.appendChild(flags);
  return timeline;
}

/**
 * Mounts the time ruler on `el`: the bar numbers, the section bands and the key and meter marks. It draws from the
 * session's score and follows its zoom, scroll and language. Place it above the tracks; it scrolls with them. While the
 * session is editable a bar number chooses its bar, a drag across the ruler chooses a run, and the keys move the run.
 */
export function mountTimeRuler(el: HTMLElement, session: EditingSession, options?: AxisPartOptions): ViewPart {
  let score: Score | null = null;
  let rulerRoot: HTMLElement | null = null;
  return mountAxisPart(
    el,
    session,
    {
      kind: "time-ruler",
      who: "mountTimeRuler",
      region: (t) => t.timeRuler,
      attach(root, signal, live) {
        rulerRoot = root;
        root.setAttribute("data-editable", String(session.view.editable));
        let drag: { pointerId: number; anchor: number; bar: number } | null = null;
        let announced = "";
        let lastPointerType = "mouse";

        const barAt = (clientX: number): number | null => {
          if (score === null || score.bars.length === 0) return null;
          const timeline = root.querySelector<HTMLElement>(".sce-ruler .sce-timeline");
          if (!timeline) return null;
          const rect = timeline.getBoundingClientRect();
          if (rect.width <= 0) return null;
          const tick = ((clientX - rect.left) / rect.width) * gridTicks(score);
          return Math.max(0, Math.min(score.bars.length - 1, barIndexAt(score.bars, tick)));
        };
        const choose = (anchor: number, bar: number): void => {
          const from = Math.min(anchor, bar);
          session.setBarSelection({ from, count: Math.abs(anchor - bar) + 1 });
        };
        const focusBar = (bar: number): void => {
          root.querySelector<HTMLElement>(`.sce-bar-number[data-bar="${bar}"]`)?.focus();
        };
        const selected = () => (session.view.editable ? session.barSelection : null);

        root.addEventListener(
          "pointerdown",
          (event) => {
            lastPointerType = event.pointerType;
          },
          { capture: true, signal },
        );
        root.addEventListener(
          "pointerdown",
          (event) => {
            if (!session.view.editable || score === null || !event.isPrimary || event.button !== 0) return;
            // A finger taps a bar to choose it; its swipe stays the scroller's, so only a pointer drags a run.
            if (event.pointerType === "touch") return;
            const target =
              event.target instanceof Element ? event.target.closest<HTMLElement>(".sce-bar-number") : null;
            if (!target) return;
            const bar = Number(target.dataset.bar);
            const anchor = event.shiftKey ? (selected()?.from ?? bar) : bar;
            event.preventDefault();
            try {
              root.setPointerCapture(event.pointerId);
            } catch {
              // The pointer is gone already; the release that follows is the pointercancel.
            }
            drag = { pointerId: event.pointerId, anchor, bar };
            choose(anchor, bar);
            target.focus();
          },
          { signal },
        );
        root.addEventListener(
          "click",
          (event) => {
            if (!session.view.editable || score === null || lastPointerType !== "touch") return;
            const target =
              event.target instanceof Element ? event.target.closest<HTMLElement>(".sce-bar-number") : null;
            if (!target) return;
            const bar = Number(target.dataset.bar);
            const range = selected();
            if (range === null) {
              session.setBarSelection({ from: bar, count: 1 });
              return;
            }
            const first = range.from;
            const last = range.from + range.count - 1;
            if (bar >= first && bar <= last) {
              session.setBarSelection({ from: bar, count: 1 });
              return;
            }
            const from = Math.min(first, bar);
            const to = Math.max(last, bar);
            session.setBarSelection({ from, count: to - from + 1 });
          },
          { signal },
        );
        root.addEventListener(
          "pointermove",
          (event) => {
            if (drag === null || event.pointerId !== drag.pointerId) return;
            const bar = barAt(event.clientX);
            if (bar === null || bar === drag.bar) return;
            drag.bar = bar;
            choose(drag.anchor, bar);
          },
          { signal },
        );
        const endDrag = (event: PointerEvent): void => {
          if (drag === null || event.pointerId !== drag.pointerId) return;
          const { bar } = drag;
          drag = null;
          if (event.type !== "pointercancel") focusBar(bar);
        };
        root.addEventListener("pointerup", endDrag, { signal });
        root.addEventListener("pointercancel", endDrag, { signal });

        root.addEventListener(
          "keydown",
          (event) => {
            if (!session.view.editable || score === null || event.defaultPrevented || event.isComposing) return;
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            const target =
              event.target instanceof Element ? event.target.closest<HTMLElement>(".sce-bar-number") : null;
            if (!target) return;
            const last = score.bars.length - 1;
            const here = Number(target.dataset.bar);
            const range = selected();
            const from = range?.from ?? here;
            const to = range === null ? here : range.from + range.count - 1;
            let next: { from: number; count: number } | null = null;
            if (event.key === "ArrowLeft") {
              next =
                event.shiftKey && range
                  ? { from: Math.max(0, from - 1), count: to - Math.max(0, from - 1) + 1 }
                  : { from: Math.max(0, here - 1), count: 1 };
            } else if (event.key === "ArrowRight") {
              next =
                event.shiftKey && range
                  ? { from, count: Math.min(last, to + 1) - from + 1 }
                  : { from: Math.min(last, here + 1), count: 1 };
            } else if (event.key === "Home") {
              next = event.shiftKey && range ? { from: 0, count: to + 1 } : { from: 0, count: 1 };
            } else if (event.key === "End") {
              next = event.shiftKey && range ? { from, count: last - from + 1 } : { from: last, count: 1 };
            } else if (event.key === "Escape" && range) {
              event.preventDefault();
              session.setBarSelection(null);
              return;
            } else if (event.key === "Enter" || event.key === " ") {
              next = { from: here, count: 1 };
            }
            if (next === null) return;
            event.preventDefault();
            session.setBarSelection(next);
            focusBar(next.from);
          },
          { signal },
        );

        const unsubscribe = session.subscribe(() => {
          const range = selected();
          const first = range === null ? 0 : range.from + 1;
          const last = range === null ? 0 : range.from + range.count;
          const key = range === null ? "" : `${first}:${last}`;
          if (key !== announced && range !== null)
            live.say(messagesFor(session.view.language).barSelection(first, last));
          announced = key;
        });
        signal.addEventListener("abort", unsubscribe, { once: true });
      },
      refresh() {
        const root = rulerRoot;
        const editable = session.view.editable;
        root?.setAttribute("data-editable", String(editable));
        const range = editable ? session.barSelection : null;
        const t = messagesFor(session.view.language);
        const barNodes = root?.querySelectorAll<HTMLElement>(".sce-bar-number") ?? [];
        for (const node of barNodes) {
          const index = Number(node.dataset.bar);
          const chosen = range !== null && index >= range.from && index < range.from + range.count;
          if (chosen) {
            node.dataset.selected = "";
            node.setAttribute("aria-label", t.barLabel(index + 1, true));
          } else {
            delete node.dataset.selected;
            node.removeAttribute("aria-label");
          }
        }
        const band = root?.querySelector<HTMLElement>(".sce-bar-selection");
        if (!band) return;
        const first = range === null || score === null ? undefined : score.bars[range.from];
        const last = range === null || score === null ? undefined : score.bars[range.from + range.count - 1];
        if (!first || !last) {
          band.hidden = true;
          return;
        }
        band.hidden = false;
        band.style.setProperty("--t", String(first.start));
        band.style.setProperty("--d", String(last.start + last.length - first.start));
      },
      build(canvas, found, t): BuiltAxis {
        score = found;
        const ruler = buildRuler(canvas, found, t);
        const sections = buildSections(canvas, found, t);
        const marks = buildMarks(canvas, found, t);
        return {
          axes: [ruler.timeline, sections, marks],
          grids: [],
          corner: ruler.corner,
          timeline: ruler.timeline,
          barCount: found.bars.length,
        };
      },
    },
    options,
  );
}
