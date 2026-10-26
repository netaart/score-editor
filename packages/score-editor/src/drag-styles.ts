// ABOUTME: The look of dragging selected notes, as a stylesheet fragment: the edge grips, the cursors, the ghosts and the touch behaviour.
// ABOUTME: styles.ts appends it to the editor's stylesheet; the edge widths come from note-drag.ts, so the zones a press finds are the ones drawn.
import { EDGE_ZONE, EDGE_ZONE_FLOOR, EDGE_ZONE_SHARE, ZONES_PER_NOTE } from "./note-drag";

const fine = EDGE_ZONE.fine;
const coarse = EDGE_ZONE.coarse;
const floor = EDGE_ZONE_FLOOR;
const share = Math.round(EDGE_ZONE_SHARE * 100);

/** The smallest inside width the hit test accepts, less the sliver that makes the clamp turn over at the threshold itself. */
const gate = (width: number) => `${width - 0.01}px`;
const fineGate = gate(ZONES_PER_NOTE * EDGE_ZONE.fine);
const coarseGate = gate(ZONES_PER_NOTE * EDGE_ZONE_FLOOR);

const bar = "linear-gradient(var(--sce-_grip), var(--sce-_grip))";
const at = (side: "left" | "right") => `${side} calc(var(--sce-_edge) / 2 - 1px) center`;
const size = "clamp(0px, calc((100% - var(--sce-_grip-gate)) * 1000), 2px) 50%";

/**
 * The two grips as background layers of the note, each 2px wide and centred in its edge zone. `100%` is the note's
 * padding box, which is the inside width the hit test reads, so the clamp opens them only where a press finds a zone.
 */
const grips = (sides: "both" | "start" | "end" | "none") => {
  if (sides === "none") return "background-image: none;";
  const images = sides === "both" ? `${bar}, ${bar}` : bar;
  const positions = sides === "both" ? `${at("left")}, ${at("right")}` : at(sides === "start" ? "left" : "right");
  const sizes = sides === "both" ? `${size}, ${size}` : size;
  return `background-image: ${images}; background-position: ${positions}; background-size: ${sizes}; background-repeat: no-repeat;`;
};

export const dragCss = `
/*
 * A selected note is taken hold of by its body, which moves the selection, or by an edge zone, which resizes it. The
 * body shows it with the move cursor, and the zones with grips; a note narrower than three zones has none, and is all
 * body. A note that continues into a tied note has no zone on that side. A finger gets the wider zone, narrowed on a
 * narrow note to ${share}% of its width but never below ${floor}px, which is the share and the floor note-drag.ts reads.
 * The grips are two layers of the note's own background, so a zoom paints them without restyling any note. The browser
 * keeps its hands off a selected note, so that a slide on it moves it and does not scroll the lane.
 */
.sce-root[data-editable="true"] .sce-note[data-selected] {
  cursor: move;
  touch-action: none;
  --sce-_edge: ${fine}px;
  --sce-_grip: var(--sce-_bg);
  --sce-_grip-gate: ${fineGate};
  ${grips("both")}
}
@media (pointer: coarse) {
  .sce-root[data-editable="true"] .sce-note[data-selected] {
    --sce-_edge: max(${floor}px, min(${coarse}px, ${share}%));
    --sce-_grip-gate: ${coarseGate};
  }
}
.sce-root[data-editable="true"] .sce-note[data-selected][data-tie-prev] {
  ${grips("end")}
}
.sce-root[data-editable="true"] .sce-note[data-selected][data-tie-next] {
  ${grips("start")}
}
.sce-root[data-editable="true"] .sce-note[data-selected][data-tie-prev][data-tie-next] {
  ${grips("none")}
}
/* A mouse over an edge zone gets the resize cursor; the track sets the mark from the same hit test a press uses. */
.sce-root[data-editable="true"] .sce-note[data-selected][data-edge-cursor] {
  cursor: ew-resize;
}
/* While the notes are carried the lane keeps one cursor, and the notes wait where they are, a little quieter, under the ghosts. */
.sce-root .sce-lane[data-dragging] {
  cursor: grabbing;
}
.sce-root .sce-lane[data-dragging="resize"] {
  cursor: ew-resize;
}
.sce-root .sce-lane[data-dragging] .sce-note {
  cursor: inherit;
}
.sce-root .sce-lane[data-ghosted] .sce-note[data-selected] {
  opacity: 0.55;
}
/*
 * The ghost of a dragged note, or of a chain of tied notes: a dashed outline where the release would put it, the way the
 * box is dashed for what is not yet chosen. It is only an outline, so the bar lines and the notes under it show through,
 * and a note that would cross a bar line is seen to cross it. It takes no pointer.
 */
.sce-root .sce-ghost {
  position: absolute;
  z-index: 3;
  box-sizing: border-box;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  width: calc(var(--d) / var(--sce-ticks) * 100%);
  top: calc(var(--r) * var(--sce-_row));
  height: var(--sce-_row);
  border: 2px dashed var(--sce-_text);
  border-radius: min(var(--sce-_radius), 3px);
  pointer-events: none;
}
@media (forced-colors: active) {
  .sce-root .sce-ghost {
    border-color: CanvasText;
  }
  .sce-root[data-editable="true"] .sce-note[data-selected] {
    --sce-_grip: CanvasText;
  }
  /*
   * The system repaints a fill and drops a gradient from it, so the grips are drawn once more on a pseudo-element that
   * opts out. It is inside the note's padding box, where the note's own background layers are, and takes no pointer.
   */
  .sce-root[data-editable="true"] .sce-note[data-selected]::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    forced-color-adjust: none;
    ${grips("both")}
  }
  .sce-root[data-editable="true"] .sce-note[data-selected][data-tie-prev]::before {
    ${grips("end")}
  }
  .sce-root[data-editable="true"] .sce-note[data-selected][data-tie-next]::before {
    ${grips("start")}
  }
  .sce-root[data-editable="true"] .sce-note[data-selected][data-tie-prev][data-tie-next]::before {
    ${grips("none")}
  }
}
`;
