// ABOUTME: The look of the lyric track as a stylesheet fragment: phrase blocks, the syllable row, the handles, and the panel under the lane.
// ABOUTME: styles.ts appends it to the editor's stylesheet; the two counts' states are told apart by line style as well as by hue.
import { TICKS_PER_QUARTER } from "./score";

export const lyricCss = `
/*
 * The lyric track. Green and yellow are the two hues no mapped colour can give, so they have variables of their own
 * (--sce-color-equal and --sce-color-unequal); the block's line is the hue pulled toward the text colour, so it keeps
 * its contrast on a light or a dark page, and its wash is the hue thinned into the page's background.
 */
.sce-root {
  --sce-_equal: var(--sce-color-equal, light-dark(#2e8b4f, #4cc27a));
  --sce-_unequal: var(--sce-color-unequal, light-dark(#c79100, #f0c040));
  --sce-_phrase: round(2.3em, 1px);
  --sce-_syllable: round(1.6em, 1px);
}
/* The track head is the voice tracks' head under a class of its own, so a count of heads in a page stays a count of voices. */
.sce-root .sce-lyric-head {
  position: sticky;
  top: var(--sce-_head-top, 0px);
  z-index: 4;
  display: flex;
  align-items: center;
  min-height: var(--sce-_band);
  background: var(--sce-_surface);
  border-bottom: 1px solid var(--sce-_line);
}
.sce-root .sce-lyric-head-items {
  position: sticky;
  left: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  background: var(--sce-_surface);
}
/* The button is as high as the head, which has no room for a taller one; a finger's button makes the head taller. */
.sce-root .sce-lyric-new {
  min-height: 0;
  height: calc(var(--sce-_band) - 4px);
  padding: 0 8px;
  font-size: 0.92em;
}
.sce-root .sce-lyric-legend {
  padding: 0 8px 0 4px;
  color: var(--sce-_muted);
  font-size: 0.85em;
  white-space: nowrap;
}
.sce-root .sce-lyric-lane {
  position: relative;
  flex: none;
  width: calc(var(--sce-ticks) * var(--sce-_beat) / ${TICKS_PER_QUARTER});
  height: calc(var(--sce-_phrase) + var(--sce-_syllable) + 5px);
}
.sce-root .sce-lyric-lane .sce-empty {
  position: sticky;
  top: 0;
  z-index: 1;
  padding-top: 7px;
  background: var(--sce-_bg);
}
.sce-root .sce-lyric-phrases,
.sce-root .sce-lyric-syllables {
  position: absolute;
  inset: 0 0 auto 0;
  margin: 0;
  padding: 0;
}
.sce-root .sce-lyric-phrases {
  height: calc(var(--sce-_phrase) + 4px);
}
.sce-root .sce-lyric-syllables {
  top: calc(var(--sce-_phrase) + 4px);
  height: var(--sce-_syllable);
  pointer-events: none;
}

.sce-root .sce-lyric-phrase {
  position: absolute;
  z-index: 1;
  top: 3px;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  width: calc(var(--d) / var(--sce-ticks) * 100% - 2px);
  height: var(--sce-_phrase);
  box-sizing: border-box;
  padding: 0 6px;
  border: 1px solid var(--sce-_edge);
  border-radius: min(var(--sce-_radius), 3px);
  background: color-mix(in srgb, var(--sce-_hue) 20%, var(--sce-_bg));
  color: var(--sce-_text);
}
.sce-root .sce-lyric-phrase[data-state="equal"] {
  --sce-_hue: var(--sce-_equal);
  --sce-_edge: color-mix(in srgb, var(--sce-_hue) 30%, var(--sce-_text));
}
/* The count that does not match is told by a broken line as well as by yellow, so no state rests on hue alone. */
.sce-root .sce-lyric-phrase[data-state="differ"] {
  --sce-_hue: var(--sce-_unequal);
  --sce-_edge: color-mix(in srgb, var(--sce-_hue) 30%, var(--sce-_text));
  border-style: dashed;
}
/* The frame is a solid 2px line inside the block's own line, so a chosen block whose counts differ keeps its broken line. */
.sce-root .sce-lyric-phrase[data-selected] {
  box-shadow: inset 0 0 0 2px var(--sce-_text);
}
.sce-root .sce-lyric-phrase:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: 2px;
}
.sce-root[data-editable="true"] .sce-lyric-phrase {
  cursor: pointer;
}
/*
 * The count and the text share one line. Anything too wide for the block wraps onto a second line that the clip hides, so
 * the count is never shown cut ("1" for "12 / 12"); the text, a sentence, is cut with an ellipsis instead.
 */
.sce-root .sce-lyric-body {
  position: sticky;
  left: var(--sce-_keys);
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 0 0.6em;
  width: fit-content;
  max-width: 100%;
  height: 100%;
  overflow: hidden;
  line-height: var(--sce-_phrase);
  white-space: nowrap;
}
.sce-root .sce-lyric-body::before {
  content: "";
  flex: none;
  width: 0;
  height: 100%;
}
.sce-root .sce-lyric-count {
  flex: none;
  font-size: 0.92em;
  font-weight: 600;
  font-variant-numeric: lining-nums tabular-nums;
}
.sce-root .sce-lyric-text {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sce-root .sce-lyric-syl {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  max-width: calc(var(--w) / var(--sce-ticks) * 100%);
  padding: 3px 0 0 3px;
  overflow: hidden;
  border-left: 1px solid var(--sce-_line-strong);
  white-space: nowrap;
}
/* A note start of a line whose counts differ has no syllable: a broken tick, like the block's broken line. */
.sce-root .sce-lyric-syl[data-empty] {
  border-left-style: dashed;
}
/* The strut fills the first line of the cell, so a syllable that does not fit beside it wraps to a line that is clipped away: left out whole. */
.sce-root .sce-lyric-syl::before {
  content: "";
  flex: none;
  width: 0;
  height: 100%;
}

/* The two edges of a phrase: a bar with a wide hit area round it; on a touch screen the area is a fingertip wide. */
.sce-root .sce-lyric-handle {
  position: absolute;
  z-index: 2;
  top: -2px;
  bottom: -2px;
  width: 16px;
  margin: 0 -8px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: ew-resize;
  touch-action: none;
}
.sce-root .sce-lyric-handle[data-edge="start"] {
  left: 0;
}
.sce-root .sce-lyric-handle[data-edge="end"] {
  right: 0;
}
.sce-root .sce-lyric-handle::after {
  content: "";
  position: absolute;
  inset: 4px 6px;
  border-radius: 2px;
  background: var(--sce-_text);
  opacity: 0.55;
}
.sce-root .sce-lyric-handle:hover::after,
.sce-root .sce-lyric-handle[data-dragging]::after {
  opacity: 1;
}
.sce-root .sce-lyric-handle:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: 0;
}
@media (pointer: coarse) {
  .sce-root {
    --sce-_phrase: round(3em, 1px);
  }
  .sce-root .sce-lyric-head {
    padding: 2px 0;
  }
  .sce-root .sce-lyric-new {
    height: auto;
    min-height: 36px;
  }
  .sce-root .sce-lyric-handle {
    top: 50%;
    bottom: auto;
    width: 44px;
    height: 44px;
    margin: -22px -22px 0;
  }
  .sce-root .sce-lyric-handle::after {
    inset: 6px 19px;
  }
}
/* While a drag is on, the blocks it moves follow the pointer and the bar line it will land on is drawn through the lane. */
.sce-root .sce-lyric-phrase[data-previewing] {
  opacity: 0.9;
}
.sce-root .sce-lyric-guide {
  position: absolute;
  z-index: 3;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  width: 2px;
  margin-left: -1px;
  background: var(--sce-_text);
  pointer-events: none;
}
.sce-root .sce-lyric-drop {
  position: absolute;
  z-index: 3;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  width: calc(var(--d) / var(--sce-ticks) * 100%);
  box-sizing: border-box;
  border: 2px solid var(--sce-_text);
  background: color-mix(in srgb, var(--sce-_text) 10%, transparent);
  pointer-events: none;
}
/* A bar that already has a line is no place to drop: the outline breaks, so it is not told from a free bar by hue alone. */
.sce-root .sce-lyric-drop[data-free="false"] {
  border-style: dashed;
  border-color: var(--sce-_muted);
  background: color-mix(in srgb, var(--sce-_muted) 14%, transparent);
}
.sce-root .sce-lyric-lane[data-dropping] {
  background: color-mix(in srgb, var(--sce-_text) 4%, transparent);
}

/*
 * The panel under the lane holds what is not on bars and the editor of the line chosen. It stays at the pitch column's
 * edge while the lane is scrolled past it, and is as wide as a phone, so it never needs a scroll of its own.
 */
.sce-root .sce-lyric-panel {
  position: sticky;
  left: var(--sce-_keys);
  box-sizing: border-box;
  width: min(36em, calc(var(--sce-_view, 100vw) - var(--sce-_keys)));
  padding: 6px 8px 8px;
}
.sce-root .sce-lyric-title {
  display: flex;
  align-items: center;
  min-height: 28px;
  font-size: 0.92em;
  font-weight: 600;
}
.sce-root .sce-lyric-title .sce-badge {
  margin-left: 6px;
  padding: 0 7px;
  font-weight: 400;
  font-variant-numeric: lining-nums tabular-nums;
}
.sce-root .sce-lyric-unaligned {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}
.sce-root .sce-lyric-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  border-bottom: 1px solid var(--sce-_line);
}
.sce-root .sce-lyric-item-text {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sce-root button.sce-lyric-item-text {
  min-height: 28px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.sce-root .sce-lyric-item[data-selected] {
  outline: 2px solid var(--sce-_text);
  outline-offset: -2px;
}
.sce-root .sce-lyric-item button:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: 2px;
}
/* The grip is the one place a drag of a line begins, so a slide anywhere else on the track stays a scroll. */
.sce-root .sce-lyric-grip {
  display: block;
  flex: none;
  box-sizing: border-box;
  width: 28px;
  height: 28px;
  /* The dots are a tile of 8px: with 2px round them, whole dots fill the box (24px, and 40px by 32px on a touch screen). */
  padding: 2px;
  border: 0;
  background:
    radial-gradient(circle, var(--sce-_muted) 1.5px, transparent 2px) 0 0 / 8px 8px,
    transparent;
  background-clip: content-box;
  background-origin: content-box;
  cursor: grab;
  touch-action: none;
}
.sce-root .sce-lyric-grip[data-dragging] {
  cursor: grabbing;
}
.sce-root .sce-lyric-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.sce-root .sce-lyric-editor[hidden] {
  display: none;
}
.sce-root .sce-lyric-item .sce-lyric-editor {
  flex: 1 0 100%;
  box-sizing: border-box;
  margin-top: 0;
  padding: 0 6px 8px;
}
.sce-root .sce-lyric-caption {
  flex: 0 0 100%;
  font-size: 0.92em;
  font-weight: 600;
}
.sce-root .sce-lyric-problem {
  flex: 0 0 100%;
  margin: 0;
  font-size: 0.92em;
}
.sce-root .sce-lyric-problem[hidden] {
  display: none;
}
.sce-root .sce-lyric-input[aria-invalid="true"] {
  border-width: 2px;
  border-color: var(--sce-_text);
}
.sce-root .sce-lyric-note {
  margin: 0;
  color: var(--sce-_muted);
  font-size: 0.92em;
}
.sce-root .sce-lyric-note[hidden] {
  display: none;
}
.sce-root .sce-lyric-input {
  flex: 1 1 14em;
  box-sizing: border-box;
  min-width: 0;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--sce-_text) 47%, var(--sce-_bg));
  border-radius: var(--sce-_radius);
  background: var(--sce-_bg);
  color: var(--sce-_text);
  font: inherit;
  -webkit-user-select: text;
  user-select: text;
}
.sce-root .sce-lyric-input:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: 2px;
}
.sce-root .sce-lyric-place {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
}
.sce-root .sce-lyric-place[hidden] {
  display: none;
}
.sce-root .sce-lyric-bar {
  flex: 0 0 8em;
}
.sce-root .sce-lyric-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
@media (pointer: coarse) {
  .sce-root .sce-lyric-item,
  .sce-root button.sce-lyric-item-text,
  .sce-root .sce-lyric-input {
    min-height: 36px;
  }
  .sce-root .sce-lyric-grip {
    width: 44px;
    height: 36px;
  }
  /* A field smaller than 16px makes a phone's browser zoom the page when the field takes the focus. */
  .sce-root .sce-lyric-input {
    font-size: 16px;
  }
}

/* Where the system forces its colours, the hues go: the line styles and the system colours carry the states. */
@media (forced-colors: active) {
  .sce-root .sce-lyric-phrase {
    border-color: CanvasText;
    background: Canvas;
    color: CanvasText;
  }
  .sce-root .sce-lyric-phrase[data-selected] {
    border-width: 2px;
    border-color: Highlight;
    box-shadow: none;
  }
  .sce-root .sce-lyric-handle::after {
    background: CanvasText;
    opacity: 1;
  }
  .sce-root .sce-lyric-guide {
    background: Highlight;
  }
  .sce-root .sce-lyric-drop {
    border-color: Highlight;
    background: transparent;
  }
}
`;
