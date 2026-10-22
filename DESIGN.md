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
  playhead:
    width: "1px"
  synth-caption:
    max-width: "12em"
---

# Design System: Score Editor

## Overview

**Creative North Star: "The Borrowed Instrument Panel"**

The editor has no brand. It is a tool panel that takes on the look of whatever host app embeds it. The package owns structure, interaction and legibility; the host owns colour and type. Everything stated below about colour and type is therefore a contract for hosts first, and a set of neutral fallbacks second.

It is an Operate surface: an arrangement view for people who generated a song and want to see how it is built before changing it, and who can now change the first thing: select one note or several, turn them into rests, take that back. DAW conventions are the reference: a pitch column at the left, a bar ruler on top with section bands, key and meter marks and a chord track under it, one piano-roll track per voice, a hairline grid with heavier bar lines, black-key rows shaded, zoom on the time axis. Touch and keyboard are first-class: the view scrolls with a finger, the arrow keys and the wheel, and zooms with buttons, a menu, the plus and minus keys and control plus the wheel; a tap selects, and the keys edit. The interface is dense on a fine pointer and roomier on a coarse one.

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

**Private variables.** The `--sce-_*` names (`--sce-_bg`, `--sce-_text`, `--sce-_surface`, `--sce-_muted`, `--sce-_line`, `--sce-_line-strong`, `--sce-_accent`, `--sce-_note`, `--sce-_radius`, `--sce-_row`, `--sce-_beat`, `--sce-_keys`, `--sce-_shade`, and the row heights `--sce-_ruler`, `--sce-_band`, `--sce-_chords` and their sum `--sce-_top`, and `--sce-_head-top`, where the editor's track heads pin) are aliases that resolve the public variable or its default. They are not public: hosts must not set them and new work must not document them as an API. Per-instance layout values (`--sce-ticks`, the length of the score in ticks, on the canvas; `--sce-rows`, the pitch rows of a lane) and per-item values (`--t` start, `--d` or `--w` length, `--r` row and, for the selection box, `--h` height, all in ticks or rows) are set by the editor itself.

### Neutral defaults

- **Ground** (#ffffff light, #1b1c1f dark): the roll and the button ground.
- **Ink** (#18181b light, #ececee dark): text.
- **Cool accent** (#2457d6 light, #7da3ff dark): focus and checked state; also the note fill unless a note colour is mapped.

Derived values used by the build: black-key row shading and the tint of every second section band are 5% of text over transparent; a hovered button is 6% of text over bg and an expanded one 10%; a hovered menu item is 8% of text; a note's border is 30% of text mixed into the note colour; the selection box's wash is 8% of text over transparent, and the tint of a lane while a box is armed or open is 6%.

### Named Rules

**The Borrowed Colour Rule.** The package never names a colour outside the variable contract and its neutral defaults. A new surface takes its colour from an existing variable or a derivation from bg and text. One exception, for the selection box only: where the system forces its colours (`forced-colors: active`) the page's own colours are replaced, so the box is outlined in the system keyword `CanvasText`, the colour the user agent gives text, which is not one the package picks.

**The One Accent Rule.** Accent marks focus and the checked menu dot; the note colour defaults to the same value. Nothing else is tinted: the playhead of the synth preview is the text colour, like the insertion point.

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

Structure from top to bottom: toolbar strip (minimum 40px; title, zoom group, history group, Delete, Select, spacer, read-only badge), the cut sentence when the score is cut, the header block, then the tracks (`Vocal`, then `Ins` when present). The root fills its parent (`height: 100%`, minimum 288px) and clips overflow; the host decides the size.

**The time axis.** Zooming sets the width of the elements that carry the axis (the canvas, the four header timelines, the lanes), by writing `calc(var(--sce-ticks) * var(--sce-_beat) * <zoom> / 256)` as their width. Everything placed on the axis (notes, bar numbers, chords, flags, bands, the cut, the grid) is positioned in percent of its axis element from its start and length in ticks. Do not hold the zoom in an inherited custom property: a variable that changes on the root restyles every note (about 70 ms per step at 1500 notes, against about 3 ms for widths). The zoom steps are 10%, 25%, 50%, 100%, 150%, 200% and 400% (1% to 400% reachable with the control wheel), and "Fit whole song" fits the score to the width shown.

The opening view is scrolled to the middle of the first voice's notes in pitch and to the first bar in time.

Density follows pointer type, not viewport width. A fine pointer gets the compact set; a coarse pointer (`pointer: coarse`) gets the larger one:

| Element | Fine pointer | Coarse pointer |
| --- | --- | --- |
| Row height and note height | 14px | 24px |
| Toolbar button minimum height, and the width and height of an icon button | 28px | 36px |
| Menu item minimum height | 30px | 40px |

A host that maps `--sce-row-height` overrides both. Header rows at the default text size are 24px (ruler), 22px (sections), 22px (marks) and 26px (chords); track heads are 22px. Spacing is a small set used as seen: 8px gaps in the toolbar, 12px toolbar side padding, 10px button side padding, 5px before the text of a flag or chord.

Touch behaviour: the scroller takes one finger for panning in both directions and leaves the page's own pinch (`touch-action: pan-x pan-y pinch-zoom`). A pinch does not zoom the time axis; the buttons and the menu do. A press that ends within 6px of where it began is a tap and selects; a press that moves farther is a swipe, and the browser keeps it as a scroll. The one exception is a finger that has rested on empty lane space for 0.4 s first, which draws a selection box (see Selecting several notes); the lane's `touch-action` is never changed, because the browser fixes it when the finger goes down.

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

The arrangement is built from view parts bound to one editing session: the toolbar, the zoom control, the cut notice, the problem view, the time ruler, the chord track, one voice track for each voice and the synth preview control. Three views share the editor's frame: the arrangement, the staff view and the text view, chosen by the view switch, with the stale notice above the two that draw the project. The staff view, the text view, the stale notice and the view switch are parts of their own too. A host can mount any of them on its own element; the default editor mounts all of them in the layout described above. Every part's root carries the same context as the editor's root (the theme variables, the reset, the text size) and is a stacking context of its own, so a part is styled and isolated alike wherever it stands; the decisions are in [the spike](docs/spike.md). The root is a `div.sce-root.sce-part`. Inside the default editor it draws no box (`display: contents`), so the layout above is the layout of the parts; mounted alone it is a block as wide as its element.

- **The time axis.** The ruler, the chord track and a voice track share the session's zoom and horizontal scroll. Zoom writes the same width formula as above on every part in one pass, and only then scrolls them, so the document lays out once. Mounted alone, each of the three is its own horizontal scroll surface (`overflow-x: auto`) whose scroll offset the session sets and whose user scrolling the session takes back, so parts of different widths scroll together and each stops at its own end without pulling the others back. The ruler and the chord track hide their scrollbar; a track shows it. A part that draws is a focusable region with a name, so Tab reaches it. Each of the three also keeps one polite live region (see Announcements) that survives every redraw. Zoom actions (the menu, the steps, "Fit whole song") measure the first part on the axis; control plus the wheel and the plus and minus keys measure the part that received them. The default editor puts all of its parts in one scroller and gives it to each as the `scroller` option, so none of them is a scroll surface there.
- **Pinning.** The default editor pins its header block, which holds the ruler and the chord track, above the tracks, and its track heads pin under that block.

### Toolbar

A view part of its own (`mountToolbar`); in the default editor it is the first row and draws no box of its own. Surface-tone strip, minimum 40px high, 1px line under it. Title at the start in 600 weight, the zoom group (minus button, zoom value button with a chevron, plus button), the history group (undo and redo), the Delete button and the Select button while the session is editable, a flexible spacer, and at the end the read-only badge while it is not. In the default editor the row ends with the view switch (the `viewSwitch` option of `mountToolbar`), after the read-only badge, and the title names the shown view ("Arrangement", "Staff", "Score text"). The zoom group, the Delete button and the Select button mean something only on the arrangement, so they are hidden while another view is shown; undo and redo stay, since the text view's steps are on the same history. A toolbar that holds the synth preview control or the view switch wraps where its controls do not fit; one that holds neither has the title give way (it is cut with an ellipsis) and, when the controls still do not fit, scrolls sideways (`overflow-x: auto`, scrollbar hidden). The wrapping is one rule for both controls: a control moves to a later row before the title gets narrower than its own text (the title counts at the width of its text when the row is broken into lines), the preview control and its caption take a row of their own (see Synth preview), and the read-only badge and the switch move together to a line of their own, right-aligned, so every control is in sight at 320px. A title that does not fit even on a row of its own is cut with an ellipsis; the element keeps the whole name as its text, and as its tooltip. Either way every control can be reached by finger or by Tab down to a 190px box, and no control is squeezed below its size (the icon buttons keep 28px, 36px on touch) to make room. The history group, the Delete button and the Select button are hidden with the editing, and with the view when it is not shown (an unreadable score, no dialect). The screen-reader hint is the one sentence a view's `aria-describedby` points to; it is in the toolbar part, drawn only when the host gives it an id, and names the editing keys only while the session is editable. The synth preview control comes after the badge, unless the host turns it off with `synthPreview: false` (see Synth preview); where the row ends with the view switch, the control comes before the badge and the switch, so the switch stays the last item.

### Undo, redo and Delete

Two square icon buttons in a group named "History", after the zoom group: the same ground fill, 1px strong line and 4px radius as the zoom steps, 28px (36px coarse), with a 16px arrow that turns back on itself in a 1.5px stroke (redo is the same drawing mirrored). The arrows are polylines in an inline SVG styled from the stylesheet, so no font and no glyph is involved; a path would not do, because the reset reverts the `d` property of a path. Each has an accessible name ("Undo", "Redo") and a tooltip that also names its keys ("Undo (Ctrl/Cmd+Z)", "Redo (Ctrl/Cmd+Shift+Z)"). A button with nothing to do is `aria-disabled` and muted, as a zoom step at its end is, and does nothing when pressed. The keys are Ctrl or Cmd plus Z (undo), Ctrl or Cmd plus Shift plus Z and Ctrl plus Y (redo), and work with the focus anywhere inside the part that hears them.

Delete is a third square icon button of the same kind, after the history group, with a bin drawn in the same 1.5px polylines (a lid with its handle, then the body). It is the pointer and touch path to what the Delete key does, since a phone has no key and double tap is a later gesture: it turns every selected pitched note into a rest as one history step. Its name is "Delete" and its tooltip "Delete (Del/Backspace)". It is `aria-disabled` and muted, like a history button with nothing to do, until a pitched note is selected, and a forced press then does nothing; after a delete the selection holds only rests, so it mutes again, and undo brings the note back selected and the button with it. It has no colour of its own: the action can be undone, so it is not drawn as a danger. When the score refuses the edit, the toolbar's live region says why and where.

### Select menu

One text button after the Delete button, labelled "Select" ("选择"), with the chevron of the zoom value button, and a native popover menu under it (the zoom menu's mechanics, shared in `popover-menu.ts`: top layer, Arrow keys, Home and End walk the items, Escape closes and returns the focus to the button) holding three items: "Select all", "Invert selection" and "Clear selection". It is the pointer and touch path to Ctrl or Cmd plus A, Ctrl or Cmd plus Shift plus A and Escape, because a phone has no keys, and each item's tooltip names its key. Choosing an item closes the menu and then does what the key does, through `handleEditingInput`. An item with nothing to do is `aria-disabled` and muted, as a history button is, and a forced press does nothing: Select all and Invert when the score has no pitched note, Clear when the selection is empty. The button has the same ground fill, 1px strong line, 4px radius and height as its neighbours (28px, 36px coarse) with 8px of side padding, and it is hidden with the other editing controls, and with the arrangement when the staff or the text is shown, since only the arrangement has notes to select. It announces nothing itself: the voice tracks say "Selected N notes".

Why one menu and not three icon buttons: three pictograms that a person must tell apart, with no word on them, in a row that already overflows a 412px phone, against one named button that a translation covers and that has room for a later entry. Logic Pro for iPad offers Select All and Invert Selection from a menu in the same way (cited under Selecting several notes). The cost, accepted: select all takes two taps. The button also takes room from the title, which gives way first: in the default editor at 412px the title is cut to about 25px in English and 33px in Chinese (measured in Chromium).

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

A selected note is framed by a 2px border in the text colour in place of its 1px border, with the fill unchanged; the frame sits inside the box, so nothing moves and no neighbour shifts. A tied chain is selected as a whole, since Delete takes the whole chain: the sides where its segments join keep no border, so the frame runs round the chain as one bar. A selected note's label ends with ", selected" ("，已选中" in Chinese). Shape and weight say the state, not hue, so it reads in any host palette. Measured with the neutral defaults, the frame is 14:1 or more against the lane and 2.9:1 (light) or 2.1:1 (dark) against the default note fill, so the outer edge carries the state; a host that maps a note colour close to its text colour is left with the 2px weight alone. While the session is editable the browser's own tap highlight is turned off, since the frame answers a tap. Only a pitched note is selectable: a click or tap on a note selects only it, a click or tap on empty lane space clears the selection. A note shows the pointer cursor only while the session is editable. Selecting several notes is the next section.

### Selecting by keyboard

Notes are reached the way an option is reached in a listbox (the roving tabindex of the WAI-ARIA authoring practices): exactly one note of a voice track is in the tab order, the selected note or else the first, so Tab enters the notes in one step and the next Tab leaves them. Moving from note to note follows a score editor, not a pointer: with a note in focus, Left and Right step to the previous and next note of the voice and select it, Home and End go to the first and last, and Enter or Space select the note in focus (the way in when Tab has just arrived, because arriving does not select). Selection follows the stepping so that the ring and the frame are always on one note and Delete never acts on a note other than the one the eye is on; it costs nothing here, since selecting does no work that a slow step would repeat. A tied chain steps segment by segment and is framed whole, as it is when clicked. The stepping stays quiet in the live region, because the focus already speaks the note it lands on; Enter and Space say what they selected.

The keys belong to the notes only while a note has the focus. With the focus anywhere else in a part, Left, Right, Home and End still move the insertion point or scroll as before, whatever is selected. A key with a modifier is taken by the notes only in the two forms of the paragraph "A subset from the keyboard" below (Ctrl or Cmd with the four stepping keys, Shift with Enter or Space). Any other is left alone: Alt with any key, Ctrl or Cmd together with Shift, Ctrl or Cmd with Enter or Space, and Shift with an arrow, Home or End. Shift with the arrows is kept for the editing keys the spec plans (octave and length, stories 26 and 27), and Ctrl or Cmd with A and Escape belong to selecting. A click or tap puts the focus on the note it selects, so the keys go on from there; it is the browser that moves the focus for a tap, because a focus moved by script before it would count as keyboard focus and draw the ring. A note the keys step onto is scrolled out from under the pinned header, the track head and the pitch column (`scroll-padding` on the scroller, with 4px for the ring), not left half hidden where Delete would act on a note the eye cannot see; the left edge of the ring of a note at the very start still goes under the pitch column. A redraw that removes the note in focus (a delete, a language change) gives the focus to the same note if it is still drawn, else to the next and then the previous note, else to the track, so the history keys keep working; a note that has the focus keeps the tab stop when the selection is changed from elsewhere. Notes are focusable only while the session is editable.

The notes keep the role of list items. A focusable list item is not the pattern an assistive technology expects of a selectable option (a listbox with `aria-selected`), and the label ending in ", selected" does the work of that state. The move to a listbox is deferred; the reason is under Roles in the next section.

### Selecting several notes

The selection frame does not change; a selection of many notes is many framed notes, with no counter and no control added. Three things are added to the lane: a box, a preview and a cue.

**Gestures.**

| Input | Mouse and pen | Touch |
| --- | --- | --- |
| Click or tap a note | Selects only it. | Same. |
| Shift held on a click or tap on a note | Adds it, or takes it out when it is selected, with its whole tie chain. | Shift on a keyboard attached to the screen does the same; without one, rest a finger on the note for 0.4 s. |
| Press on empty lane and move more than 6px | Draws a box; Shift at the press adds to the selection. | Rest a finger on empty lane for 0.4 s, then slide: the box is drawn. A swipe that starts at once still scrolls. |
| Click or tap empty lane | Clears the selection and drops the insertion point, as before. | Same. |
| Shift on empty lane | Nothing: an aimed click that misses must not cost the selection. | n/a |
| Let go of the box | Selects the pitched notes it touches (a tie chain whole); a box over no note clears the selection, and with Shift leaves it. | Same. |
| Escape while the box is open, `pointercancel`, the page losing the focus, the editor turning read-only, a second finger | The box is given up and nothing changes. | Same. |

A box is hit-tested in ticks and rows, not per note rectangle, so it costs one pass over the voice's notes at any size; it is kept inside the lane, and its corner stays on the same bars and pitches when the track scrolls under a pointer that stays still (the wheel during a mouse box). A press that starts on a note never draws a box: it is a click, or a drag that does nothing, as before. A hold that has toggled a note is not the start of a move: moving notes is planned and will need a gesture of its own.

**The box.** A 1px dashed outline in the text colour over an 8% wash of it, above the notes (`z-index: 3`), taking no pointer and hidden from assistive technology. Dashed says "not chosen yet", and the committed state is the solid 2px frame the notes already have, so the pair reads by shape and weight and in any host palette. While the box is open the notes it touches already wear the selected frame (`data-boxed`, the same look as `data-selected`, a tie chain included), so the result is seen before it is committed; their accessible names change only on release, so nothing is announced per move. A finger that rests on empty lane has no box yet and covers the place it rests on, so the moment the hold is recognised (0.4 s) the box exists as a marker: a 56px dashed square, larger than a fingertip, centred on the finger (`data-anchor`), and the device buzzes for 10ms where `navigator.vibrate` exists and the page has been touched before (the browsers insist on that). The first slide turns the marker into the box. The lane is also tinted by 6% of the text colour while a hold is armed or a box is open (`data-boxing` on the lane), so the state is seen away from the hand; that tint alone, at 4%, measured about 1.1:1 against the lane and was too quiet to be the cue, which is why the marker carries it. Where the system forces its colours (`forced-colors: active`) the box is a 2px dashed `CanvasText` outline with no wash. There is no motion and no shadow.

**Why a hold, and not a mode or a second finger.** The rule above is that a swipe on empty space scrolls, and the lane's `touch-action` is `pan-x pan-y pinch-zoom`, which the browser fixes at touch start (W3C Pointer Events, `touch-action`), so no later movement can turn a started scroll into a drag. Touch-and-hold is the gesture touch editors use for this: Apple's Logic Pro for iPad User Guide, "Select notes in the Piano Roll Editor" (https://support.apple.com/guide/logicpro-ipad/select-notes-lpip83b30b30/ipados: touch and hold the working area next to the first note and drag across the notes; a Select mode that taps notes in and out, which holding the Shift key of an external keyboard gives momentarily; Select All and Invert Selection from a menu) and the Material Design 1 Selection pattern (https://m1.material.io/patterns/selection.html: the selection gesture is a long press held in place for a moment, and to select several items one long presses and drags). A toolbar mode toggle was left out: it needs a state shared between the toolbar and the track (`ViewState` has a fixed shape that existing tests pin), another control on a row that already scrolls sideways on a narrow host, and it makes a swipe on empty space mean two things. The mechanism was tried before it was built: in Chromium, driven by CDP touch events (a throwaway probe, not kept in the repo), a finger that rests and then moves is cancelled by the browser and scrolled (`pointercancel`), unless a non-passive `touchmove` listener that exists from the start cancels the move once the hold has armed the box; with one, the pointer events go on to `pointerup`, and a quick swipe still scrolls. The listener is on the voice track's root and calls `preventDefault` only while a hold has armed or a box is open. WebKit and Gecko were not run. A hold that is lifted without sliding does nothing (it is not a tap), so a hesitating user cannot lose the selection; the browser's own menu on a long press is suppressed while a hold is pending. A resting thumb may drift 10px before the hold is lost (a mouse press 6px); a hold arms nothing once the editor is read-only or the lane was redrawn meanwhile.

**Keys.** Ctrl or Cmd plus A selects every pitched note, Ctrl or Cmd plus Shift plus A selects the ones that are not selected and lets go of those that are, Escape clears the selection. Collision check against what exists: Delete and Backspace, Ctrl or Cmd plus Z, plus Shift plus Z, Ctrl plus Y, the plus and minus zoom keys and Ctrl plus the wheel, Left, Right, Home, End, Enter and Space (notes, insertion point); none uses A or Escape, and a key with Alt is left alone. Escape is handled whenever the selection is not empty, whatever its ids name (after a Delete they name rests, and Escape must still clear them), so a host's own use of Escape (closing a panel) keeps working while the selection is empty; while a box is open Escape belongs to the box, in the capture phase of the document or shadow root, because the focus may be on the scroller above the track. While the focus is inside the editor the keys are kept from the browser, so the page's select all does not run (checked in Chromium: outside the editor Ctrl+A selects the host's text, inside it selects notes and no text). Ctrl or Cmd plus Shift plus A is the browser's own tab search or add-ons shortcut in some browsers, and a page may not be allowed to take a reserved shortcut: this was not checked in a headed browser. The Select menu is the way for a finger, and for a person whose browser keeps the key; a host may also send `invert-selection` to `handleEditingInput` from a control of its own.

**A subset from the keyboard.** With a note in focus, Ctrl or Cmd plus Left, Right, Home or End move the focus as the plain keys do and leave the selection as it is, and Shift plus Space or Shift plus Enter adds the note in focus to the selection or, when it is selected, takes it out with its whole tie chain, as Shift-click does; plain Space and Enter still select only that note. Sources: the WAI-ARIA Authoring Practices listbox pattern (https://www.w3.org/WAI/ARIA/apg/patterns/listbox/), in its model for a multi-select list that needs modifier keys, moves the focus with Control plus the arrows "without changing its selection state" and changes the state of the focused option with Control plus Space; its Shift plus the arrows toggle as they move. Both differ here for a reason. Shift plus the arrows are taken by the planned editing keys (octave and length). Ctrl plus Space and Cmd plus Space are not usable on macOS, where Command-Space shows or hides Spotlight and Control-Space selects the previous input source (Apple, "Mac keyboard shortcuts", https://support.apple.com/en-us/102650), so the toggle is Shift plus Space, with Shift plus Enter beside it for the key that already selects. Collision check against what exists and what is planned: plain Left, Right, Home, End, Enter and Space (notes), Delete, Backspace, Ctrl or Cmd plus Z, plus Shift plus Z, Ctrl plus Y, the zoom keys, Ctrl or Cmd plus A, plus Shift plus A, Escape, and the plain and Shift arrows of stories 26 and 27: none uses Ctrl or Cmd with an arrow, or Shift with Space or Enter. A key the browser reserves was not checked: Cmd plus Left and Right is history back and forward in some browsers on macOS, and this was not run on a Mac; where it is taken, plain Space selects one note and the box and the Select menu build the rest.

**What stays selected.** The selection is note ids, and a note that becomes a rest keeps its id: after Delete the ids stay selected (as rests, which are drawn as nothing and left out by select all), and an undo brings the notes back framed. Delete takes every selected pitched note as one command, one history step, with one write and one check; if the score would refuse any of it, nothing changes and the selection stays. One check on the whole result cannot say which note caused a refusal, so a diagnostic with no place of its own is located at the first note the command names, which for Delete is the first selected note in score order.

**Read-only.** Every gesture and key above is gated on `view.editable`, like the rest of editing, so a read-only track has no box, no toggle and no selection key. `session.select(ids)` is left open on purpose: a host's own panel that selects notes by a filter and stays usable while the editor is read-only selects through the session, and the track draws no frame for it while read-only, as in 08b; it comes back when the editor is editable again.

**Announcements.** The live region of a voice track says "Selected 5 notes" after a box, a toggle, a select all or an invert, through the announcement that already followed the selection; a box that is open, a cancel and a clear say nothing (a clear is announced by the notes' own names).

**Roles.** The notes keep the role of list items, named "..., selected". The listbox with `aria-multiselectable`, which several selected notes would make the right pattern, is deferred and not done here: the existing tests pin the list and list item roles and must stay unchanged, so the move waits for a change that brings its own tests. This is the one place the deferral is said.

**Screen reader and keys.** The hint that the scroller is described by (`hintEditing`, English and Chinese) names the new gestures and keys in one added passage. The passage covers the box, the hold, Ctrl and A, Escape, and the keys of a subset. A keyboard user can select all, invert and clear, reach one note at a time, and build any subset with the keys above.

**Known gaps.** No auto-scroll while a box is dragged to the edge of the view (the wheel scrolls during a mouse box, and "Fit whole song" shows everything for a touch box). A replacing box does not show the old frames going away until it is let go (a box, like a click, replaces; Shift adds). No visible count of the selected notes: a sighted user sees which notes are framed but not how many, or the ones off screen, where a screen reader hears "Selected N notes" per voice; a count beside the Delete button is the likely answer and belongs with the toolbar. Clearing, giving a box up and the selection falling to zero are silent in the live region. A sixteenth note at 100% zoom is about 10px wide, so a hold meant for it can land beside it and arm a box instead; the 56px marker makes that visible, and a larger coarse-pointer hit area would change how a tap on a note behaves, which this change leaves alone. One finger only: a second finger gives the box up. Chromium only: touch was driven by synthesized CDP touch events in an emulated phone, not on a device, and Safari and Firefox were not run.

### Insertion point

A 2px line in the text colour through the whole height of every voice lane, with a flag at its top: a 10px wide, 5px tall triangle drawn with borders, so it costs no node beyond the line. It is heavier and darker than the 1px muted bar lines and sits on the nearest beat line of the bar's own meter, until the shared grid replaces that step. The flag sticks just under the pinned track head, so it stays in view when the lane is scrolled past its top. At the start and the end of the lane the line is kept whole inside it, where the pitch column and the focus ring would otherwise cover half of it; the flag at the start is then half under the pitch column. It ignores the pointer, has no hover and no motion, and is drawn only while the session is editable. It is named for screen readers as a separator ("Insertion point, bar 1 beat 3" or "Insertion point, end of the score").

### Note

A block exactly one row high, filled with the note colour, with a border mixed 30% toward the text colour. Width is its duration less a 1px gap, with a 2px minimum. Rests are not drawn: a rest is the gap between blocks. A note tied to the next note of the same pitch loses its gap, its right border and its right corners, and the next note loses its left border and corners, so a tie reads as one connected bar. A note is a list item labelled "C4, bar 1 beat 1, length 1 beat" (with ", tied to the next note" when it is), in the host language, in a list named for its voice.

### The cut

When the text of a voice stops before the song does, three things say so: a strip of one sentence above the view, led by a small swatch of the hatch so the sentence and the texture read as one ("This score is cut off: bar 232 of Ins is incomplete." or "...after bar 5 of Vocal."), a flag in the marks row at the bar where it stops ("Incomplete bar" when the bar is unfinished, "Cut off" when the text stops at a bar line, which puts the flag at the end of the score), and in that voice's lane a hatched tail with a dashed left edge from where its last note ends to the end of the score. The hatch is 1px diagonal lines in the strong line colour at 7px (the swatch is 1.1em square with a dashed border); the strip is a note landmark. None of it uses a new colour.

### Problem view

When the score cannot be read, the view is replaced by an alert panel: one sentence in 600 weight ("This score can't be shown because it can't be read."), then the dialect's diagnostics as a list in the interface language ("The duration "5" is not allowed. (bar 1, line 10)"), at most 20 and then "and N more". A model with no dialect gets one sentence naming it. The toolbar keeps its title and loses the zoom group.

### View switch

Three square icon buttons in a group named "View", joined: they share their borders (a 1px overlap) and only the outer corners keep the radius. The buttons are 28px (36px on a coarse pointer) like the history buttons. Each has an accessible name and tooltip ("Arrangement", "Staff", "Score text") and `aria-pressed`; the shown one is filled with 12% of the text colour over the ground, has a text-colour border and draws its icon at 2px (the staff's five lines are the exception: they are 1px, and 1.5px when pressed, since five lines at 2px would merge into one block), so the state is carried by fill and weight and never by hue. The icons are polylines in an inline SVG, as the history arrows are: short bars at different starts for the tracks, five full-width lines at 1px for the staff, three left-aligned lines for the text. They work in a read-only session, since they change what is shown and not the score. The group follows a view that anything else sets (`session.setActiveView`), and the session's language.

### Text view

The score text in a plain `textarea`, with a gutter of line numbers on its left that scrolls with it, in the monospace face of `--sce-font-family-mono` (16px on a coarse pointer, since a phone zooms the page when a smaller box is focused). Under the box, one status sentence in the interface language ("No problems", "3 problems", and while the project keeps an older score, "1 problem. The other views still show the last readable score."), and when there are problems, a list of them: each is the diagnostic's sentence with its bar and line ("The duration “5” is not allowed. (bar 1, line 10)"), at most 20 and then "and N more", and it is a button that selects that line in the box and scrolls it into view. A line with a problem is marked in the gutter by a dot and a bold number as well as by colour, and an item of the list is underlined when it is pointed at or focused. The line numbers are lining, tabular numerals. The box and the items of the problem list draw the 2px accent focus ring inside their edge, not outside it with the 2px offset: the box and the list scroll, so an outside ring would be cut off. The box is `aria-invalid` while its text cannot be read.

**Live parse and check; one undo step for a burst.** Text is checked when typing pauses for 600 ms and when the box loses the focus, whichever comes first (`session.checkScoreText`, the same path `replaceScoreText` takes, so what the status says is what the command would do). Text that reads is dispatched as one `replaceScoreText` command, one history step, and the project holds the text as the dialect writes it. A notice is not a refusal (`isNoticeDiagnostic`): text that reads but comes back with one, such as the chords of a melody project (`melody-with-chords`), is taken as well and stays in the box, and the notice is said under the status sentence, apart from the problems: a plain sentence in the text colour with a 3px accent bar at its start, a `note` landmark that is also described by the box, with no list and no button, since a notice has no line to go to. While the box holds text that was not taken, the problems are what is said and the notice steps aside; it comes back when the box holds the project's text again, and it goes when the project changes from elsewhere, since it was said of the replacement that this view made. Text that does not read is dispatched nowhere: it stays in the box exactly as typed, the session is told (`setRejectedText`) and the project keeps the last readable score.

Why a pause and not every key, and not only on blur: a step for every keystroke would make undo a character at a time and fill the history with the half-typed texts that cannot be read; a step only on blur would keep a reader's edits from reaching the arrangement and the staff while they are still in the box, which is the point of a live view. A 600 ms pause is the length of a thought between two words, so one burst of typing, one phrase, is one step, and the other views follow within a second. Leaving the box, and so any click on the toolbar's Undo, commits first, so Undo pressed right after typing undoes that typing. Inside the box, Ctrl or Cmd plus Z is the browser's own (the editing keys skip text controls), which undoes keystrokes of the box; the toolbar's Undo and Redo are the project's steps. A dispatch that leaves the project as it was adds no step.

The box is read-only while the session is, or when the model has no dialect (with a sentence that says so). Text it holds but did not hand over is given up when the session turns read-only, since nothing may be handed over then. When the project changes from elsewhere (an undo, `replaceProject`), the box shows the project's score again and the rejected text is dropped.

### Stale notice

One sentence above the arrangement and the staff, shown only while the text view holds text that cannot be read: "The score text has a problem, so this view still shows the last score that could be read. Fix it in the text view." It is a note landmark like the cut notice, with a 3px text-colour edge at its start in place of the hatch swatch. The arrangement and the staff keep drawing the last score that read; the notice is what tells the reader that they are behind the text. It is not drawn for a project that came with an unreadable score, where the problem view says that already.

### Staff view

The project's score on a staff, drawn by abcjs 6.7.1 (the newest release published at least 7 days before it was added) into a scrolling region of its own: focusable and named, so Tab reaches it and the arrow keys scroll it; 12px of padding; the scrollbar's room is kept so the drawing's width does not change when it appears. The drawing is as wide as the region and is drawn again, with the abcjs line breaking told that width, when the region's width changes. It is read-only: a click or tap on it changes nothing. A score that cannot be read is not drawn, and the problem view above explains it. The drawing is never narrower than 240px, so in a box narrower than that and the region's padding the region scrolls sideways (the arrow keys move it) and the page does not (checked at 260px and 240px).

abcjs is loaded with `import()` when the staff view is mounted, and the default editor mounts it the first time the staff is shown: the package entries import no abcjs (a test imports both in a process that fails when abcjs is loaded), and a host that never shows the staff never fetches it. Until it arrives the part says "Loading the staff…"; if it cannot be loaded it says the staff could not be drawn and that the other views still work.

**How abcjs is isolated (the result of the check).** abcjs draws an SVG with its own presentation attributes and expects a page without rules for `svg`, `text` or `path`, and it measures text through a dummy SVG it puts in the document. The check was run in Chromium, in the default editor and with the part alone, in the light DOM, in a host's shadow root, with hostile page rules, and under a strict style policy:

- The drawing is made inside an open shadow root that the part attaches to an element of its own, inside the part's root. A host's rules for `svg`, `text`, `path` and `*`, even with `!important`, do not reach into it, with the editor in the page and with the editor in a host's shadow root (the nested shadow root is why). The reset of the package's own style sheet does not reach into it either, so the drawing carries a short sheet of its own (constructed where the browser has constructed sheets, a style element where it has not) that sets its box only. Nothing sets the colour: it is inherited across the shadow boundary, and abcjs draws in `currentColor`.
- The colour follows the part: the drawing takes the text colour of the part, so a dark scheme and a host's `--sce-color-text` apply with no variable of its own.
- A strict policy (`style-src 'self'`) refuses a style element that abcjs adds (the page sees `style-src-elem` violations, and none before the staff view is mounted) and the drawing is unchanged, since everything it needs is in attributes and in the sheet above.
- Global CSS: nothing is added to the page. The part adds no rule and no element to `document` or to the host's shadow root beyond its own node; after the drawing the page holds no svg and no style element of abcjs's, and once the layout is closed the page's markup is as it was. Of the `document` abcjs reads, only its dummy SVG for measuring text is used, and it is not left behind.
- What cannot be isolated, and is accepted: abcjs registers two `resize` listeners on `window` when it loads, which it offers no way to remove (the lifecycle test loads abcjs before taking its baseline of listeners for that reason), and it keeps a text-size cache of its own for the life of the page.
- `getBBox` needs a displayed box, so the part draws only when its region has a width: a staff view mounted in a hidden container waits until it is shown, and keeps what it drew before while it is hidden.

### Read-only badge

Pill, 1px strong line, muted text, label size, at the end of the toolbar. It appears only while the session is not editable, and takes the place of the history group. In that state nothing in the view offers an edit: no history or Delete button, no selection frame, no insertion point, no tab stop or pointer cursor on a note, nothing about editing said in the live regions, and Delete, the history keys, the note keys and the insertion point keys do nothing.

### Focus treatment

Interactive parts (buttons, menu items) get a 2px accent outline with 2px offset on keyboard focus, and so does a note reached by keyboard, outside the selection frame, so the ring (where the keys act) and the frame (what Delete takes) read as two things. A click or tap does not draw the ring. The scroller is focusable; because its own outline would be hidden behind the sticky header and pitch column, a 2px accent ring is drawn over the whole body instead.

### Announcements

What a screen reader cannot see in the drawing is said in words, in the session's language, by one polite live region (a visually hidden `role="status"` node) that each time-axis part and the toolbar keep for their whole life; a redraw never removes it, so a sentence is not lost with the content it follows. Which part speaks follows who owns the state: a voice track says which of its own notes were selected ("Selected D4, bar 1 beat 2", "Selected 3 notes") and that a delete took some of them ("Deleted D4, bar 1 beat 2"), and for an undo or redo what it brought back ("Restored D4, bar 1 beat 2") or took away, since the selection does not change with a history step; the track of the score's first voice also says where the insertion point moved ("Insertion point, bar 1 beat 3"), because the point is on the axis every track shares and one voice should say it once; a part that heard a refused edit says why and where, in the sentence the host's notice carries, and the toolbar does so for its Delete button. No part reads another part: each follows the session and the score alone. A part says nothing about editing while the session is read-only; the synth preview control is not an editing control, so what it says about the preview (that it started, stopped or could not start) is said in read-only mode too, because the person who pressed it has no other way to know. Stepping from note to note by keyboard is not announced, since the focus speaks the note it lands on. Keys pressed while the focus is on the scroller, outside every part, are heard by the frame, which keeps a region of its own for the refusals they cause and tells the host's notice as well.

### Motion

None. No transition or animation exists, so nothing needs a reduced-motion alternative. Zoom, scroll, selection and the insertion point change the view directly. The one thing that moves by itself is the playhead of the synth preview, and it is not an animation: it is a readout of where the sound is, set from the audio clock on every frame, with no transition or easing, and present only while the person has asked for sound. A reduced-motion setting therefore changes nothing about it.

### Synth preview

One button and a caption, in a view part of their own (`mountSynthPreview`) that the default toolbar also holds. In the toolbar they are the last items of the row, after the read-only badge, except that a toolbar with the view switch ends with the badge and the switch together, so the control comes before them. The badge keeps the place it had in a narrow host (it is still whole in a 320px box), and where the control does not fit beside the other controls it takes a second row of its own, at the start of the row. The button is built as the other buttons are, 28px high (36px coarse), the same ground fill, 1px strong line and 4px radius, with a 16px line icon in a 1.5px stroke, drawn as polylines (a right-pointing triangle to play, a square to stop), and the word beside it, "Preview" or "Stop" (试听, 停止), so a person who does not read a play triangle as music finds it. The word has a minimum width, so the caption does not move when the word changes. It takes the focus ring and the hover of any button; a press, Enter or Space toggles it, and a second press stops.

The caption is always there, not only while it plays: "Synthetic preview, not the final sound" (合成试听，不代表成品效果). It is muted text at label size, at most 12em wide so it takes two short lines and the control keeps one size; it breaks at its comma (`text-wrap: balance`; in Chinese `word-break: keep-all`), and is never cut or hidden. It is also the button's `aria-description`, so a screen reader says it with the button wherever the text is drawn. The button and the whole caption are in view at rest, with nothing to scroll to, in a 412px phone and in a 320px box, editable and read-only (seam 5 checks both), and they stay so while the preview plays. Starting the preview scrolls nothing: it never moves the host page.

The control is not an editing control, so it is there in read-only mode, and it is hidden only while the session has no readable score. In read-only mode it starts at the start of the score, not at an insertion point the session may still hold: a read-only view draws no insertion point, so a start there would begin where the visitor cannot see (the spec case "starts at the start whatever insertion point the session was left with, since a read-only view shows none"). Its states: stopped, playing, not supported (the browser has no Web Audio: `aria-disabled` and muted like a history button with nothing to do, the reason in its tooltip and, for good, in place of the caption, since a touch screen has no tooltip), and two that last a moment, "nothing to play from here" and "blocked by the browser, press Preview again": the sentence takes the caption's place in the text colour for four seconds, and then the caption is back. The same words are said by a polite live region, which is the toolbar's own when the toolbar holds the control and the part's own when it stands alone, in the session's language: where the preview starts ("Playing the preview from bar 1 beat 3"), that it stopped, and why it did not start.

### Playhead

A line through the whole height of every voice lane at the tick being played: 1px in the text colour with a 1px edge in the ground colour on each side, so it reads over a note as well as over the lane. It is told from the insertion point by shape, not colour: the insertion point is 2px with a flag, the playhead 1px with none, and both can be on screen at once. It is one node, hidden from assistive technology, ignores the pointer, and is the text colour like the insertion point and the selection frame, so no accent is spent on it. It is drawn from the tick the player publishes (see below), at a position in percent of the lane like everything on the time axis, and is removed when the preview stops or the position passes the end of the lane.

It follows the song by turning the page: when the line comes within a beat (48px) of the right edge of the view, the view scrolls so that the line is near the left, as a score is turned, not by scrolling continuously, which would move every note under the eye while the song is read. It scrolls the editor's own time axis (the session's `view.scrollLeft`), never the host page. When the preview starts, the start is brought into view first on that axis. If the user scrolls or zooms the line out of view, the view is theirs and is left alone until they bring the line back into it.

The position is read from the audio clock on every animation frame (the clock's time less the device's output latency, so the line is where the sound is, not where it was scheduled), so it has no transition or easing and never drifts from the sound. It is not kept in the session's `view`: that state is what parts share and notify on when the user changes it, and the playhead changes on every frame and is not the user's setting, so putting it there would notify every part sixty times a second and change what the state means. The player (`previewPlayer(session)`) is its one source; it has its own small subscription, and a voice track reads only the published tick. A view of a host's own subscribes to the same player.

### Autoplay, audio focus and what was verified

The synth preview is the one thing in the package that makes sound, so it has the browser's rules to follow. This section is the record of what was checked, on what, and how.

**The rule the code follows.** A browser lets a page start sound only after a user gesture. The player creates the page's audio context and calls `resume()` synchronously inside the click, tap or key handler that asks for the preview, before any `await`, and starts nothing if the context is not running after that (the control then says the browser did not allow sound and the next press works). All sound shares one audio context, which is suspended again about 0.3s after the last sound, so an idle editor holds no audio device. Nothing is started at load, at mount or from a timer.

**Verified directly, by tests kept in the repository.** `e2e/synth-preview.spec.ts`, on Chromium 156.0.8078.4 headless, driven by Playwright, in the desktop and the phone project (an emulated phone, not a phone). The spec runs without traces, because Playwright's trace recording gives the page a user activation, which would hide the blocked case.
- A preview started with no user gesture behind it (a click made by a script) ends as "blocked", says so and plays nothing; the next real press plays ("a sound the browser refuses to start, with no user gesture behind it, is said and does not play"). The console message of the browser for that case is "The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page."
- A page `<audio>` element that is already playing is not paused when the preview starts, and the two run side by side: the element's position goes on advancing, and the audio context is `running` ("a preview started while the page's audio plays leaves that audio playing, and both run"). That both are heard was not observed: a headless browser is muted, so there is no output to listen to.
- An `<audio>` or a `<video>` element in the document that starts to play while the preview plays stops the preview, and the page's own sound goes on ("an audio element in the document that starts …", "a video element in the document that starts …"). A detached `new Audio()` and an `<audio>` inside a shadow root do not: a capturing `play` listener on the document hears neither, so the preview plays on with them ("a detached audio element is not heard …", "a shadow audio element is not heard …").
- No network request: Playwright's request events, from before the editor is mounted (with the score given as text, so the page fetches nothing for it) through a preview of a melody, a second voice and a chord, and through a single-note preview, until the audio device is let go, show none, and every request of the page, load included, is to its own origin ("none leaves the page from before the editor is mounted to the stop …"). The same case checks that what sounds is what the score says: the pitches of the three kinds of sound.
- A browser with no Web Audio (`AudioContext` removed before the page's scripts run) gets a muted control with the reason, which says so when pressed and plays nothing ("a browser with no Web Audio gets a control that says so, and no preview").
- Escape stops the preview from wherever the focus is, and the key still reaches the window with its default not prevented, so a host's own Escape handler works ("Escape stops the preview …", "Escape is left to the host as well …").

**Verified directly, by throwaway probes that are not kept in the repository.** Same Chromium. A script that reads the browser's own API, so what it showed is a record here and cannot be rerun from the repository: a context created and resumed in a page that has had no gesture stays `suspended` and `new Audio().play()` is rejected with `NotAllowedError`; inside a click `resume()` resolves, the state is `running` and the clock advances (0.30s over a short wait); suspending the audio context leaves a playing `<audio>` element playing; and the `play` event reaches a capturing listener on the document for `<audio>` and `<video>` in the document and not for `new Audio()` or an element in a shadow root (the tests above now keep that last result).

**Verified only indirectly.**
- WebKit. Playwright's WebKit 27.2 for Windows was installed and run: it has neither `AudioContext` nor `webkitAudioContext`, and `<audio>` playback fails with `NotSupportedError`, so it can show the unsupported path and nothing about Web Audio autoplay, and it is not iOS Safari. What is known of Safari comes from MDN's autoplay guide, which says playback of audio that is started by a script before any user interaction is generally blocked, and that the Web Audio start rule is the same as for media; the code follows that rule by starting inside the gesture. MDN says nothing of Safari's own Web Audio rules, so that part rests on the practice of starting inside the gesture, not on a reading of Safari.
- Audio focus. The W3C Audio Session API (a working draft) gives an `AudioContext` the default session type "ambient", which "is mixable with other types of audio", and an `HTMLMediaElement` "playback", which should not mix with other playback audio and may pause other audio. The package does not set `navigator.audioSession.type`, so a browser that implements it treats the preview as ambient. Chromium 156 does not implement it (`navigator.audioSession` is `undefined`), so this is read from the specification and not observed.

**Not verified.** iOS Safari, macOS Safari and Firefox, on any device; Android audio focus; the system's silent switch on a phone; headed Chromium with real speakers (the headless browser is muted, so what was checked is that the audio clock runs and the nodes are made, not that the sound is right, which is not tested automatically); a host with its own audio player that holds an audio session of its own. A person with an iPhone should press Preview once on a page with its own audio playing and say what they hear.

**What the preview does about other sound.** It ignores it when it starts: it does not pause, duck or take over a host's audio, because that audio is the host's and an ambient, mixable sound is what the specification gives a context by default; and the evidence above is that the two go on side by side, neither paused (that they are heard together was not observed). It yields when another element starts: when an `<audio>` or `<video>` element in the page's document starts to play while the preview plays, the preview stops, because a media element is the stronger kind of audio in the specification ("playback" over "ambient"), a person who starts a track or a video did not mean the preview to go on over it, and a rough synthetic rendering is the one to give way. Escape also stops it, from wherever the focus is, so a person who hears it and has the focus in a lane does not have to find the toolbar again. The handler listens on the document, in the bubbling phase, and neither prevents the default nor stops the event, so a host's own Escape handler (a dialog it closes) still gets the key; a handler of the host's that stops the event below the document keeps it from the preview, which is then stopped by its button. A host whose audio is in a shadow root, an iframe or a detached `new Audio()` is not heard by the preview, and can call `previewPlayer(session).stop()` itself.

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
- **Do** keep a swipe on empty lane a scroll: a gesture that needs a drag there starts with a hold, and the lane's `touch-action` stays `pan-x pan-y pinch-zoom`.
- **Do** build an icon from polylines or other attribute-geometry shapes in an inline SVG; a path's `d` is reverted by the reset.
- **Do** put any new floating layer in a native popover so it reaches the top layer.
- **Do** prefix every class with `sce-`, inject styles once per container, and release them on destroy.
- **Do** start sound only inside a user gesture, say wherever it is offered that it is a synthetic preview, and stop it when its owner goes.

### Don't:

- **Don't** state a brand: no fixed brand colour, no bundled font, no logo.
- **Don't** hard-code `px` or `rem` font sizes, or a font family other than through `--sce-font-family`.
- **Don't** add shadows at rest. A shadow marks a floating thing.
- **Don't** add decoration or motion, and don't tint a selection or the insertion point with the accent: they are the text colour, so shape and weight carry them.
- **Don't** hold the zoom, or anything else that changes while the user zooms or scrolls, in an inherited custom property on the root.
- **Don't** rely on a host's cascade. Style isolation is a constraint on all future work: the root resets everything (`all: initial`), descendants revert (`all: revert`) under a doubled `.sce-root.sce-root` selector so a host rule such as `.page div` does not reach in, and component rules are written under `.sce-root`. Notes are the one exception: they reset only the few properties they need by hand, because reverting every note made first render about three times slower. A new note-like element that is created in the thousands must follow the notes, not the rest.
- **Don't** publish or depend on `--sce-_*` variables outside the stylesheet.
- **Don't** import styles as a CSS file or leave anything behind: the stylesheet is a string, delivered as a constructed stylesheet (a style element only where that is unavailable, since a strict style policy blocks injected style elements) into the document or the host's shadow root, and removed with the last editor.
- **Don't** draw the playhead with a transition, an accent or a flag, or keep its position in the session's view state; it is a readout of the audio clock.
- **Don't** count on isolation against ID selectors or `!important` rules in the host's page when the editor sits in the page itself: they reach in. A host with such rules mounts the editor inside a shadow root.
