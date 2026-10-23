// ABOUTME: The look of dragging selected notes, as a stylesheet fragment: the edge grips, the cursors, the ghosts and the touch behaviour.
// ABOUTME: styles.ts appends it to the editor's stylesheet; the edge widths come from note-drag.ts, so the zones a press finds are the ones drawn.
import { EDGE_ZONE, ZONES_PER_NOTE } from "./note-drag";

const fine = EDGE_ZONE.fine;
const coarse = EDGE_ZONE.coarse;

/** A grip: a short bar in the colour of the ground, inside the edge zone, which is also where the cursor changes. */
const grip = (side: "start" | "end") => `
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  ${side === "start" ? "left: 0" : "right: 0"};
  width: var(--sce-_edge);
  cursor: ew-resize;
  background: linear-gradient(var(--sce-_bg), var(--sce-_bg)) center / 2px 50% no-repeat;`;

export const dragCss = `
/*
 * A selected note is taken hold of by its body, which moves the selection, or by an edge zone, which resizes it. The
 * body shows it with the move cursor, and the zones with grips; a note narrower than ${ZONES_PER_NOTE} zones has none, and is all
 * body. A note that continues into a tied note has no zone on that side. A finger gets the wider zone, and the browser
 * keeps its hands off a selected note, so that a slide on it moves it and does not scroll the lane.
 */
.sce-root[data-editable="true"] .sce-note[data-selected] {
  cursor: move;
  touch-action: none;
  container-type: inline-size;
  --sce-_edge: ${fine}px;
}
@media (pointer: coarse) {
  .sce-root[data-editable="true"] .sce-note[data-selected] {
    --sce-_edge: ${coarse}px;
  }
}
@container (min-width: ${ZONES_PER_NOTE * fine}px) {
  @media not (pointer: coarse) {
    .sce-root[data-editable="true"] .sce-note[data-selected]:not([data-tie-prev])::before {${grip("start")}
    }
    .sce-root[data-editable="true"] .sce-note[data-selected]:not([data-tie-next])::after {${grip("end")}
    }
  }
}
@container (min-width: ${ZONES_PER_NOTE * coarse}px) {
  @media (pointer: coarse) {
    .sce-root[data-editable="true"] .sce-note[data-selected]:not([data-tie-prev])::before {${grip("start")}
    }
    .sce-root[data-editable="true"] .sce-note[data-selected]:not([data-tie-next])::after {${grip("end")}
    }
  }
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
.sce-root .sce-lane[data-dragging] .sce-note[data-selected] {
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
}
`;
