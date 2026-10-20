---
name: Score Editor
description: A piano-roll editor with no brand of its own. The host supplies colour and type through theme variables; the package supplies structure, interaction and neutral defaults.
colors:
  ground-light: "#ffffff"
  ground-dark: "#1b1c1f"
  ink-light: "#18181b"
  ink-dark: "#ececee"
  accent-light: "#2457d6"
  accent-dark: "#7da3ff"
typography:
  base:
    fontFamily: "inherit"
    fontSize: "small"
    fontWeight: 400
    lineHeight: 1.3
  title:
    fontFamily: "inherit"
    fontSize: "small"
    fontWeight: 600
  label:
    fontFamily: "inherit"
    fontSize: "0.92em"
    fontWeight: 400
  numeral-label:
    fontFamily: "inherit"
    fontSize: "0.85em"
    fontWeight: 400
rounded:
  default: "4px"
  note-max: "3px"
  popover: "calc(var(--sce-radius) + 2px)"
  pill: "999px"
spacing:
  toolbar-gap: "8px"
  toolbar-padding-x: "12px"
  button-padding-x: "10px"
  readout-padding-x: "8px"
components:
  toolbar:
    height: "40px"
    padding: "4px 12px"
  button:
    height: "28px"
    rounded: "{rounded.default}"
    padding: "0 10px"
  button-coarse:
    height: "36px"
  badge:
    rounded: "{rounded.pill}"
    padding: "2px 8px"
    typography: "{typography.label}"
  note:
    height: "14px"
    rounded: "{rounded.note-max}"
  note-coarse:
    height: "24px"
  readout:
    textColor: "{colors.ground-light}"
    backgroundColor: "{colors.ink-light}"
    rounded: "{rounded.default}"
    padding: "3px 8px"
    typography: "{typography.label}"
  menu-item:
    height: "30px"
    rounded: "{rounded.default}"
    padding: "0 10px 0 8px"
  menu-item-coarse:
    height: "40px"
---

# Design System: Score Editor

## Overview

**Creative North Star: "The Borrowed Instrument Panel"**

The editor has no brand. It is a tool panel that takes on the look of whatever host app embeds it. The package owns structure, interaction and legibility; the host owns colour and type. Everything stated below about colour and type is therefore a contract for hosts first, and a set of neutral fallbacks second.

It is an Operate surface: a piano roll for people who generated a song and want to nudge notes. DAW conventions are the reference (a pitch column at the left, a bar ruler on top, a hairline grid with heavier bar lines, black-key rows shaded). Touch and keyboard are first-class: a note can be dragged with a mouse or a finger and moved with arrow keys. The interface is dense on a fine pointer and roomier on a coarse one.

The one authored move is the readout chip: while a note is dragged, an inverted chip follows the pointer and says where the note would land (pitch name, bar, beat). The rest of the surface stays plain on purpose.

**Key Characteristics:**

- No identity of its own: colours and type come from the host; defaults are neutral.
- Hairline structure: 1px lines, tonal fills, almost no shadow.
- Two densities selected by pointer type, not by screen width.
- Every state is visible without colour alone: selection adds an outline, a blocked drop is dashed and dimmed.
- Isolated styles: a host's element and class selectors do not reach in; inside a shadow root nothing does.

## Colors

The package states no palette. It reads eight theme variables and falls back to neutral values only where the host has not mapped one. The six hex values in the frontmatter are those fallbacks, one pair per light and dark scheme; they are defaults, not a brand.

### The theme variable contract (normative)

A host maps its own theme onto these public variables, set on the editor's root or any ancestor. Names are stable. Anything else the package declares is private.

