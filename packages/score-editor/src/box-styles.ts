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
/* While a box is open, or a finger has rested to start one, the whole lane is a little darker, so a hand over the corner still sees it. */
.sce-root .sce-lane[data-boxing] {
  background-color: color-mix(in srgb, var(--sce-_text) 4%, transparent);
}
`;
