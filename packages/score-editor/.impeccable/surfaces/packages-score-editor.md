---
version: 1
slug: "packages-score-editor"
primary_target: "packages/score-editor"
related_targets: []
---

# Surface brief: the read-only arrangement view

Scope and visitor mode: Operate. The editor's default view of a real `song2` score, read-only in this version: a time ruler, section bands, a key and meter marks row, a chord track pinned above the piano-roll tracks, then one piano-roll track per voice (`Vocal`, then `Ins` when the score has it). Verified at 1280 wide (mouse and keyboard) and 412 wide (touch). Lyrics track, selection and editing are later tickets.

Audience, job and constraints: people who generated a song and want to understand its structure before changing it, mostly not trained musicians (PRODUCT.md). Jobs, in order: see how long the song is and where its sections are; find a chord or a note by position; notice where the key or meter changes, and that a cut score ends early; zoom out to see the whole song and in to see a phrase; scroll in time and in pitch with mouse, keyboard or finger. Constraints from PRODUCT.md, DESIGN.md and the spec: no brand of its own; colour and type come from the host through `--sce-*` variables with neutral fallbacks; every class prefixed `sce-`; popovers in the top layer; pointer events only; a swipe on empty space scrolls; page pinch-zoom stays with the browser (it is how a low-vision user enlarges the page), so editor zoom is by button, menu, key and ctrl-wheel.

Assumptions (no human to confirm; mark and proceed):

- A1. The unnamed part before the first section marker is labelled "Unnamed" (zh 未命名); a section marker with no bars after it draws nothing.
- A2. The read-only badge keeps following `editable: false`; `editable: true` changes nothing yet because the whole version is read-only.
- A3. Key and meter marks show the state in force at the start too (bar 1), as a DAW's global tracks do, so every score has a first mark and a change is a second one.
- A4. A cut that stops inside a bar is marked at that bar and hatched from the last finished note to the end of the score in the cut voice; a cut at a bar edge is marked at the end of that voice. A one-line strip under the toolbar says what it means, in the interface language.
- A5. Zoom is a menu of presets plus "fit the whole song", with minus and plus buttons stepping through the presets. The menu is the native popover the spike settled.

Chosen direction: the world is pinned by PRODUCT.md (no identity of its own), so the choices are structure and density only. Reference: the arrangement window of a DAW (Ableton Live's Arrangement view, Logic's global tracks) in the editor's neutral defaults. Nothing decorative is added; the one authored move is the cut, and every mark says in words what it is.

## Direction contract

THESIS: An arrangement view that lets a non-musician read a whole song's structure at a glance: where the sections are, which chord sits where, where the key or meter changes, and that a cut score stops early. It refuses the silent piano roll where the only structure is a grid.
OWN-WORLD: Neutral defaults only: a ground that follows the host's `color-scheme`, one cool accent kept for focus and checked state, hairlines with bar lines heavier than beat lines, section bands as alternating tonal fills, black-key rows shaded by a few percent of text colour, the host's font. Notes are filled blocks in the note colour; rests are never drawn, they are the gaps.
STORY: The visitor sees bar numbers over named section bands, a row of key and meter flags, the chord names in time order, and `Vocal` and `Ins` as note blocks; zooms out to see the whole song, zooms in on a phrase, and scrolls to the high notes. A cut score shows a hatched tail and a line that says why.
FIRST VIEWPORT: Toolbar strip (title, zoom controls, read-only badge at the end); an optional cut strip; a pinned header of four rows (ruler with bar numbers, section bands, key and meter marks, chord track); the track heads and pitch columns pinned left; the lanes filling the rest, scrolling both ways, vertically centred on the middle of the `Vocal` pitches.
FORM: Standard DAW arrangement topology: shared time axis, pinned global rows, one lane per voice.
FINISH: critique, audit and polish are run on the rendered result at 1280 and 412 wide; DESIGN.md records every pattern later tickets reuse (marks row, section bands, cut tail, tied notes, zoom controls); screenshots are kept outside the repo.

## States and ranges

Real songs run 100 to 235 bars and up to about 1,500 notes; one to three meters and keys; zero to about 230 chords. Empty states: a score with no chords shows the chord track with a muted line saying so; a voice with only rests shows an empty track; a score that does not read shows its diagnostics instead of the view; no dialect shows one plain sentence.

## Unresolved

Lyrics track, selection, the section menu, chord picking, tempo and key editing, and the staff and text views belong to later tickets. Pinch-to-zoom on the time axis is not built (it would take page pinch-zoom away); revisit with the first editing ticket.
