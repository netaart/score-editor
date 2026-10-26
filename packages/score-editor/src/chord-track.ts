// ABOUTME: The chord track view part: each chord's name at the position the score writes it, or one line saying there are none.
// ABOUTME: A chord name that does not fit its stretch is left out whole by the stylesheet; while editable, a press places a chord (chord-editing.ts).
import { gridTicks } from "./arrangement";
import { type BuiltAxis, headerRow, mountAxisPart } from "./axis-part";
import { type ChordEditing, mountChordEditing } from "./chord-editing";
import { create } from "./dom";
import { sayRefusals } from "./live-region";
import type { EditingSession } from "./session";
import type { AxisPartOptions, ViewPart } from "./types";

/**
 * Mounts the chord track on `el`. It draws from the session's score and follows its zoom, scroll and language. While the
 * session is editable and shows the arrangement, a click or tap on the track, or its keyboard cursor, places, changes or
 * removes the chord at the nearest start of a note or rest in a voice that allows chords (see `mountChordEditing`).
 */
export function mountChordTrack(el: HTMLElement, session: EditingSession, options?: AxisPartOptions): ViewPart {
  let editing: ChordEditing | null = null;
  return mountAxisPart(
    el,
    session,
    {
      kind: "chord-track",
      who: "mountChordTrack",
      region: (t) => t.chords,
      attach(root, signal, live) {
        editing = mountChordEditing(root, session, signal, live, {
          ...(options?.scroller === undefined ? {} : { scroller: options.scroller }),
          refused: sayRefusals(live, session, options?.onRefused),
        });
      },
      refresh() {
        editing?.sync();
      },
      build(canvas, score, t): BuiltAxis {
        const doc = canvas.ownerDocument;
        const { corner, timeline } = headerRow(canvas, "sce-chords", t.chords);
        corner.textContent = t.chords;
        const end = gridTicks(score);
        if (score.chords.length === 0) {
          timeline.removeAttribute("role");
          timeline.removeAttribute("aria-label");
          create(doc, "span", "sce-empty", timeline).textContent = t.noChords;
        } else {
          const chords = doc.createDocumentFragment();
          score.chords.forEach((chord, index) => {
            const next = score.chords[index + 1]?.start ?? end;
            const item = create(doc, "div", "sce-chord");
            item.setAttribute("role", "listitem");
            item.dataset.noteId = chord.noteId ?? "";
            item.style.cssText = `--t:${chord.start};--w:${next - chord.start}`;
            item.textContent = chord.name;
            chords.appendChild(item);
          });
          timeline.appendChild(chords);
        }
        const row = timeline.parentElement;
        const layer = row && editing?.draw({ row, corner, timeline, score, ticks: end });
        return { axes: layer ? [timeline, layer] : [timeline], grids: [], corner, timeline, barCount: 0 };
      },
    },
    options,
  );
}