| Variable | Controls | Default when unmapped |
| --- | --- | --- |
| `--sce-color-bg` | Roll ground, button fill, text of the readout chip | `#ffffff` light, `#1b1c1f` dark |
| `--sce-color-text` | Text, selected-note outline, readout chip fill | `#18181b` light, `#ececee` dark |
| `--sce-color-surface` | Toolbar, ruler, track head, pitch column, popover | 5% of text mixed into bg |
| `--sce-color-muted` | Secondary text: bar numbers, octave labels, badge | 66% of text mixed into bg |
| `--sce-color-line` | Hairlines: beat lines, panel borders | 13% of text mixed into bg |
| `--sce-color-line-strong` | Bar lines, button and badge borders, popover border | 28% of text mixed into bg |
| `--sce-color-accent` | Focus ring, checked menu dot | `#2457d6` light, `#7da3ff` dark |
| `--sce-color-note` | Note fill | the accent value |
| `--sce-font-family` | Font family | the host's inherited font |
| `--sce-radius` | Base corner radius | `4px` |
| `--sce-row-height` | Height of one pitch row (and of a note) | `14px` fine pointer, `24px` coarse pointer |
| `--sce-beat-width` | Width of one beat | `40px` |
| `--sce-keys-width` | Width of the pitch column | `44px` |

Defaults follow the host's `color-scheme` through `light-dark()`: a host that sets `color-scheme: dark` gets the dark values with no mapping at all.

**Derivation.** Surface, muted, line and line-strong are computed from the mapped background and text with `color-mix(in srgb, ...)` at the percentages above. A host that maps only `--sce-color-bg` and `--sce-color-text` therefore gets a coherent set of greys in any scheme. A host that maps one of the four greys overrides only that one. Do not add a variable for a derived grey unless a host proves the derivation fails.

**Private variables.** The `--sce-_*` names (`--sce-_bg`, `--sce-_text`, `--sce-_surface`, `--sce-_muted`, `--sce-_line`, `--sce-_line-strong`, `--sce-_accent`, `--sce-_note`, `--sce-_radius`, `--sce-_row`, `--sce-_beat`, `--sce-_keys`, `--sce-_shade`, `--sce-_sub`) are aliases that resolve the public variable or its default. They are not public: hosts must not set them and new work must not document them as an API. Per-instance layout values (`--sce-bars`, `--sce-rows`, `--sce-grid-div`, and per-note `--t`, `--d`, `--r`, `--i`) are set by the editor itself.

### Neutral defaults

