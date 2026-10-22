// ABOUTME: The time ruler view part: the bar numbers, the section bands and the key and meter marks above the tracks.
// ABOUTME: Bar numbers thin out as the zoom narrows the bars; a cut score ends its marks with the cut.
import { gridTicks, labelRank, marksOf } from "./arrangement";
import { type BuiltAxis, headerRow, mountAxisPart } from "./axis-part";
import { create } from "./dom";
import type { Messages } from "./i18n";
import type { Score } from "./score";
import type { EditingSession } from "./session";
import type { AxisPartOptions, ViewPart } from "./types";

function buildRuler(canvas: HTMLElement, score: Score, t: Messages): { corner: HTMLElement; timeline: HTMLElement } {
  const doc = canvas.ownerDocument;
  const row = headerRow(canvas, "sce-ruler", t.bars);
  const numbers = doc.createDocumentFragment();
  for (const bar of score.bars) {
    const label = create(doc, "span", "sce-bar-number");
    label.setAttribute("role", "listitem");
    label.dataset.rank = String(labelRank(bar.index));
    label.style.setProperty("--t", String(bar.start));
    label.textContent = String(bar.index + 1);
    numbers.appendChild(label);
  }
  row.timeline.appendChild(numbers);
  return row;
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
 * session's score and follows its zoom, scroll and language. Place it above the tracks; it scrolls with them.
 */
export function mountTimeRuler(el: HTMLElement, session: EditingSession, options?: AxisPartOptions): ViewPart {
  return mountAxisPart(
    el,
    session,
    {
      kind: "time-ruler",
      who: "mountTimeRuler",
      region: (t) => t.timeRuler,
      build(canvas, score, t): BuiltAxis {
        const ruler = buildRuler(canvas, score, t);
        const sections = buildSections(canvas, score, t);
        const marks = buildMarks(canvas, score, t);
        return {
          axes: [ruler.timeline, sections, marks],
          grids: [],
          corner: ruler.corner,
          timeline: ruler.timeline,
          barCount: score.bars.length,
        };
      },
    },
    options,
  );
}
