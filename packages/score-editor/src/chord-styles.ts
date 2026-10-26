// ABOUTME: The look of editing on the chord track, as a stylesheet fragment: the frame of the chosen place, and the chord picker.
// ABOUTME: styles.ts appends it to the editor's stylesheet; every colour is the text colour, a derivation of it, or the accent for focus.
export const chordCss = `
/*
 * The layer over the chord row that frames a place for a chord. It takes no pointer, so the chord names below it still
 * answer a press, and it sits under the pinned corner so a frame scrolls away beneath the "Chords" label.
 */
.sce-root .sce-chords {
  position: relative;
}
.sce-root .sce-chord-layer {
  position: absolute;
  z-index: 1;
  top: 0;
  bottom: 0;
  left: var(--sce-_keys);
  pointer-events: none;
}
.sce-root :is(.sce-chord-hover, .sce-chord-cursor) {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  width: calc(var(--w) / var(--sce-ticks) * 100%);
  min-width: 8px;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  background: none;
  color: inherit;
  font: inherit;
  pointer-events: none;
}
/* Dashed says "not chosen yet": the place a pointer over the row would take. */
.sce-root .sce-chord-hover {
  border: 1px dashed var(--sce-_text);
}
/* The chosen place and the cursor: DESIGN.md#chord-editing has the frame and the ring. */
.sce-root .sce-chord-cursor {
  appearance: none;
  border: 0 solid var(--sce-_text);
  outline: none;
}
.sce-root .sce-chord-cursor[data-open] {
  border-width: 2px;
}
.sce-root .sce-chord-cursor:focus-visible {
  border-width: 2px;
  outline: 2px solid var(--sce-_accent);
  outline-offset: -4px;
}
.sce-root.sce-part-chord-track[data-editable="true"] .sce-timeline {
  cursor: pointer;
}
/* Forced colours: DESIGN.md#chord-editing says why the border thickens. */
@media (forced-colors: active) {
  .sce-root .sce-chip[aria-checked="true"] {
    border-width: 2px;
    padding-inline: 3px;
  }
  .sce-root .sce-chip-types .sce-chip[aria-checked="true"] {
    padding-inline: 7px;
  }
}

/* The picker's look and its chosen chip are in DESIGN.md#chord-editing. */
.sce-root .sce-chord-picker {
  box-sizing: border-box;
  width: min(21em, calc(100vw - 16px));
  padding: 10px;
}
.sce-root .sce-chord-picker:popover-open {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sce-root .sce-picker-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  column-gap: 12px;
  font-size: 0.92em;
}
.sce-root .sce-picker-place {
  font-weight: 600;
  font-variant-numeric: lining-nums tabular-nums;
}
.sce-root .sce-picker-now {
  color: var(--sce-_muted);
}
.sce-root .sce-picker-name {
  min-height: 1.2em;
  font-size: 1.35em;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: lining-nums tabular-nums;
  overflow-wrap: anywhere;
}
.sce-root .sce-picker-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sce-root .sce-picker-label {
  color: var(--sce-_muted);
  font-size: 0.92em;
}
.sce-root .sce-chip-row {
  display: grid;
  gap: 4px;
}
/* Each row keeps its columns: DESIGN.md#chord-editing. */
.sce-root .sce-chip-letters {
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
.sce-root .sce-chip-spellings {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
.sce-root .sce-picker-bass-body .sce-chip-letters {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.sce-root .sce-chip-types {
  display: flex;
  flex-wrap: wrap;
}
.sce-root .sce-chip {
  justify-content: center;
  min-width: 0;
  padding: 0 4px;
  font-variant-numeric: lining-nums tabular-nums;
}
.sce-root .sce-chip-types .sce-chip {
  padding: 0 8px;
}
.sce-root .sce-chip[aria-checked="true"],
.sce-root .sce-picker-bass {
  justify-content: space-between;
  width: 100%;
}
.sce-root .sce-picker-bass-value {
  margin-left: auto;
  color: var(--sce-_muted);
  font-weight: 600;
}
.sce-root .sce-picker-bass::after {
  content: "";
  width: 5px;
  height: 5px;
  margin-top: -3px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
}
.sce-root .sce-picker-bass[aria-expanded="true"]::after {
  margin-top: 3px;
  transform: rotate(-135deg);
}
.sce-root .sce-picker-bass-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}
.sce-root .sce-picker-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--sce-_line);
}
.sce-root .sce-picker-gap {
  flex: 1 1 auto;
}
/* A finger's width: DESIGN.md#chord-editing. */
@media (pointer: coarse) {
  .sce-root .sce-chord-picker {
    width: calc(100vw - 16px);
  }
  .sce-root .sce-chip-row {
    gap: 6px;
  }
}
`;
