// ABOUTME: The look of the section menu: the control laid over each section band, a muted choice with its reason, and the name form.
// ABOUTME: styles.ts appends it to the editor's stylesheet; it takes every colour from the theme variables and adds no accent of its own.
export const sectionMenuCss = `
/*
 * The control of a section band is a transparent button over the whole band, so the band's name keeps its pinned place and
 * a press anywhere on the band opens the menu. A chevron after the name says the band opens something, as the zoom value
 * and the Select button do; it is there only while the part is editable.
 */
.sce-root .sce-section-open {
  position: absolute;
  z-index: 1;
  inset: 0;
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
@media (hover: hover) {
  .sce-root .sce-section-open:hover {
    background: color-mix(in srgb, var(--sce-_text) 6%, transparent);
  }
}
.sce-root .sce-section-open[aria-expanded="true"] {
  background: color-mix(in srgb, var(--sce-_text) 10%, transparent);
}
.sce-root .sce-section-open:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: -2px;
}
.sce-root[data-editable="true"] .sce-section-name::after {
  content: "";
  display: inline-block;
  width: 5px;
  height: 5px;
  margin: 0 0 3px 6px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
}
.sce-root .sce-section-menus {
  display: contents;
}

/*
 * A choice the commands would refuse stays in the menu, muted. Their words stand once under the last of the muted choices
 * they are said about, aligned with the labels, and not under every one of them.
 */
.sce-root .sce-menu-note {
  max-width: 22em;
  padding: 0 10px 6px 22px;
  color: var(--sce-_muted);
  font-size: 0.92em;
}

/* The name form hangs under the band like the menu, and holds one or two text fields. */
.sce-root .sce-section-form {
  width: 20em;
  max-width: calc(100vw - 16px);
  padding: 10px;
}
.sce-root .sce-form {
  display: grid;
  gap: 10px;
  margin: 0;
}
.sce-root .sce-form-field {
  display: grid;
  gap: 4px;
}
.sce-root .sce-form-label {
  font-weight: 600;
}
.sce-root .sce-form-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 28px;
  margin: 0;
  padding: 0 8px;
  border: 1px solid var(--sce-_line-strong);
  border-radius: var(--sce-_radius);
  background: var(--sce-_bg);
  color: var(--sce-_text);
  font: inherit;
  -webkit-user-select: text;
  user-select: text;
}
.sce-root .sce-form-input:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: 2px;
}
.sce-root .sce-form-input[aria-invalid="true"] {
  border-width: 2px;
  border-color: var(--sce-_text);
  padding: 0 7px;
}
.sce-root .sce-form-hint,
.sce-root .sce-form-error {
  margin: 0;
}
.sce-root .sce-form-hint {
  color: var(--sce-_muted);
  font-size: 0.92em;
}
.sce-root .sce-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.sce-root .sce-button-strong {
  font-weight: 600;
}
/*
 * A band is 22px tall, under the 24px WCAG 2.5.8 asks of a target and the 36px DESIGN.md asks of a control on a coarse
 * pointer. So on a coarse pointer the row of bands is 25px (a 24px control and the 1px rule under it), and the control
 * reaches 12px up into the row of bar numbers, which takes no press, for 36px in all. The row does not grow further because
 * a phone's frame has little height to give: at 36px the finger-drawn selection box of the multi-select spec no longer found
 * empty lane to start on. Nothing reaches down into the row of key and meter marks. Only the row of bands grows, and the
 * offset the tracks hang from follows it.
 */
@media (pointer: coarse) {
  .sce-root.sce-root {
    --sce-_sections: max(var(--sce-_band), 25px);
    --sce-_top: calc(var(--sce-_ruler) + var(--sce-_sections) + var(--sce-_band) + var(--sce-_chords));
  }
  .sce-root .sce-sections {
    height: var(--sce-_sections);
  }
  .sce-root .sce-section-open::before {
    content: "";
    position: absolute;
    right: 0;
    bottom: 100%;
    left: 0;
    height: 12px;
  }
  .sce-root .sce-form-input {
    min-height: 36px;
    font-size: max(16px, 1em);
  }
}
`;
