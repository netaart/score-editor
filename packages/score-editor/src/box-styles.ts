// ABOUTME: The look of the box a pointer draws over a voice lane to select several notes, as a stylesheet fragment.
// ABOUTME: styles.ts appends it to the editor's stylesheet; the box takes shape and weight from the text colour and no accent.
export const boxCss = `
/*
 * The box drawn while a pointer selects several notes: a dashed outline, so it reads as not yet chosen beside the solid
 * frame of a selected note, over a faint wash of the text colour. It takes no pointer, so it never hides what is under it.
 */
.sce-root .sce-box {
  position: absolute;
  z-index: 3;
  box-sizing: border-box;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  width: calc(var(--d) / var(--sce-ticks) * 100%);
  top: calc(var(--r) * var(--sce-_row));
  height: calc(var(--h) * var(--sce-_row));
  border: 1px dashed var(--sce-_text);
  background: color-mix(in srgb, var(--sce-_text) 8%, transparent);
  pointer-events: none;
}
/*
 * A finger that has rested on empty lane long enough has no box yet and covers the place it rests on, so the box is shown
 * as a square larger than a fingertip around that place until the finger slides.
 */
.sce-root .sce-box[data-anchor] {
  min-width: 56px;
  min-height: 56px;
  margin: -28px 0 0 -28px;
}
/* While a box is open, or a finger has rested to start one, the whole lane is a little tinted, so it is seen away from the hand. */
.sce-root .sce-lane[data-boxing] {
  background-color: color-mix(in srgb, var(--sce-_text) 6%, transparent);
}
/* Where the system forces its colours the wash goes and the outline keeps the box: heavier, in the system text colour. */
@media (forced-colors: active) {
  .sce-root .sce-box {
    border: 2px dashed CanvasText;
    background: transparent;
  }
}
`;
