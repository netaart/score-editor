// ABOUTME: The stylesheet of the editor and its view parts as a string, injected by mount() and by each part, and removed again by destroy().
// ABOUTME: Every class is prefixed "sce-", every theme variable is "--sce-*", and nothing is imported as a CSS file.
import { MAX_LABEL_STEP } from "./arrangement";
import { boxCss } from "./box-styles";
import { draftCss } from "./draft-styles";
import { dragCss } from "./drag-styles";
import { filterCss } from "./filter-styles";
import { lyricCss } from "./lyric-styles";
import { TICKS_PER_QUARTER } from "./score";

/** Rows of a 12-row octave, counted from the top (B first), whose pitch is a black key. */
const BLACK_KEY_ROWS = [1, 3, 5, 8, 10];

/** One octave of row shading as hard-stop gradient stops: black-key rows shaded, a line under the C row. */
function octaveStripes(): string {
  const stops: string[] = [];
  for (let row = 0; row < 12; row++) {
    const color = BLACK_KEY_ROWS.includes(row) ? "var(--sce-_shade)" : "transparent";
    stops.push(`${color} calc(var(--sce-_row) * ${row})`, `${color} calc(var(--sce-_row) * ${row + 1})`);
  }
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

/** Bar numbers thin out as bars get narrow: at step 2^e the numbers of rank below e are hidden. */
function labelThinning(): string {
  const rules: string[] = [];
  for (let e = 1; 2 ** e <= MAX_LABEL_STEP; e++) {
    const ranks = Array.from({ length: e }, (_, rank) => `[data-rank="${rank}"]`).join(", ");
    rules.push(`.sce-root[data-label-step="${2 ** e}"] .sce-bar-number:is(${ranks}) { display: none; }`);
  }
  return rules.join("\n");
}

/** One kind of grid line, drawn as a gradient: a one pixel line at the start of every period of `beats` beats. */
function gridLines(color: string, beats: string): string {
  return `repeating-linear-gradient(to right, var(${color}) 0 1px, transparent 1px calc(var(--sce-_beat) * var(${beats})))`;
}

const css = `
/* The doubled class lifts specificity above the typical host rule such as ".page div". */
.sce-root.sce-root {
  all: initial;
  position: relative;
  isolation: isolate;
  --sce-_bg: var(--sce-color-bg, light-dark(#ffffff, #1b1c1f));
  --sce-_text: var(--sce-color-text, light-dark(#18181b, #ececee));
  /* Unmapped greys are derived from the two that are mapped, so a host that maps only these stays readable. */
  --sce-_surface: var(--sce-color-surface, color-mix(in srgb, var(--sce-_text) 5%, var(--sce-_bg)));
  --sce-_muted: var(--sce-color-muted, color-mix(in srgb, var(--sce-_text) 66%, var(--sce-_bg)));
  --sce-_line: var(--sce-color-line, color-mix(in srgb, var(--sce-_text) 13%, var(--sce-_bg)));
  --sce-_line-strong: var(--sce-color-line-strong, color-mix(in srgb, var(--sce-_text) 28%, var(--sce-_bg)));
  --sce-_accent: var(--sce-color-accent, light-dark(#2457d6, #7da3ff));
  --sce-_note: var(--sce-color-note, var(--sce-_accent));
  --sce-_radius: var(--sce-radius, 4px);
  --sce-_row: var(--sce-row-height, 14px);
  --sce-_beat: var(--sce-beat-width, 40px);
  --sce-_keys: var(--sce-keys-width, 44px);
  --sce-_shade: color-mix(in srgb, var(--sce-_text) 5%, transparent);
  /* Row heights follow the text size, which the user's browser sets; round() keeps the 1px rules on whole pixels. */
  --sce-_ruler: round(1.85em, 1px);
  --sce-_band: round(1.7em, 1px);
  --sce-_chords: round(2em, 1px);
  --sce-_top: calc(var(--sce-_ruler) + 2 * var(--sce-_band) + var(--sce-_chords));

  background: var(--sce-_bg);
  color: var(--sce-_text);
  font-family: var(--sce-font-family, inherit);
  /* A keyword, so the user's browser font size applies and the host's rem tricks do not; the rest is in em. */
  font-size: small;
  line-height: 1.3;
  text-align: start;
  direction: inherit;
  color-scheme: inherit;
}
@media (pointer: coarse) {
  .sce-root.sce-root {
    --sce-_row: var(--sce-row-height, 24px);
  }
}

.sce-editor.sce-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 288px;
  overflow: hidden;
  /* Where the track heads pin: right under the header block that the editor pins above the tracks. */
  --sce-_head-top: var(--sce-_top);
}
.sce-part.sce-part {
  display: block;
}
.sce-editor .sce-part.sce-part,
.sce-part-toolbar .sce-part.sce-part {
  display: contents;
}
.sce-root.sce-axis {
  overflow-x: auto;
  direction: ltr;
  touch-action: pan-x pan-y pinch-zoom;
  -webkit-user-select: none;
  user-select: none;
}
.sce-root.sce-part-time-ruler,
.sce-root.sce-part-chord-track {
  scrollbar-width: none;
}
.sce-root.sce-axis:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: -2px;
}
.sce-root.sce-in-scroller {
  overflow: visible;
}

/*
 * Hard reset: a host's element selectors must not reach inside. Revert rolls back to browser defaults.
 * Notes are left out on purpose: all: revert on each of a few thousand nodes made first render
 * three times slower (style recalculation), so a note resets the few properties it needs by hand.
 */
.sce-root.sce-root :where(:not(.sce-note)),
.sce-root.sce-root :where(:not(.sce-note))::before,
.sce-root.sce-root :where(:not(.sce-note))::after {
  all: revert;
  box-sizing: border-box;
}
.sce-root.sce-root [hidden] {
  display: none;
}

.sce-root .sce-toolbar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 4px 12px;
  /* When the box is narrower than the controls the row scrolls; a toolbar that wraps moves a control to a later row. */
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  background: var(--sce-_surface);
  border-bottom: 1px solid var(--sce-_line);
}
.sce-root .sce-title {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* A toolbar that holds the Filter button keeps at least 2em of the title, so the extra control cannot take its last pixel. */
.sce-root .sce-toolbar:has(.sce-filter-button) .sce-title {
  min-width: 2em;
}
/*
 * With the preview control or the view switch the row wraps instead of scrolling: DESIGN.md, "Toolbar". The title counts at
 * the width of its own text when the row is broken into lines, so a control moves to a later row before the title gets
 * narrower; only a title that does not fit on a row of its own is cut, with an ellipsis.
 */
.sce-root .sce-toolbar:is([data-synth], [data-views]) {
  flex-wrap: wrap;
  row-gap: 4px;
}
.sce-root .sce-toolbar:is([data-synth], [data-views]) .sce-title {
  flex: 0 1 auto;
  max-width: 100%;
}
/*
 * A toolbar that neither wraps nor holds a control to wrap it for scrolls sideways. The title keeps its whole text there
 * instead of being squeezed to nothing, so the name of the view is always in sight; the row scrolls under it.
 */
.sce-root .sce-toolbar:not([data-synth]):not([data-views]) .sce-title {
  flex: none;
}
/*
 * In a toolbar with the view switch, the preview control keeps its place while the score does not read. It comes after the
 * switch, so that it can never push the switch to the next line; but it is the widest thing on the line, and where it shares
 * the line with the switch, its coming would move the switch along. A text typed into the text view is taken as the box loses
 * the focus, which can be the press on the switch, and the switch must not have moved by then. DESIGN.md, "Toolbar".
 */
.sce-root .sce-toolbar[data-views] .sce-synth[hidden] {
  display: inline-flex;
  visibility: hidden;
}
.sce-root .sce-spacer {
  flex: 1 1 auto;
}
.sce-root .sce-badge {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--sce-_line-strong);
  border-radius: 999px;
  color: var(--sce-_muted);
  font-size: 0.92em;
  white-space: nowrap;
}
.sce-root .sce-notice {
  flex: none;
  padding: 6px 12px;
  background: var(--sce-_surface);
  border-bottom: 1px solid var(--sce-_line);
}
/* A swatch of the cut's hatch ties the sentence to the hatched tail it explains. */
.sce-root .sce-cut-notice::before {
  content: "";
  display: inline-block;
  width: 1.1em;
  height: 1.1em;
  margin-right: 0.6em;
  border: 1px dashed var(--sce-_line-strong);
  background: repeating-linear-gradient(135deg, var(--sce-_line-strong) 0 1px, transparent 1px 7px);
  vertical-align: -0.2em;
}
.sce-root .sce-problem {
  flex: 1 1 auto;
  min-height: 0;
  padding: 16px 12px;
  overflow: auto;
}
.sce-root .sce-problem-title {
  margin: 0;
  font-weight: 600;
}
.sce-root .sce-problem-list {
  margin: 8px 0 0;
  padding: 0 0 0 1.4em;
  list-style: disc;
}
.sce-root .sce-problem-item {
  margin: 4px 0;
}
.sce-root .sce-problem-more {
  margin: 4px 0 0;
  color: var(--sce-_muted);
}
.sce-root .sce-zoom,
.sce-root .sce-history {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
}
.sce-root .sce-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--sce-_line-strong);
  border-radius: var(--sce-_radius);
  background: var(--sce-_bg);
  color: var(--sce-_text);
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.sce-root .sce-button:hover {
  background: color-mix(in srgb, var(--sce-_text) 6%, var(--sce-_bg));
}
.sce-root .sce-button[aria-expanded="true"] {
  background: color-mix(in srgb, var(--sce-_text) 10%, var(--sce-_bg));
}
.sce-root .sce-button[aria-disabled="true"] {
  background: var(--sce-_bg);
  color: var(--sce-_muted);
  cursor: default;
}
.sce-root .sce-button-value {
  font-weight: 600;
  font-variant-numeric: lining-nums tabular-nums;
}
.sce-root :is(.sce-zoom-value, .sce-select-button, .sce-grid-button)::after {
  content: "";
  width: 5px;
  height: 5px;
  margin-top: -3px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
}
/* The Select button is a word, and is trimmed a little so that a phone's toolbar keeps its controls in reach without scrolling. */
.sce-root .sce-select-button {
  gap: 4px;
  padding: 0 8px;
}
/* The Grid button is a drawing, a fraction and a chevron; the dot after the fraction is the dot of a dotted note. */
.sce-root .sce-grid-button {
  gap: 6px;
  padding: 0 8px;
}
.sce-root .sce-grid-dot {
  display: inline-block;
  width: 3px;
  height: 3px;
  margin-left: 2px;
  border-radius: 50%;
  background: currentColor;
  vertical-align: middle;
}
/* Forced colors repaint every fill but a system color, which would take the dot out. */
@media (forced-colors: active) {
  .sce-root .sce-grid-dot {
    background: CanvasText;
  }
}
/* The zoom steps draw their own minus and plus, so no glyph or font is involved. */
.sce-root .sce-step {
  justify-content: center;
  width: 28px;
  padding: 0;
}
.sce-root .sce-step::before,
.sce-root .sce-step[data-step="in"]::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 10px;
  height: 2px;
  border-radius: 1px;
  background: currentColor;
}
.sce-root .sce-step[data-step="in"]::after {
  width: 2px;
  height: 10px;
}
/* Undo and redo draw an arrow; the stylesheet gives it its stroke, since the reset above would revert attributes. */
.sce-root .sce-icon-button {
  flex: none;
  justify-content: center;
  width: 28px;
  padding: 0;
}
.sce-root .sce-icon {
  flex: none;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5px;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.sce-root .sce-redo .sce-icon {
  transform: scaleX(-1);
}
@media (pointer: coarse) {
  .sce-root .sce-button {
    min-height: 36px;
  }
  .sce-root .sce-step,
  .sce-root .sce-icon-button {
    width: 36px;
  }
}
.sce-root :is(.sce-button, .sce-menu-item, .sce-scroller):focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: 2px;
}
/* The scroller's own outline would be hidden behind the sticky ruler and keys, so a ring is drawn over its box. */
.sce-root .sce-scroller:focus-visible {
  outline: none;
}
.sce-root .sce-body:has(> .sce-scroller:focus-visible)::after {
  content: "";
  position: absolute;
  z-index: 8;
  inset: 0;
  border: 2px solid var(--sce-_accent);
  pointer-events: none;
}
.sce-root .sce-body {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

/*
 * What the sticky header, track head and pitch column cover is not room to look at: a note the keys move the focus to
 * is scrolled out from under them, with 4px for its focus ring, instead of being left half hidden. The editor scrolls
 * in its scroller and a part mounted alone in its own root.
 */
.sce-root .sce-scroller,
.sce-root.sce-axis {
  scroll-padding: calc(var(--sce-_head-top, 0px) + var(--sce-_band) + 4px) 4px 4px calc(var(--sce-_keys) + 4px);
}
.sce-root .sce-scroller {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  /* Time runs left to right on a score whatever the page's writing direction. */
  direction: ltr;
  background: var(--sce-_bg);
  touch-action: pan-x pan-y pinch-zoom;
  -webkit-user-select: none;
  user-select: none;
}
/*
 * Everything on the time axis is placed in percent of the element that carries the axis (a timeline row or a lane).
 * Zooming only sets the width of those few elements. A zoom factor held in an inherited variable made every note
 * restyle on each step: about 70 ms at 1500 notes, against about 3 ms this way.
 */
.sce-root .sce-canvas {
  width: calc(var(--sce-_keys) + var(--sce-ticks) * var(--sce-_beat) / ${TICKS_PER_QUARTER});
}
/* The editor's own content block: as tall as all the parts together, so the header can pin for the whole scroll. */
.sce-root .sce-content {
  position: relative;
}

.sce-root .sce-row {
  display: flex;
  border-bottom: 1px solid var(--sce-_line);
  background: var(--sce-_surface);
}
.sce-root .sce-corner {
  position: sticky;
  left: 0;
  z-index: 3;
  flex: none;
  width: var(--sce-_keys);
  background: var(--sce-_surface);
  border-right: 1px solid var(--sce-_line);
}
.sce-root .sce-timeline {
  position: relative;
  flex: none;
  width: calc(var(--sce-ticks) * var(--sce-_beat) / ${TICKS_PER_QUARTER});
}
.sce-root .sce-top {
  position: sticky;
  top: 0;
  z-index: 5;
}
.sce-root .sce-ruler {
  height: var(--sce-_ruler);
}
.sce-root .sce-sections {
  height: var(--sce-_band);
}
.sce-root .sce-marks {
  height: var(--sce-_band);
}
.sce-root .sce-mark {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  width: calc(var(--w) / var(--sce-ticks) * 100%);
  border-left: 1px solid var(--sce-_line-strong);
}
/* The items stay at the pitch column's edge while their stretch is scrolled past, so the key in force is always readable. */
.sce-root .sce-mark-items {
  position: sticky;
  left: var(--sce-_keys);
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  column-gap: 8px;
  width: fit-content;
  max-width: 100%;
  height: 100%;
  padding: 3px 0 0 5px;
  overflow: hidden;
  font-size: 0.92em;
  font-variant-numeric: lining-nums tabular-nums;
  white-space: nowrap;
}
/*
 * Text that does not fit its stretch is left out whole instead of cut mid-word: a full-height empty first item
 * makes any item that is too wide wrap to a second line, which the clip hides. A cut "Dm" would read as "D".
 */
.sce-root .sce-mark-items::before,
.sce-root .sce-chord::before {
  content: "";
  flex: none;
  width: 0;
  height: 100%;
}
.sce-root .sce-mark-items::before {
  margin-right: -8px;
}
.sce-root .sce-mark[data-edge="end"] {
  right: 0;
  left: auto;
  width: auto;
  border-right: 1px solid var(--sce-_line-strong);
  border-left: 0;
}
.sce-root .sce-mark[data-edge="end"] .sce-mark-items {
  padding: 3px 5px 0 0;
}
.sce-root .sce-chords {
  height: var(--sce-_chords);
}
.sce-root .sce-chords .sce-corner {
  display: flex;
  align-items: center;
  padding: 0 4px;
  overflow: hidden;
  color: var(--sce-_muted);
  font-size: 0.85em;
  white-space: nowrap;
}
.sce-root .sce-chord {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  max-width: calc(var(--w) / var(--sce-ticks) * 100%);
  padding: 5px 0 0 5px;
  overflow: hidden;
  border-left: 1px solid var(--sce-_line-strong);
  font-weight: 600;
  white-space: nowrap;
}
.sce-root .sce-empty {
  position: sticky;
  left: var(--sce-_keys);
  display: block;
  width: fit-content;
  padding: 5px 8px 0;
  color: var(--sce-_muted);
  font-size: 0.92em;
}
.sce-root .sce-section {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  width: calc(var(--d) / var(--sce-ticks) * 100%);
  border-left: 1px solid var(--sce-_line-strong);
}
.sce-root .sce-section:nth-child(even) {
  background: var(--sce-_shade);
}
.sce-root .sce-section-name {
  position: sticky;
  left: var(--sce-_keys);
  display: block;
  width: fit-content;
  max-width: 100%;
  padding: 3px 6px 0;
  overflow: hidden;
  font-size: 0.92em;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sce-root .sce-bar-number {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  padding: 4px 0 0 5px;
  border-left: 1px solid var(--sce-_line-strong);
  color: var(--sce-_muted);
  font-size: 0.92em;
  font-variant-numeric: lining-nums tabular-nums;
}

${labelThinning()}

.sce-root .sce-track-group {
  position: relative;
}
.sce-root .sce-track-head {
  position: sticky;
  top: var(--sce-_head-top, 0px);
  z-index: 4;
  display: flex;
  align-items: center;
  height: var(--sce-_band);
  background: var(--sce-_surface);
  border-bottom: 1px solid var(--sce-_line);
}
.sce-root .sce-track-name {
  position: sticky;
  left: 0;
  z-index: 1;
  padding: 0 10px;
  background: var(--sce-_surface);
  font-size: 0.92em;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.sce-root .sce-track {
  display: flex;
  border-bottom: 1px solid var(--sce-_line);
}
.sce-root .sce-keys {
  position: sticky;
  left: 0;
  z-index: 3;
  flex: none;
  width: var(--sce-_keys);
  background: var(--sce-_surface);
  border-right: 1px solid var(--sce-_line);
}
.sce-root .sce-octave {
  display: flex;
  align-items: flex-end;
  height: calc(12 * var(--sce-_row));
  padding: 0 6px 1px;
  border-top: 1px solid var(--sce-_line);
  color: var(--sce-_muted);
  font-size: 0.85em;
  font-variant-numeric: lining-nums tabular-nums;
}
.sce-root .sce-octave:first-child {
  border-top: 0;
}

.sce-root .sce-lane {
  position: relative;
  flex: none;
  width: calc(var(--sce-ticks) * var(--sce-_beat) / ${TICKS_PER_QUARTER});
  height: calc(var(--sce-rows) * var(--sce-_row));
  background-image: ${octaveStripes()};
  background-size: 100% calc(12 * var(--sce-_row));
}
.sce-root .sce-grid {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  width: calc(var(--d) / var(--sce-ticks) * 100%);
  pointer-events: none;
}
/* The part sets which lines show (data-lines) and how far apart they are (--bar-beats, --beat-beats). */
.sce-root .sce-grid[data-lines~="bar"] {
  background-image: ${gridLines("--sce-_line-strong", "--bar-beats")};
}
.sce-root .sce-grid[data-lines~="bar"][data-lines~="beat"] {
  background-image: ${gridLines("--sce-_line-strong", "--bar-beats")}, ${gridLines("--sce-_line", "--beat-beats")};
}
.sce-root .sce-grid[data-lines="beat"] {
  background-image: ${gridLines("--sce-_line", "--beat-beats")};
}
/* The part of a cut voice that the text never reached: hatched, so a gap is not mistaken for a rest. */
.sce-root .sce-cut {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  width: calc(var(--d) / var(--sce-ticks) * 100%);
  background: repeating-linear-gradient(135deg, var(--sce-_line-strong) 0 1px, transparent 1px 7px);
  border-left: 1px dashed var(--sce-_line-strong);
}
.sce-root .sce-notes {
  position: absolute;
  inset: 0;
}

.sce-root .sce-note {
  box-sizing: border-box;
  display: block;
  margin: 0;
  padding: 0;
  opacity: 1;
  box-shadow: none;
  filter: none;
  position: absolute;
  z-index: 1;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  top: calc(var(--r) * var(--sce-_row));
  width: calc(var(--d) / var(--sce-ticks) * 100% - 1px);
  min-width: 2px;
  height: var(--sce-_row);
  border: 1px solid color-mix(in srgb, var(--sce-_text) 30%, var(--sce-_note));
  border-radius: min(var(--sce-_radius), 3px);
  background: var(--sce-_note);
}
.sce-root[data-editable="true"] .sce-note {
  cursor: pointer;
}
/* The selection frame answers a tap, so the browser's own flash over the tapped note would only blur it. */
.sce-root[data-editable="true"] {
  -webkit-tap-highlight-color: transparent;
}
/*
 * A selected note keeps its box and thickens its border to 2px in the text colour, so shape and weight carry the
 * state, not hue, and nothing moves. It comes before the tie rules, which take the border off a joined side.
 */
.sce-root .sce-note[data-selected],
.sce-root .sce-note[data-boxed] {
  border-width: 2px;
  border-color: var(--sce-_text);
}
/* A note reached by the keyboard gets the focus ring of the other controls, outside the selection frame. */
.sce-root .sce-note:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: 2px;
}
/* A tie joins two notes into one bar: no gap, no border and no rounding where they meet. */
.sce-root .sce-note[data-tie-next] {
  width: calc(var(--d) / var(--sce-ticks) * 100%);
  border-right-width: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.sce-root .sce-note[data-tie-prev] {
  border-left-width: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

/*
 * The insertion point: a line through the lane, heavier and darker than a bar line, with a flag at its top. The flag
 * sticks just under the pinned track head, so it stays in view when the lane is scrolled past its own top. At either
 * end of the lane the line is kept whole inside it, where the pitch column and the focus ring would cover half of it.
 */
.sce-root .sce-insertion-point {
  position: absolute;
  z-index: 2;
  top: 0;
  bottom: 0;
  left: clamp(1px, calc(var(--t) / var(--sce-ticks) * 100%), calc(100% - 1px));
  width: 2px;
  margin-left: -1px;
  background: var(--sce-_text);
  pointer-events: none;
}
.sce-root .sce-insertion-point::before {
  content: "";
  position: sticky;
  top: calc(var(--sce-_head-top, 0px) + var(--sce-_band));
  display: block;
  margin-left: -4px;
  border: 5px solid transparent;
  border-top-color: var(--sce-_text);
  border-bottom-width: 0;
}

.sce-root .sce-popover {
  position: fixed;
  inset: auto;
  margin: 0;
  min-width: 190px;
  max-height: calc(100vh - 16px);
  padding: 4px;
  overflow: auto;
  border: 1px solid var(--sce-_line-strong);
  border-radius: calc(var(--sce-_radius) + 2px);
  background: var(--sce-_surface);
  color: var(--sce-_text);
  font: inherit;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--sce-_text) 22%, transparent);
}
.sce-root .sce-popover:not(:popover-open) {
  display: none;
}
.sce-root .sce-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 0 10px 0 8px;
  border: 0;
  border-radius: var(--sce-_radius);
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: lining-nums tabular-nums;
  text-align: start;
  cursor: pointer;
}
.sce-root .sce-menu-item::before {
  content: "";
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: transparent;
}
.sce-root .sce-menu-item[aria-checked="true"]::before {
  background: var(--sce-_accent);
}
.sce-root .sce-menu-item:hover {
  background: color-mix(in srgb, var(--sce-_text) 8%, transparent);
}
.sce-root .sce-menu-item[aria-disabled="true"] {
  color: var(--sce-_muted);
  cursor: default;
}
.sce-root .sce-menu-item[aria-disabled="true"]:hover {
  background: transparent;
}
.sce-root .sce-menu-rule {
  height: 1px;
  margin: 4px 0;
  background: var(--sce-_line);
}
@media (pointer: coarse) {
  .sce-root .sce-menu-item {
    min-height: 40px;
  }
}

/*
 * The text view: the score text in a box with a number for each line beside it, then a sentence, then the problems. The
 * gutter and the box share one font, size and line height, so a number stays level with its line. A host sets the
 * monospace face with --sce-font-family-mono.
 */
.sce-root.sce-part-text {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.sce-root .sce-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}
.sce-root .sce-text-frame {
  display: flex;
  flex: 1 1 auto;
  min-height: 14em;
  background: var(--sce-_bg);
  border-bottom: 1px solid var(--sce-_line);
}
.sce-root .sce-gutter,
.sce-root .sce-text-box {
  font-family: var(--sce-font-family-mono, ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace);
  font-size: 1em;
  line-height: 1.6;
  tab-size: 4;
}
.sce-root .sce-gutter {
  flex: none;
  min-width: 3.4em;
  /* The bottom padding is room for the box's horizontal scrollbar, so the numbers scroll as far as the lines do. */
  padding: 8px 8px 32px 12px;
  overflow: hidden;
  background: var(--sce-_surface);
  border-right: 1px solid var(--sce-_line);
  color: var(--sce-_muted);
  font-variant-numeric: lining-nums tabular-nums;
  text-align: end;
  -webkit-user-select: none;
  user-select: none;
}
.sce-root .sce-gutter-line {
  display: block;
  white-space: nowrap;
}
/* A line with a problem is marked by weight and a dot as well as by colour. */
.sce-root .sce-gutter-line[data-problem="true"] {
  color: var(--sce-_text);
  font-weight: 700;
}
.sce-root .sce-gutter-line[data-problem="true"]::before {
  content: "";
  display: inline-block;
  width: 0.5em;
  height: 0.5em;
  margin-right: 0.5em;
  border-radius: 50%;
  background: currentColor;
}
.sce-root .sce-text-box {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 8px 12px;
  overflow: auto;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  outline: none;
  resize: none;
  white-space: pre;
}
.sce-root .sce-text-box:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: -2px;
}
.sce-root .sce-text-status {
  flex: none;
  margin: 0;
  padding: 6px 12px;
  background: var(--sce-_surface);
  color: var(--sce-_muted);
}
.sce-root .sce-text[data-problems] .sce-text-status {
  color: var(--sce-_text);
  font-weight: 600;
}
/* A notice is a plain sentence under the status, set apart from the problems by a bar at its start, not by hue alone. */
.sce-root .sce-text-notice {
  flex: none;
  margin: 0;
  padding: 0 12px 6px;
  background: var(--sce-_surface);
  color: var(--sce-_text);
}
.sce-root .sce-text-notice:not([hidden]) {
  border-inline-start: 3px solid var(--sce-_accent);
  padding-inline-start: 9px;
}
.sce-root .sce-text-problems {
  flex: none;
  max-height: 9em;
  margin: 0;
  padding: 0;
  overflow: auto;
  background: var(--sce-_surface);
  border-top: 1px solid var(--sce-_line);
  list-style: none;
}
.sce-root .sce-text-problem {
  display: block;
  width: 100%;
  min-height: 28px;
  padding: 4px 12px;
  border: 0;
  background: transparent;
  color: var(--sce-_text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.sce-root .sce-text-problem:hover {
  background: color-mix(in srgb, var(--sce-_text) 8%, transparent);
  text-decoration: underline;
}
.sce-root .sce-text-problem:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: -2px;
  text-decoration: underline;
}
.sce-root .sce-text-more {
  padding: 4px 12px;
  color: var(--sce-_muted);
}
@media (pointer: coarse) {
  /* Below 16px a phone zooms the page when the box is focused, so the box and its numbers are 16px there. */
  .sce-root .sce-gutter,
  .sce-root .sce-text-box {
    font-size: 16px;
  }
  .sce-root .sce-text-problem {
    min-height: 40px;
  }
}

/*
 * The view switch ends the toolbar row: three icon buttons side by side that share their borders, the shown one filled
 * and drawn heavier, so the state is carried by shape and weight and not by hue alone. Where the row is too narrow for
 * all its controls, the switch and the badge move to the next line together.
 */
.sce-root .sce-toolbar-end {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  margin-inline-start: auto;
}
.sce-root .sce-views {
  display: inline-flex;
  flex: none;
}
.sce-root .sce-view-button {
  border-radius: 0;
}
.sce-root .sce-view-button + .sce-view-button {
  margin-inline-start: -1px;
}
.sce-root .sce-view-button:first-child {
  border-start-start-radius: var(--sce-_radius);
  border-end-start-radius: var(--sce-_radius);
}
.sce-root .sce-view-button:last-child {
  border-start-end-radius: var(--sce-_radius);
  border-end-end-radius: var(--sce-_radius);
}
.sce-root .sce-view-button[aria-pressed="true"] {
  z-index: 1;
  border-color: var(--sce-_text);
  background: color-mix(in srgb, var(--sce-_text) 12%, var(--sce-_bg));
}
.sce-root .sce-view-button[aria-pressed="true"] .sce-icon {
  stroke-width: 2px;
}
/* Five lines at the 2px of the others would merge into one block; see DESIGN.md, "View switch". */
.sce-root .sce-view-staff .sce-icon {
  stroke-width: 1px;
}
.sce-root .sce-view-staff[aria-pressed="true"] .sce-icon {
  stroke-width: 1.5px;
}
.sce-root .sce-view-button:focus-visible {
  z-index: 2;
}

/* The stale notice is a note like the cut notice, with an edge at its start in place of the hatch swatch. */
.sce-root .sce-stale-notice {
  border-inline-start: 3px solid var(--sce-_text);
}

/* The staff view; see DESIGN.md, "Staff view". */
.sce-root.sce-part-staff {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.sce-root .sce-staff {
  flex: 1 1 auto;
  min-height: 0;
  padding: 12px;
  overflow: auto;
  background: var(--sce-_bg);
  scrollbar-gutter: stable;
}
.sce-root .sce-staff:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: -2px;
}
.sce-root .sce-staff-drawing {
  display: block;
  /* The cursor is positioned in the drawing's box; the hard reset above otherwise reverts this to static. */
  position: relative;
}
.sce-root .sce-staff-message {
  margin: 0 0 8px;
  color: var(--sce-_muted);
}

/* A pane shows and hides the parts of one view together, and takes no box of its own. */
.sce-root .sce-pane {
  display: contents;
}

.sce-root .sce-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* The synth preview: DESIGN.md, "Synth preview". */
.sce-root .sce-synth {
  display: inline-flex;
  flex: 0 1 auto;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.sce-root .sce-synth-label {
  min-width: 3.8em;
  text-align: start;
}
.sce-root .sce-synth:lang(zh) .sce-synth-label {
  min-width: 2.2em;
}
.sce-root .sce-synth-caption {
  min-width: 0;
  max-width: 12em;
  color: var(--sce-_muted);
  font-size: 0.92em;
  line-height: 1.2;
  /* Chinese breaks after its comma, and not between any two characters. */
  word-break: keep-all;
  text-wrap: balance;
}
.sce-root .sce-synth-told {
  color: var(--sce-_text);
}
/* The playhead: DESIGN.md, "Playhead". */
.sce-root .sce-playhead {
  position: absolute;
  z-index: 2;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  width: 3px;
  margin-left: -1px;
  background: linear-gradient(to right, var(--sce-_bg) 0 1px, var(--sce-_text) 1px 2px, var(--sce-_bg) 2px 3px);
  pointer-events: none;
}
${boxCss}${lyricCss}
${draftCss}
${filterCss}
${dragCss}`;

interface Injection {
  remove(): void;
  count: number;
}

type StyleScope = Document | ShadowRoot;

const injections = new WeakMap<StyleScope, Injection>();

/** One parsed sheet per document, adopted again on every mount: re-parsing the sheet made a re-mount about twice as slow. */
const sheets = new WeakMap<Document, CSSStyleSheet>();

/** Where the stylesheet must live for elements living in `el`'s tree: a shadow root itself, else the document. */
function scopeFor(el: HTMLElement): StyleScope {
  const root = el.getRootNode();
  return root.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? (root as ShadowRoot) : el.ownerDocument;
}

/**
 * Adds the sheet to the scope. A constructed stylesheet is preferred: a page whose Content-Security-Policy
 * forbids inline style elements blocks an injected <style> and leaves the editor unstyled, while the
 * stylesheet object model is not governed by that policy. The <style> element is the fallback.
 */
function addSheet(scope: StyleScope, doc: Document): () => void {
  const view = doc.defaultView;
  if (view && typeof view.CSSStyleSheet?.prototype.replaceSync === "function" && "adoptedStyleSheets" in scope) {
    let sheet = sheets.get(doc);
    if (!sheet) {
      sheet = new view.CSSStyleSheet();
      sheet.replaceSync(css);
      sheets.set(doc, sheet);
    }
    const adopted = sheet;
    scope.adoptedStyleSheets = [...scope.adoptedStyleSheets, adopted];
    return () => {
      scope.adoptedStyleSheets = scope.adoptedStyleSheets.filter((candidate) => candidate !== adopted);
    };
  }
  const style = doc.createElement("style");
  style.textContent = css;
  (scope instanceof Document ? scope.head : scope).appendChild(style);
  return () => style.remove();
}

/** Adds the stylesheet where `el` lives, once per scope however many editors share it. Returns the release. */
export function acquireStyles(el: HTMLElement): () => void {
  const scope = scopeFor(el);
  let injection = injections.get(scope);
  if (!injection) {
    injection = { remove: addSheet(scope, el.ownerDocument), count: 0 };
    injections.set(scope, injection);
  }
  injection.count += 1;
  const held = injection;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held.count -= 1;
    if (held.count === 0) {
      held.remove();
      injections.delete(scope);
    }
  };
}
