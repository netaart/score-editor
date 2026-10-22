---
name: Score Editor
description: An arrangement view of a song score, in the manner of a DAW's piano roll, with note selection, an insertion point and the first edits, and with no brand of its own. The host supplies colour and type through theme variables; the package supplies structure, interaction and neutral defaults.
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
  glyph: "1px"
spacing:
  toolbar-gap: "8px"
  toolbar-padding-x: "12px"
  button-padding-x: "10px"
  flag-padding-x: "5px"
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
  icon-button:
    width: "28px"
    height: "28px"
    rounded: "{rounded.default}"
  icon-button-coarse:
    width: "36px"
    height: "36px"
  selection-frame:
    width: "2px"
  insertion-line:
    width: "2px"
  badge:
    rounded: "{rounded.pill}"
    padding: "2px 8px"
    typography: "{typography.label}"
  ruler:
    height: "1.85em"
  band:
    height: "1.7em"
  chord-row:
    height: "2em"
  note:
    height: "14px"
    rounded: "{rounded.note-max}"
  note-coarse:
    height: "24px"
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

It is an Operate surface: an arrangement view for people who generated a song and want to see how it is built before changing it, and who can now change the first thing: select a note, turn it into a rest, take that back. DAW conventions are the reference: a pitch column at the left, a bar ruler on top with section bands, key and meter marks and a chord track under it, one piano-roll track per voice, a hairline grid with heavier bar lines, black-key rows shaded, zoom on the time axis. Touch and keyboard are first-class: the view scrolls with a finger, the arrow keys and the wheel, and zooms with buttons, a menu, the plus and minus keys and control plus the wheel; a tap selects, and the keys edit. The interface is dense on a fine pointer and roomier on a coarse one.

Two more views draw the same project, and a switch of three icon buttons at the end of the toolbar chooses among them: the arrangement above, the score on a staff (drawn by abcjs, read-only), and the score text in a box where a person can write it. They are not tabs of separate documents: the project is one, an edit in the text shows in the other two, and one undo history covers all three.

The one authored move is the cut: when the score text stops before the song does, the part that was never written is hatched and edged with a dashed line, an "Incomplete bar" flag sits at the bar where it stops, and one sentence above the view says what that means. A hatch reads as "nothing here yet", which is the opposite of a rest (a gap). The rest of the surface stays plain on purpose.

**Key Characteristics:**

- No identity of its own: colours and type come from the host; defaults are neutral.
- Hairline structure: 1px lines, tonal fills, almost no shadow.
- Two densities selected by pointer type, not by screen width.
- Meaning never rests on colour alone: a cut is hatched and dashed, a tie is one joined bar, a selected note is framed, the insertion point is a heavier line with a flag, a missing chord track says so in words.
- Editing is a state of the session, not of a part: every control and every gesture that edits is there only while `session.view.editable` is true, and the read-only view is the same view with those left out.
- Text that does not fit its cell is left out whole, never cut mid-word: a cut "Dm" would read as "D".
- Isolated styles: a host's element and class selectors do not reach in; inside a shadow root nothing does.

## Colors

The package states no palette. It reads eight theme variables and falls back to neutral values only where the host has not mapped one. The six hex values in the frontmatter are those fallbacks, one pair per light and dark scheme; they are defaults, not a brand.

### The theme variable contract (normative)

A host maps its own theme onto these public variables, set on the editor's root or any ancestor. Names are stable. Anything else the package declares is private.

| Variable | Controls | Default when unmapped |
| --- | --- | --- |
| `--sce-color-bg` | Ground of the roll, button fill | `#ffffff` light, `#1b1c1f` dark |
| `--sce-color-text` | Text | `#18181b` light, `#ececee` dark |
| `--sce-color-surface` | Toolbar, header rows, track head, pitch column, popover | 5% of text mixed into bg |
| `--sce-color-muted` | Secondary text: bar numbers, octave labels, the Chords label, the empty-chord message, the badge | 66% of text mixed into bg |
| `--sce-color-line` | Hairlines: beat lines, row rules, panel borders | 13% of text mixed into bg |
| `--sce-color-line-strong` | Bar lines, the edges of section bands, marks and chords, the cut hatch, button and badge borders, popover border | 28% of text mixed into bg |
| `--sce-color-accent` | Focus ring, checked menu dot | `#2457d6` light, `#7da3ff` dark |
| `--sce-color-note` | Note fill | the accent value |
| `--sce-font-family` | Font family | the host's inherited font |
| `--sce-font-family-mono` | Font family of the score text and its line numbers | `ui-monospace`, `Cascadia Mono`, `SF Mono`, `Menlo`, `Consolas`, `monospace` |
| `--sce-radius` | Base corner radius | `4px` |
| `--sce-row-height` | Height of one pitch row (and of a note) | `14px` fine pointer, `24px` coarse pointer |
| `--sce-beat-width` | Width of one quarter note at 100% zoom | `40px` |
| `--sce-keys-width` | Width of the pitch column | `44px` |

