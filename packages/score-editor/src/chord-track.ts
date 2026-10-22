// ABOUTME: The chord track view part: each chord's name at the position the score writes it, or one line saying there are none.
// ABOUTME: A chord name that does not fit its stretch is left out whole by the stylesheet, never cut.
import { gridTicks } from "./arrangement";
import { type BuiltAxis, mountAxisPart } from "./axis-part";
import { create } from "./dom";
import type { EditingSession } from "./session";
import { headerRow } from "./time-ruler";
import type { ViewPart } from "./types";

/** Mounts the chord track on `el`. It draws from the session's score and follows its zoom, scroll and language. */
export function mountChordTrack(el: HTMLElement, session: EditingSession): ViewPart {
  return mountAxisPart(el, session, {
    kind: "chord-track",
    who: "mountChordTrack",
    build(canvas, score, t): BuiltAxis {
      const doc = canvas.ownerDocument;
      const { corner, timeline } = headerRow(canvas, "sce-chords", t.chords);
      corner.textContent = t.chords;
      if (score.chords.length === 0) {
        timeline.removeAttribute("role");
        timeline.removeAttribute("aria-label");
        create(doc, "span", "sce-empty", timeline).textContent = t.noChords;
      } else {
        const end = gridTicks(score);
        const chords = doc.createDocumentFragment();
        score.chords.forEach((chord, index) => {
          const next = score.chords[index + 1]?.start ?? end;
          const item = create(doc, "div", "sce-chord");
          item.setAttribute("role", "listitem");
          item.style.cssText = `--t:${chord.start};--w:${next - chord.start}`;
          item.textContent = chord.name;
          chords.appendChild(item);
        });
        timeline.appendChild(chords);
      }
      return { axes: [timeline], grids: [], corner, timeline, barCount: 0 };
    },
  });
}