- **Ground** (#ffffff light, #1b1c1f dark): roll and button ground.
- **Ink** (#18181b light, #ececee dark): text, selected-note outline, readout chip fill.
- **Cool accent** (#2457d6 light, #7da3ff dark): focus and checked state; also the note fill unless a note colour is mapped.

Derived values used by the build: black-key row shading is 5% of text over transparent; the sub-beat line is the line colour at 50%; a hovered button is 6% of text over bg and an expanded one 10%; a hovered menu item is 8% of text; a note's border is 30% of text mixed into the note colour; a selected note is the note colour mixed 72% with text.

### Named Rules

**The Borrowed Colour Rule.** The package never names a colour outside the variable contract and its neutral defaults. A new surface takes its colour from an existing variable or a derivation from bg and text.

**The One Accent Rule.** Accent marks focus and the checked menu dot; the note colour defaults to the same value. Nothing else is tinted.

## Typography

**Font:** the host's inherited family unless `--sce-font-family` is set. The editor ships no font and loads none.

**Character:** whatever the host's text looks like, set small and quiet so that notes and grid carry the surface.

Sizes are keyword-relative so the user's browser font size applies and a host's rem tricks do not distort the tool: the root is `small`, and every other size is in `em` of it.

### Hierarchy

- **Base** (400, `small`, line-height 1.3): toolbar buttons, menu items.
- **Title** (600, `small`): toolbar title, value of the grid button.
- **Label** (`0.92em`): bar numbers, track names (600, 0.02em tracking), badge, readout chip.
- **Numeral label** (`0.85em`): octave labels in the pitch column.

### Named Rules

**The Tabular Numbers Rule.** Every number that can change (bar numbers, octave labels, grid value, readout) uses lining, tabular numerals (`font-variant-numeric: lining-nums tabular-nums`) so the readout does not jitter while dragging.

**The Keyword Size Rule.** No `px` or `rem` font sizes. The root is a keyword; descendants are `em`.

## Layout

A single scroller holds a canvas whose width is the pitch column plus bars times four beats times the beat width. The scroller scrolls both ways and keeps the ruler (24px) pinned to the top, the track head (22px, under the ruler) pinned below it, and the pitch column pinned to the left. Time runs left to right whatever the page direction. The lane height is rows times the row height, with each octave being twelve rows.

Structure from top to bottom: toolbar strip (minimum 40px; title, grid button, spacer, read-only badge), bar ruler, track head, then the pitch column and lane. The root fills its parent (`height: 100%`, minimum 288px) and clips overflow; the host decides the size.

Density follows pointer type, not viewport width. A fine pointer gets the compact set; a coarse pointer (`pointer: coarse`) gets the larger one:

| Element | Fine pointer | Coarse pointer |
| --- | --- | --- |
| Row height and note height | 14px | 24px |
| Toolbar button minimum height | 28px | 36px |
| Menu item minimum height | 30px | 40px |
| Note hit area | the note | the note plus 4px above and below, 6px left and right |

A host that maps `--sce-row-height` overrides both. Spacing is a small set used as seen: 8px gaps in the toolbar, 12px toolbar side padding, 10px button side padding, 8px chip and badge side padding.

Touch behaviour: blank space pans and pinch-zooms the page as the browser allows; a note takes the touch for dragging and does not pan (`touch-action: none`). Dragging a note to the edge of the visible roll scrolls it, in a band of 32px (mouse) or 48px (touch).

## Elevation & Depth

Flat by default, tonal layering for depth: the toolbar, ruler, track head and pitch column sit on the surface tone; the roll sits on the ground tone. Shadows appear only as a response to a state or a floating layer.

### Shadow Vocabulary

- **Lifted note** (`box-shadow: 0 4px 10px color-mix(in srgb, var(--sce-_text) 40%, transparent)`): a note being dragged.
- **Popover** (`box-shadow: 0 8px 24px color-mix(in srgb, var(--sce-_text) 22%, transparent)`): the grid popover in the top layer.
- **Selected and focused note ring** (`box-shadow: 0 0 0 5px var(--sce-_accent)`): a spread ring, not a shadow; see Components.

### Named Rules

**The Flat-Until-Moved Rule.** A note has no shadow at rest. It gains one only while dragged, so shadow always means "in your hand".

## Shapes

Small, even corners. The base radius is 4px and comes from `--sce-radius`. Notes use the smaller of the radius and 3px. The popover uses the radius plus 2px. The read-only badge is a full pill (999px). All borders are 1px hairlines in the line colours; the notes' border is 1px in a darker mix of the note colour. The grid button's expand indicator is a 5px rotated border corner drawn in CSS, not a glyph. The checked menu dot is a 6px circle.

## Components

### Toolbar

Surface-tone strip, minimum 40px high, 1px line under it. Title at the start in 600 weight, a flexible spacer, and at the end the read-only badge when the editor is not editable. Visible controls are only those that work in the current mode: a read-only editor shows the badge and hides the grid button.

### Grid button and popover

- **Button:** ground fill, 1px strong line, 4px radius, 28px high (36px coarse), with a label, the current value in 600 weight and a CSS chevron. Hover darkens by 6% of text; expanded state 10%.
- **Popover:** a native popover (`popover="auto"`), so it lives in the top layer and stacks above a host's full-screen layer. Surface fill, 1px strong line, 8px/24px shadow, positioned under the button and nudged left if it would overflow the viewport (8px margin).
- **Menu items:** radio items, a 6px dot at the start marks the checked one in the accent colour; hover is 8% of text. Arrow keys, Home and End walk the items.

### Note

The one thing the user manipulates. A block exactly one row high, filled with the note colour, with a border mixed 30% toward the text colour. Width is its duration, with a 5px minimum.

- **Hover:** none beyond the grab cursor.
- **Selected** (`aria-pressed="true"`): fill mixed 72% with text and a 2px text-colour outline, 1px offset.
- **Focus** (keyboard): 2px accent outline, 2px offset. When the note is also selected the accent shows as a 5px spread ring around the selection outline, so selected-and-focused is distinguishable from selected alone.
- **Dragging** (`data-dragging`): lifted note shadow, grabbing cursor, stacked above others.
- **Blocked drop** (`data-blocked`): opacity 0.45 and a 2px dashed text-colour outline. Shape and dimming carry the meaning, not colour.
- **Read-only:** default cursor; the drag threshold still applies and a notice is sent to the host.

### Readout chip

The one authored move. An inverted chip: text colour as fill, background colour as text, 4px radius, `3px 8px` padding, label size, tabular numerals, no pointer events. It follows the pointer while dragging, offset 14px right and 34px above (56px above for touch, so the hand does not cover it), clamped inside the editor. It shows the pitch name and the bar and beat the note would land on, in the host language (for example "E4 · bar 8 beat 1.75"). It is hidden when no drag is in progress and is hidden from assistive technology; the position a move ends at, and a refused move, are announced through a polite status region instead.

### Read-only badge

Pill, 1px strong line, muted text, label size, at the end of the toolbar. It appears only when the editor is not editable.

### Focus treatment

Interactive parts (button, menu item, note) get a 2px accent outline with 2px offset on keyboard focus. The scroller is focusable; because its own outline would be hidden behind the sticky ruler and pitch column, a 2px accent ring is drawn over the whole body instead.

### Ruler, pitch column, lane

Bar numbers at the left of each bar in muted text. Pitch labels per octave in muted text, bottom-aligned. Lane grid lines, heaviest to lightest: bar (strong line), beat (line), sub-beat (line at 50%; spacing follows the chosen grid of 1/4, 1/8 or 1/16). Black-key rows are shaded with 5% of text.

### Motion

Only one transition exists: notes fade opacity over 120ms ease-out (the blocked-drop dimming). It is applied only under `prefers-reduced-motion: no-preference`. Dragging itself moves by direct translation with no easing. No other animation exists.

## Do's and Don'ts

### Do:

- **Do** take every colour from the theme variable contract or a `color-mix` of bg and text; add a new public variable only when a host cannot be served by derivation.
- **Do** keep the neutral defaults described as defaults, and keep hosts' mapping optional: mapping only bg and text must stay readable.
- **Do** size type with `small` at the root and `em` below, and use tabular lining numerals for any number.
- **Do** give every new interactive element a 2px accent outline with 2px offset on `:focus-visible`, and a coarse-pointer size (36px or larger for controls, a hit area padded around a note).
- **Do** show a state with a shape or outline in addition to colour, as selection (outline) and blocked drops (dashed, dimmed) do.
- **Do** put any new floating layer in a native popover so it reaches the top layer.
- **Do** prefix every class with `sce-`, inject styles once per container, and release them on destroy.

### Don't:

- **Don't** state a brand: no fixed brand colour, no bundled font, no logo.
- **Don't** hard-code `px` or `rem` font sizes, or a font family other than through `--sce-font-family`.
- **Don't** add shadows at rest. Shadow marks a lifted or floating thing.
- **Don't** add decoration or motion beyond the 120ms note opacity transition, and keep that one off under reduced motion.
- **Don't** rely on a host's cascade. Style isolation is a constraint on all future work: the root resets everything (`all: initial`), descendants revert (`all: revert`) under a doubled `.sce-root.sce-root` selector so a host rule such as `.page div` does not reach in, and component rules are written under `.sce-root`. Notes are the one exception: they reset only the few properties they need by hand, because reverting every note made first render about three times slower. A new note-like element that is created in the thousands must follow the notes, not the rest.
- **Don't** publish or depend on `--sce-_*` variables outside the stylesheet.
- **Don't** import styles as a CSS file or leave anything behind: the stylesheet is a string, delivered as a constructed stylesheet (a style element only where that is unavailable, since a strict style policy blocks injected style elements) into the document or the host's shadow root, and removed with the last editor.
- **Don't** count on isolation against ID selectors or `!important` rules in the host's page when the editor sits in the page itself: they reach in. A host with such rules mounts the editor inside a shadow root.
