---
version: 1
slug: "packages-score-editor"
primary_target: "packages/score-editor"
related_targets: []
---

# Surface brief: the spike piano roll

Scope and visitor mode: Operate. The mounted score editor's first surface, an 8-bar piano roll of one `Vocal` voice (a second voice, `Ins`, renders the same way), inside any host. Verified at 1280 wide (mouse) and 412 wide (touch).

Audience, job and constraints: people who generated a song and want to nudge notes, mostly not trained musicians (PRODUCT.md). Job: drag a note to a new time and pitch, with mouse or finger, and know what it became. Constraints from PRODUCT.md and the spec: no brand of its own; colour and type come from the host through `--sce-*` variables with neutral fallbacks; every class prefixed `sce-`; popovers in the top layer; pointer events only; blank-space swipe scrolls.

Chosen direction: the world is pinned by PRODUCT.md (no identity of its own), so the dice-assigned direction was applied through the one axis the brief leaves open, density and one signature move. Grounded candidates considered, ordered by resonance: 1 the clip piano roll of a DAW (the category standard); 2 the player-piano paper roll; 3 the conductor's score with boxed rehearsal marks; 4 a tracker module; 5 a step-sequencer pad grid; 6 a karaoke lyric bar, where the active syllable is a highlighted capsule and a caption names it; 7 a spectrogram (rejected: an instrument costume). Assigned index 6, translated into neutral defaults: the note being moved is lifted and a small readout names where it lands (pitch name, bar, beat), the way a karaoke highlight names the word. Nothing else of that world is imported.

## Direction contract

THESIS: A piano roll that tells a non-musician what a drag did. It refuses the silent DAW roll where the only feedback is a note sliding on a grid.
OWN-WORLD: Neutral defaults only: a near-white or near-black ground following the host's `color-scheme`, one cool accent for the notes and focus, a hairline grid with bar lines heavier than beat lines, black-key rows shaded by a few percent of text colour, the host's font. A host maps colours through `--sce-color-*`; the editor never states a brand.
STORY: The visitor sees bar numbers, a `Vocal` track and notes; drags one; a readout says "D5 · bar 2 beat 1.25" while it moves; the note lands on the grid. A finger drags a note and scrolls on empty space.
FIRST VIEWPORT: Toolbar strip (title, grid choice, read-only badge at the end); bar ruler with numbers; track name row; pitch keys column at the left with octave labels; the lane filling the rest, scrolling both ways; the readout floats near the pointer during a drag.
FORM: Standard DAW roll topology (form 1) carrying the karaoke readout (form 6, seed: none (unavailable)).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved

Zoom, the overlap rule, selection of several notes, the pencil, tracks of chords and lyrics, and the toolbar's full set belong to later tickets. The chord and lyric lanes are not in this spike.