Defaults follow the host's `color-scheme` through `light-dark()`: a host that sets `color-scheme: dark` gets the dark values with no mapping at all.

**Derivation.** Surface, muted, line and line-strong are computed from the mapped background and text with `color-mix(in srgb, ...)` at the percentages above. A host that maps only `--sce-color-bg` and `--sce-color-text` therefore gets a coherent set of greys in any scheme, and every text colour keeps a contrast of at least 4.5:1 (a test maps only those two and checks the title, zoom value, bar numbers, section names, chords, marks, track names and octave labels). A host that maps one of the four greys overrides only that one. Do not add a variable for a derived grey unless a host proves the derivation fails.

**Private variables.** The `--sce-_*` names (`--sce-_bg`, `--sce-_text`, `--sce-_surface`, `--sce-_muted`, `--sce-_line`, `--sce-_line-strong`, `--sce-_accent`, `--sce-_note`, `--sce-_radius`, `--sce-_row`, `--sce-_beat`, `--sce-_keys`, `--sce-_shade`, and the row heights `--sce-_ruler`, `--sce-_band`, `--sce-_chords` and their sum `--sce-_top`, and `--sce-_head-top`, where the editor's track heads pin) are aliases that resolve the public variable or its default. They are not public: hosts must not set them and new work must not document them as an API. Per-instance layout values (`--sce-ticks`, the length of the score in ticks, on the canvas; `--sce-rows`, the pitch rows of a lane) and per-item values (`--t` start, `--d` or `--w` length, `--r` row, all in ticks or rows) are set by the editor itself.

### Neutral defaults

- **Ground** (#ffffff light, #1b1c1f dark): the roll and the button ground.
- **Ink** (#18181b light, #ececee dark): text.
- **Cool accent** (#2457d6 light, #7da3ff dark): focus and checked state; also the note fill unless a note colour is mapped.

Derived values used by the build: black-key row shading and the tint of every second section band are 5% of text over transparent; a hovered button is 6% of text over bg and an expanded one 10%; a hovered menu item is 8% of text; a note's border is 30% of text mixed into the note colour.

### Named Rules

**The Borrowed Colour Rule.** The package never names a colour outside the variable contract and its neutral defaults. A new surface takes its colour from an existing variable or a derivation from bg and text.

**The One Accent Rule.** Accent marks focus and the checked menu dot; the note colour defaults to the same value. Nothing else is tinted.

## Typography

**Font:** the host's inherited family unless `--sce-font-family` is set. The editor ships no font and loads none.

**Character:** whatever the host's text looks like, set small and quiet so that notes and grid carry the surface.

Sizes are keyword-relative so the user's browser font size applies and a host's rem tricks do not distort the tool: the root is `small`, and every other size is in `em` of it. The header rows and the pinned track heads are sized in `em` too, so a larger browser text size makes them taller instead of clipping their text.

### Hierarchy

- **Base** (400, `small`, line-height 1.3): toolbar buttons, menu items, the cut sentence, the problem view.
- **Title** (600, `small`): toolbar title, the zoom value, chord names.
- **Label** (`0.92em`): bar numbers, section names (600), marks, track names (600, 0.02em tracking), badge.
- **Numeral label** (`0.85em`): octave labels in the pitch column and the Chords label.

### Named Rules

**The Tabular Numbers Rule.** Every number that can change (bar numbers, octave labels, the zoom value, marks) uses lining, tabular numerals (`font-variant-numeric: lining-nums tabular-nums`) so numbers do not shift as the zoom changes.

**The Keyword Size Rule.** No `px` or `rem` font sizes. The root is a keyword; descendants are `em`.

## Layout

A single scroller holds a canvas. Its width is the pitch column plus the score's length at the current zoom (the length in ticks times the beat width, over 256 ticks to the quarter note, times the zoom). The scroller scrolls both ways. A header block is pinned to the top: the bar ruler, the section bands, the marks row and the chord track, in that order. Under it each voice has a track: a track head (the voice's name) pinned below the header, a pitch column pinned to the left, and a lane. Time runs left to right whatever the page direction. A lane's height is its rows times the row height, with each octave being twelve rows; a voice's rows run from a margin of a few semitones below its lowest note to a margin above its highest, rounded out to whole octaves.

Structure from top to bottom: toolbar strip (minimum 40px; title, zoom group, history group, spacer, read-only badge), the cut sentence when the score is cut, the header block, then the tracks (`Vocal`, then `Ins` when present). The root fills its parent (`height: 100%`, minimum 288px) and clips overflow; the host decides the size.

**The time axis.** Zooming sets the width of the elements that carry the axis (the canvas, the four header timelines, the lanes), by writing `calc(var(--sce-ticks) * var(--sce-_beat) * <zoom> / 256)` as their width. Everything placed on the axis (notes, bar numbers, chords, flags, bands, the cut, the grid) is positioned in percent of its axis element from its start and length in ticks. Do not hold the zoom in an inherited custom property: a variable that changes on the root restyles every note (about 70 ms per step at 1500 notes, against about 3 ms for widths). The zoom steps are 10%, 25%, 50%, 100%, 150%, 200% and 400% (1% to 400% reachable with the control wheel), and "Fit whole song" fits the score to the width shown.

The opening view is scrolled to the middle of the first voice's notes in pitch and to the first bar in time.

Density follows pointer type, not viewport width. A fine pointer gets the compact set; a coarse pointer (`pointer: coarse`) gets the larger one:

| Element | Fine pointer | Coarse pointer |
| --- | --- | --- |
| Row height and note height | 14px | 24px |
| Toolbar button minimum height, and the width and height of an icon button | 28px | 36px |
| Menu item minimum height | 30px | 40px |

A host that maps `--sce-row-height` overrides both. Header rows at the default text size are 24px (ruler), 22px (sections), 22px (marks) and 26px (chords); track heads are 22px. Spacing is a small set used as seen: 8px gaps in the toolbar, 12px toolbar side padding, 10px button side padding, 5px before the text of a flag or chord.

Touch behaviour: the scroller takes one finger for panning in both directions and leaves the page's own pinch (`touch-action: pan-x pan-y pinch-zoom`). A pinch does not zoom the time axis; the buttons and the menu do. A press that ends within 6px of where it began is a tap and selects; a press that moves farther is a swipe, and the browser keeps it as a scroll.

## Elevation & Depth

Flat by default, tonal layering for depth: the toolbar, header rows, track head and pitch column sit on the surface tone; the lanes sit on the ground tone. The only shadow is the popover's.

### Shadow Vocabulary

- **Popover** (`box-shadow: 0 8px 24px color-mix(in srgb, var(--sce-_text) 22%, transparent)`): the zoom menu in the top layer.

### Named Rules

**The Flat Rule.** Nothing has a shadow at rest. A shadow marks a floating layer.

## Shapes

Small, even corners. The base radius is 4px and comes from `--sce-radius`. Notes use the smaller of the radius and 3px. The popover uses the radius plus 2px. The read-only badge is a full pill (999px). All borders are 1px hairlines in the line colours; a note's border is 1px in a darker mix of the note colour. The zoom value button's chevron is a 5px rotated border corner, and the minus and plus buttons draw 10px by 2px bars with 1px ends, both in CSS and not glyphs, so no font is involved. The checked menu dot is a 6px circle.

## Custom tools

Custom tools are not view parts: they are pure data and a function, exported from the package entry, that the tool panel (a later view part) reads beside the editing session. The panel draws a tool's `name` in the session's language and one control per declared parameter: a number field with the declared `min`/`max`/`step`, a checkbox for a boolean, a menu of the declared `values` for a choice, and a text field for text. A parameter without a `label` shows its `name`. Every control starts at the declaration's `default`, so a tool can always run.

The panel previews with `previewTool` or `session.previewTool`: the returned project is the result, and a `tool-parameter` or step diagnostic is shown in the same inline place a refused command is. Previewing never writes to the session, so moving a control and reopening the panel cannot change the document or its history. Running calls `session.runTool`, which is one history step and therefore one undo; the panel returns to the preview after it. The registry is the only list the panel reads, so a host registers a tool once and the panel shows it without another wiring step. The tool layer adds no colours, sizes or nodes of its own; the panel uses the controls, focus ring and diagnostic text the rest of this document already specifies.

## Components

### View parts

The arrangement is built from view parts bound to one editing session: the toolbar, the zoom control, the cut notice, the problem view, the time ruler, the chord track and one voice track for each voice. Three views share the editor's frame: the arrangement, the staff view and the text view, chosen by the view switch, with the stale notice above the two that draw the project. The staff view, the text view, the stale notice and the view switch are parts of their own too, and a host can mount any of them. A host can mount any of them on its own element; the default editor mounts all of them in the layout described above. Every part's root carries the same context as the editor's root (the theme variables, the reset, the text size) and is a stacking context of its own, so a part is styled and isolated alike wherever it stands; the decisions are in [the spike](docs/spike.md). The root is a `div.sce-root.sce-part`. Inside the default editor it draws no box (`display: contents`), so the layout above is the layout of the parts; mounted alone it is a block as wide as its element.

- **The time axis.** The ruler, the chord track and a voice track share the session's zoom and horizontal scroll. Zoom writes the same width formula as above on every part in one pass, and only then scrolls them, so the document lays out once. Mounted alone, each of the three is its own horizontal scroll surface (`overflow-x: auto`) whose scroll offset the session sets and whose user scrolling the session takes back, so parts of different widths scroll together and each stops at its own end without pulling the others back. The ruler and the chord track hide their scrollbar; a track shows it. A part that draws is a focusable region with a name, so Tab reaches it. Each of the three also keeps one polite live region (see Announcements) that survives every redraw. Zoom actions (the menu, the steps, "Fit whole song") measure the first part on the axis; control plus the wheel and the plus and minus keys measure the part that received them. The default editor puts all of its parts in one scroller and gives it to each as the `scroller` option, so none of them is a scroll surface there.
- **Pinning.** The default editor pins its header block, which holds the ruler and the chord track, above the tracks, and its track heads pin under that block.

### Toolbar

A view part of its own (`mountToolbar`); in the default editor it is the first row and draws no box of its own. Surface-tone strip, minimum 40px high, 1px line under it. Title at the start in 600 weight, the zoom group (minus button, zoom value button with a chevron, plus button), the history group (undo and redo) and the Delete button while the session is editable, a flexible spacer, and at the end the read-only badge while it is not. In the default editor the row ends with the view switch (the `viewSwitch` option of `mountToolbar`), after the read-only badge, and the title names the shown view ("Arrangement", "Staff", "Score text"). The zoom group and the Delete button mean something only on the arrangement, so they are hidden while another view is shown; undo and redo stay, since the text view's steps are on the same history. A toolbar with the switch does not scroll sideways: where its controls do not fit (a phone width), it wraps, and the badge and the switch move together to a second line, right-aligned, so every control is in sight at 320px. The title is the one thing that gives way in a narrow host (it is cut with an ellipsis); when the controls still do not fit, the row scrolls sideways (`overflow-x: auto`, scrollbar hidden), so every control can be reached by finger or by Tab down to a 190px box; no control is squeezed below its size (the icon buttons keep 28px, 36px on touch) to make room. The history group and the Delete button are hidden with the editing, and with the view when it is not shown (an unreadable score, no dialect). The screen-reader hint is the one sentence a view's `aria-describedby` points to; it is in the toolbar part, drawn only when the host gives it an id, and names the editing keys only while the session is editable.

### Undo, redo and Delete

Two square icon buttons in a group named "History", after the zoom group: the same ground fill, 1px strong line and 4px radius as the zoom steps, 28px (36px coarse), with a 16px arrow that turns back on itself in a 1.5px stroke (redo is the same drawing mirrored). The arrows are polylines in an inline SVG styled from the stylesheet, so no font and no glyph is involved; a path would not do, because the reset reverts the `d` property of a path. Each has an accessible name ("Undo", "Redo") and a tooltip that also names its keys ("Undo (Ctrl/Cmd+Z)", "Redo (Ctrl/Cmd+Shift+Z)"). A button with nothing to do is `aria-disabled` and muted, as a zoom step at its end is, and does nothing when pressed. The keys are Ctrl or Cmd plus Z (undo), Ctrl or Cmd plus Shift plus Z and Ctrl plus Y (redo), and work with the focus anywhere inside the part that hears them.

Delete is a third square icon button of the same kind, after the history group, with a bin drawn in the same 1.5px polylines (a lid with its handle, then the body). It is the pointer and touch path to what the Delete key does, since a phone has no key and double tap is a later gesture: it turns every selected pitched note into a rest as one history step. Its name is "Delete" and its tooltip "Delete (Del/Backspace)". It is `aria-disabled` and muted, like a history button with nothing to do, until a pitched note is selected, and a forced press then does nothing; after a delete the selection holds only rests, so it mutes again, and undo brings the note back selected and the button with it. It has no colour of its own: the action can be undone, so it is not drawn as a danger. When the score refuses the edit, the toolbar's live region says why and where.

### Zoom controls and menu

- **Buttons:** ground fill, 1px strong line, 4px radius, 28px high (36px coarse). The step buttons are square (28px or 36px). Hover darkens by 6% of text; expanded state 10%. A step that has nowhere to go is `aria-disabled` and muted.
- **Value button:** shows the zoom as a percentage in 600 weight and opens the menu; its accessible name is "Zoom 100%" and it carries the popover's expanded state.
- **Popover:** a native popover (`popover="auto"`), so it lives in the top layer and stacks above a host's full-screen layer. Surface fill, 1px strong line, 8px/24px shadow, positioned under the button and nudged left if it would overflow the viewport (8px margin).
- **Menu items:** radio items for the presets, a rule, then "Fit whole song" as a plain item. A 6px dot at the start marks the checked preset in the accent colour; hover is 8% of text. Arrow keys, Home and End walk the items; Enter or Space picks; Escape closes and returns focus to the button.
- **Keys and wheel:** `+`, `=` step in; `-`, `_` step out (on the focused view); control plus the wheel zooms smoothly around the pointer, and stops the page from zooming itself.

### Ruler and bar numbers

A 1.85em row (24px at the default size). Each bar number sits at the left edge of its bar in muted text, with a strong line at its left. When bars get narrow the numbers thin out: only every 2nd, 4th, 8th, 16th or 32nd bar is numbered (the smallest power of two that leaves 32px between numbers), and the first is always shown.

### Section bands

A 1.7em row. One band per section that has bars, from its first bar to the next band, with a strong line at its left and its name in 600 weight pinned to the left edge of the visible part. Every second band is tinted. Music before the first marker is named "Unnamed" ("未命名"); a marker with no bars after it draws nothing.

### Marks row

A 1.7em row of flags. The first flag shows what is in force at the start (meter and key); each later flag stands where a meter or key change takes effect, which for a key change may be inside a bar. A flag has a strong line at its left, 5px of padding and its items in a row ("4/4", "Key D"). The items stay at the pitch column's edge while the flag's stretch is scrolled past, so the key and meter in force are always readable; they never leave the flag's stretch. The last flag of a cut score carries "Incomplete bar" or "Cut off" (see The cut). A flag too narrow for an item leaves that item out whole.

### Chord track

A 2em row labelled "Chords" in its corner. Each chord's name in 600 weight at the position where the score writes it, running to the next chord, with a strong line at its left. A chord name that does not fit its width is left out whole. A score with no chords shows one muted sentence, "No chords in this score", pinned at the left, instead of an empty row.

### Track, lane and grid

A track is its head (the voice's name, 22px, pinned under the header), the pitch column and the lane. The pitch column labels each octave (C4, C5) in muted text, bottom-aligned on its C row. Black-key rows are shaded with 5% of text. The grid is drawn in each meter run of the score: a strong line at every bar start and a light line at every beat of the bar's own meter (a quarter note in 4/4, an eighth in 6/8), as gradients, so a line costs no node. Beat lines are dropped when beats are closer than 12px, leaving the bar lines; bar lines are dropped too when bars are closer than 10px (a whole long song fitted to the width), leaving the ruler's numbers and the bands to carry the structure, because a line every 5px is a comb over the notes.

### Selection

A selected note is framed by a 2px border in the text colour in place of its 1px border, with the fill unchanged; the frame sits inside the box, so nothing moves and no neighbour shifts. A tied chain is selected as a whole, since Delete takes the whole chain: the sides where its segments join keep no border, so the frame runs round the chain as one bar. A selected note's label ends with ", selected" ("，已选中" in Chinese). Shape and weight say the state, not hue, so it reads in any host palette. Measured with the neutral defaults, the frame is 14:1 or more against the lane and 2.9:1 (light) or 2.1:1 (dark) against the default note fill, so the outer edge carries the state; a host that maps a note colour close to its text colour is left with the 2px weight alone. While the session is editable the browser's own tap highlight is turned off, since the frame answers a tap. Only a pitched note is selectable: a click or tap on a note selects it, a click or tap on empty lane space clears the selection. A note shows the pointer cursor only while the session is editable.

### Selecting by keyboard

Notes are reached the way an option is reached in a listbox (the roving tabindex of the WAI-ARIA authoring practices): exactly one note of a voice track is in the tab order, the selected note or else the first, so Tab enters the notes in one step and the next Tab leaves them. Moving from note to note follows a score editor, not a pointer: with a note in focus, Left and Right step to the previous and next note of the voice and select it, Home and End go to the first and last, and Enter or Space select the note in focus (the way in when Tab has just arrived, because arriving does not select). Selection follows the stepping so that the ring and the frame are always on one note and Delete never acts on a note other than the one the eye is on; it costs nothing here, since selecting does no work that a slow step would repeat. A tied chain steps segment by segment and is framed whole, as it is when clicked. The stepping stays quiet in the live region, because the focus already speaks the note it lands on; Enter and Space say what they selected.

The keys belong to the notes only while a note has the focus. With the focus anywhere else in a part, Left, Right, Home and End still move the insertion point or scroll as before, whatever is selected. A key with Shift, Ctrl, Cmd or Alt is not taken by the notes: Shift with the arrows, Shift-click, a box, Ctrl or Cmd with A, Ctrl or Cmd plus Shift with A and Escape are left free for selecting more than one note, and Alt or Ctrl with the arrows for moving notes. A click or tap puts the focus on the note it selects, so the keys go on from there; it is the browser that moves the focus for a tap, because a focus moved by script before it would count as keyboard focus and draw the ring. A note the keys step onto is scrolled out from under the pinned header, the track head and the pitch column (`scroll-padding` on the scroller, with 4px for the ring), not left half hidden where Delete would act on a note the eye cannot see; the left edge of the ring of a note at the very start still goes under the pitch column. A redraw that removes the note in focus (a delete, a language change) gives the focus to the same note if it is still drawn, else to the next and then the previous note, else to the track, so the history keys keep working; a note that has the focus keeps the tab stop when the selection is changed from elsewhere. Notes are focusable only while the session is editable.

The notes keep the role of list items. A focusable list item is not the pattern an assistive technology expects of a selectable option (a listbox with `aria-selected`), and the label ending in ", selected" does the work of that state; the move to a listbox belongs with multiple selection, where `aria-multiselectable` is needed anyway.

### Insertion point

A 2px line in the text colour through the whole height of every voice lane, with a flag at its top: a 10px wide, 5px tall triangle drawn with borders, so it costs no node beyond the line. It is heavier and darker than the 1px muted bar lines and sits on the nearest beat line of the bar's own meter, until the shared grid replaces that step. The flag sticks just under the pinned track head, so it stays in view when the lane is scrolled past its top. At the start and the end of the lane the line is kept whole inside it, where the pitch column and the focus ring would otherwise cover half of it; the flag at the start is then half under the pitch column. It ignores the pointer, has no hover and no motion, and is drawn only while the session is editable. It is named for screen readers as a separator ("Insertion point, bar 1 beat 3" or "Insertion point, end of the score").

### Note

A block exactly one row high, filled with the note colour, with a border mixed 30% toward the text colour. Width is its duration less a 1px gap, with a 2px minimum. Rests are not drawn: a rest is the gap between blocks. A note tied to the next note of the same pitch loses its gap, its right border and its right corners, and the next note loses its left border and corners, so a tie reads as one connected bar. A note is a list item labelled "C4, bar 1 beat 1, length 1 beat" (with ", tied to the next note" when it is), in the host language, in a list named for its voice.

### The cut

When the text of a voice stops before the song does, three things say so: a strip of one sentence above the view, led by a small swatch of the hatch so the sentence and the texture read as one ("This score is cut off: bar 232 of Ins is incomplete." or "...after bar 5 of Vocal."), a flag in the marks row at the bar where it stops ("Incomplete bar" when the bar is unfinished, "Cut off" when the text stops at a bar line, which puts the flag at the end of the score), and in that voice's lane a hatched tail with a dashed left edge from where its last note ends to the end of the score. The hatch is 1px diagonal lines in the strong line colour at 7px (the swatch is 1.1em square with a dashed border); the strip is a note landmark. None of it uses a new colour.

### Problem view

When the score cannot be read, the view is replaced by an alert panel: one sentence in 600 weight ("This score can't be shown because it can't be read."), then the dialect's diagnostics as a list in the interface language ("The duration "5" is not allowed. (bar 1, line 10)"), at most 20 and then "and N more". A model with no dialect gets one sentence naming it. The toolbar keeps its title and loses the zoom group.

### View switch

Three square icon buttons in a group named "View", joined: they share their borders (a 1px overlap) and only the outer corners keep the radius. The buttons are 28px (36px on a coarse pointer) like the history buttons. Each has an accessible name and tooltip ("Arrangement", "Staff", "Score text") and `aria-pressed`; the shown one is filled with 12% of the text colour over the ground, has a text-colour border and draws its icon at 2px, so the state is carried by fill and weight and never by hue. The icons are polylines in an inline SVG, as the history arrows are: short bars at different starts for the tracks, five full-width lines at 1px for the staff, three left-aligned lines for the text. They work in a read-only session, since they change what is shown and not the score. The group follows a view that anything else sets (`session.setActiveView`), and the session's language.

### Text view

The score text in a plain `textarea`, with a gutter of line numbers on its left that scrolls with it, in the monospace face of `--sce-font-family-mono` (16px on a coarse pointer, since a phone zooms the page when a smaller box is focused). Under the box, one status sentence in the interface language ("No problems", "3 problems", and while the project keeps an older score, "1 problem. The other views still show the last readable score."), and when there are problems, a list of them: each is the diagnostic's sentence with its bar and line ("The duration “5” is not allowed. (bar 1, line 10)"), at most 20 and then "and N more", and it is a button that selects that line in the box and scrolls it into view. A line with a problem is marked in the gutter by a dot and a bold number as well as by colour, and an item of the list is underlined when it is pointed at or focused. The box takes the focus ring of the other controls (2px accent, drawn inside, since the part clips it) and is `aria-invalid` while its text cannot be read.

**Live parse and check; one undo step for a burst.** Text is checked when typing pauses for 600 ms and when the box loses the focus, whichever comes first (`session.checkScoreText`, the same rule `replaceScoreText` applies, so what the status says is what the command would do). Text that reads is dispatched as one `replaceScoreText` command, one history step, and the project holds the text as the dialect writes it. Text that does not read is dispatched nowhere: it stays in the box exactly as typed, the session is told (`setRejectedText`) and the project keeps the last readable score.

Why a pause and not every key, and not only on blur: a step for every keystroke would make undo a character at a time and fill the history with the half-typed texts that cannot be read; a step only on blur would keep a reader's edits from reaching the arrangement and the staff while they are still in the box, which is the point of a live view. A 600 ms pause is the length of a thought between two words, so one burst of typing, one phrase, is one step, and the other views follow within a second. Leaving the box, and so any click on the toolbar's Undo, commits first, so Undo pressed right after typing undoes that typing. Inside the box, Ctrl or Cmd plus Z is the browser's own (the editing keys skip text controls), which undoes keystrokes of the box; the toolbar's Undo and Redo are the project's steps. A dispatch that leaves the project as it was adds no step.

The box is read-only while the session is, or when the model has no dialect (with a sentence that says so). Text it holds but did not hand over is given up when the session turns read-only, since nothing may be handed over then. When the project changes from elsewhere (an undo, `replaceProject`), the box shows the project's score again and the rejected text is dropped.

### Stale notice

One sentence above the arrangement and the staff, shown only while the text view holds text that cannot be read: "The score text has a problem, so this view still shows the last score that could be read. Fix it in the text view." It is a note landmark like the cut notice, with a 3px text-colour edge at its start in place of the hatch swatch. The arrangement and the staff keep drawing the last score that read; the notice is what tells the reader that they are behind the text. It is not drawn for a project that came with an unreadable score, where the problem view says that already.

### Staff view

The project's score on a staff, drawn by abcjs 6.7.1 (the newest release published at least 7 days before it was added) into a scrolling region of its own: focusable and named, so Tab reaches it and the arrow keys scroll it; 12px of padding; the scrollbar's room is kept so the drawing's width does not change when it appears. The drawing is as wide as the region and is drawn again, with the abcjs line breaking told that width, when the region's width changes. It is read-only: a click or tap on it changes nothing. A score that cannot be read is not drawn, and the problem view above explains it. abcjs cannot split a very dense bar, so such a drawing can be wider than the region; the region scrolls and the page does not (checked at 320px).

abcjs is loaded with `import()` when the staff view is mounted, and the default editor mounts it the first time the staff is shown: the package entries import no abcjs (a test imports both in a process that fails when abcjs is loaded), and a host that never shows the staff never fetches it. Until it arrives the part says "Loading the staff…"; if it cannot be loaded it says the staff could not be drawn and that the other views still work.

**How abcjs is isolated (the result of the check).** abcjs draws an SVG with its own presentation attributes and expects a page without rules for `svg`, `text` or `path`, and it measures text through a dummy SVG it puts in the document. The check was run in Chromium, in the default editor and with the part alone, in the light DOM, in a host's shadow root, with hostile page rules, and under a strict style policy:

- The drawing is made inside an open shadow root that the part attaches to an element of its own, inside the part's root. A host's rules for `svg`, `text`, `path` and `*`, even with `!important`, do not reach into it, with the editor in the page and with the editor in a host's shadow root (the nested shadow root is why). The reset of the package's own style sheet does not reach into it either, so the drawing carries a short sheet of its own (constructed where the browser has constructed sheets, a style element where it has not) that sets the colour and the box.
- The colour is `currentColor`: the drawing takes the text colour of the part, so a dark scheme and a host's `--sce-color-text` apply with no variable of its own.
- A strict policy (`style-src 'self'`) blocks the style element abcjs may add and the drawing is unchanged, since everything it needs is in attributes and in the sheet above.
- Global CSS: nothing is added to the page. The part adds no rule and no element to `document` or to the host's shadow root beyond its own node; after the drawing the page holds no svg and no style element of abcjs's, and once the layout is closed the page's markup is as it was. Of the `document` abcjs reads, only its dummy SVG for measuring text is used, and it is not left behind.
- What cannot be isolated, and is accepted: abcjs registers two `resize` listeners on `window` when it loads, which it offers no way to remove (the lifecycle test loads abcjs before taking its baseline of listeners for that reason), and it keeps a text-size cache of its own for the life of the page.
- `getBBox` needs a displayed box, so the part draws only when its region has a width: a staff view mounted in a hidden container waits until it is shown, and keeps what it drew before while it is hidden.

### Read-only badge

Pill, 1px strong line, muted text, label size, at the end of the toolbar. It appears only while the session is not editable, and takes the place of the history group. In that state nothing in the view offers an edit: no history or Delete button, no selection frame, no insertion point, no tab stop or pointer cursor on a note, nothing said in the live regions, and Delete, the history keys, the note keys and the insertion point keys do nothing.

### Focus treatment

Interactive parts (buttons, menu items) get a 2px accent outline with 2px offset on keyboard focus, and so does a note reached by keyboard, outside the selection frame, so the ring (where the keys act) and the frame (what Delete takes) read as two things. A click or tap does not draw the ring. The scroller is focusable; because its own outline would be hidden behind the sticky header and pitch column, a 2px accent ring is drawn over the whole body instead.

### Announcements

What a screen reader cannot see in the drawing is said in words, in the session's language, by one polite live region (a visually hidden `role="status"` node) that each time-axis part and the toolbar keep for their whole life; a redraw never removes it, so a sentence is not lost with the content it follows. Which part speaks follows who owns the state: a voice track says which of its own notes were selected ("Selected D4, bar 1 beat 2", "Selected 3 notes") and that a delete took some of them ("Deleted D4, bar 1 beat 2"), and for an undo or redo what it brought back ("Restored D4, bar 1 beat 2") or took away, since the selection does not change with a history step; the track of the score's first voice also says where the insertion point moved ("Insertion point, bar 1 beat 3"), because the point is on the axis every track shares and one voice should say it once; a part that heard a refused edit says why and where, in the sentence the host's notice carries, and the toolbar does so for its Delete button. No part reads another part: each follows the session and the score alone. A part says nothing while the session is read-only. Stepping from note to note by keyboard is not announced, since the focus speaks the note it lands on. Keys pressed while the focus is on the scroller, outside every part, are heard by the frame, which keeps a region of its own for the refusals they cause and tells the host's notice as well.

### Motion

None. No transition or animation exists, so nothing needs a reduced-motion alternative. Zoom, scroll, selection and the insertion point change the view directly.

## Do's and Don'ts

### Do:

- **Do** take every colour from the theme variable contract or a `color-mix` of bg and text; add a new public variable only when a host cannot be served by derivation.
- **Do** keep the neutral defaults described as defaults, and keep hosts' mapping optional: mapping only bg and text must stay readable.
- **Do** size type with `small` at the root and `em` below, size header rows and pinned heads in `em`, and use tabular lining numerals for any number.
- **Do** give every new interactive element a 2px accent outline with 2px offset on `:focus-visible`, and a coarse-pointer size (36px or larger for controls).
- **Do** say a state with a shape or words as well as colour, as the cut (hatch, dashed edge, a sentence) and the tie (one joined bar) do.
- **Do** leave out text that does not fit its cell, whole, instead of cutting it; thin numbers out rather than crowd them.
- **Do** place anything on the time axis in percent of its axis element, and change the zoom only by setting those elements' widths.
- **Do** gate every control and gesture that edits on the session's `view.editable`, in every part, so one flag turns the editing on and off everywhere.
- **Do** let a gesture act on the arrangement only while the arrangement is shown: clicks, Delete and the insertion keys do nothing on a hidden view, and a plus or a minus typed into the score text is text and not a zoom.
- **Do** draw a third party's SVG in a shadow root of its own, coloured by `currentColor`.
- **Do** build an icon from polylines or other attribute-geometry shapes in an inline SVG; a path's `d` is reverted by the reset.
- **Do** put any new floating layer in a native popover so it reaches the top layer.
- **Do** prefix every class with `sce-`, inject styles once per container, and release them on destroy.

### Don't:

- **Don't** state a brand: no fixed brand colour, no bundled font, no logo.
- **Don't** hard-code `px` or `rem` font sizes, or a font family other than through `--sce-font-family`.
- **Don't** add shadows at rest. A shadow marks a floating thing.
- **Don't** add decoration or motion, and don't tint a selection or the insertion point with the accent: they are the text colour, so shape and weight carry them.
- **Don't** hold the zoom, or anything else that changes while the user zooms or scrolls, in an inherited custom property on the root.
- **Don't** rely on a host's cascade. Style isolation is a constraint on all future work: the root resets everything (`all: initial`), descendants revert (`all: revert`) under a doubled `.sce-root.sce-root` selector so a host rule such as `.page div` does not reach in, and component rules are written under `.sce-root`. Notes are the one exception: they reset only the few properties they need by hand, because reverting every note made first render about three times slower. A new note-like element that is created in the thousands must follow the notes, not the rest.
- **Don't** publish or depend on `--sce-_*` variables outside the stylesheet.
- **Don't** import styles as a CSS file or leave anything behind: the stylesheet is a string, delivered as a constructed stylesheet (a style element only where that is unavailable, since a strict style policy blocks injected style elements) into the document or the host's shadow root, and removed with the last editor.
- **Don't** count on isolation against ID selectors or `!important` rules in the host's page when the editor sits in the page itself: they reach in. A host with such rules mounts the editor inside a shadow root.
