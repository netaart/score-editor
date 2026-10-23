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
  --sce-_syllable: round(1.8em, 1px);
}
.sce-root .sce-lyric-lane {
  position: relative;
  flex: none;
  width: calc(var(--sce-ticks) * var(--sce-_beat) / ${TICKS_PER_QUARTER});
  height: calc(var(--sce-_phrase) + var(--sce-_syllable) + 6px);
}
.sce-root .sce-lyric-lane .sce-empty {
  position: sticky;
  top: 0;
  padding-top: 7px;
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
  --sce-_edge: color-mix(in srgb, var(--sce-_hue) 70%, var(--sce-_text));
}
/* The count that does not match is told by a broken line as well as by yellow, so no state rests on hue alone. */
.sce-root .sce-lyric-phrase[data-state="differ"] {
  --sce-_hue: var(--sce-_unequal);
  --sce-_edge: color-mix(in srgb, var(--sce-_hue) 70%, var(--sce-_text));
  border-style: dashed;
}
.sce-root .sce-lyric-phrase[data-selected] {
  border-width: 2px;
  border-color: var(--sce-_text);
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
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 0 0.6em;
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
  .sce-root .sce-lyric-handle {
    width: 44px;
    margin: 0 -22px;
  }
  .sce-root .sce-lyric-handle::after {
    inset: 4px 19px;
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
  background: var(--sce-_accent);
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
  border: 2px solid var(--sce-_accent);
  background: color-mix(in srgb, var(--sce-_accent) 14%, transparent);
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
  width: min(36em, calc(100vw - var(--sce-_keys)));
  padding: 6px 8px 8px;
}
.sce-root .sce-lyric-panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-height: 28px;
}
.sce-root .sce-lyric-title {
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
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
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
.sce-root .sce-lyric-input {
  flex: 1 1 14em;
  box-sizing: border-box;
  min-width: 0;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--sce-_line-strong);
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
    border-color: Highlight;
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
