# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Decided in the project spec: a pnpm workspace with two browser packages built with tsdown, linted with biome, tested with vitest (logic) and Playwright on real Chromium (the mounted editor). No framework is exposed: hosts call `mount(el, options)`. The packages' main entries have no side effects and touch no DOM or browser globals at import time, so server-side imports in host apps are safe.

## Users

People who generated a song with the `song2` model and want to change parts of it, then generate it again: fix a note, change a chord, cut a chorus, move a lyric line. Most of them are not trained musicians. The interaction model follows DAW conventions (Ableton Live as the reference), so people who know arrangement software are at home immediately, and people who do not can still edit with the pencil, the synth preview and the lyric-alignment colours.

Secondary: developers of the host apps that embed the editor, who map its theme variables, supply storage and hand-off callbacks, and choose the interface language.

## Product Purpose

Edit a whole song project — style description, lyrics, score, score mode and seed, plus which lyric line goes with which phrase — instead of rewriting the prompt and losing the melody. The edited project goes back into the host's normal generation flow: the editor hands the score and a summary of the changes to the host's chat input; it never sends anything by itself.

Success: a user changes a song and regenerates it from the edited score without leaving the host app, and the new song opens with its lyric-to-phrase alignment carried over.

## Positioning

A score editor that is aware of the generation model's score dialect: it reads and writes the dialect losslessly (unchanged sections are emitted byte for byte), checks edits against the same rules the model enforces, and keeps lyrics aligned to phrases. One package serves several host apps with their own looks.

## Operating Context

- Embedded in host web apps, opened from a song's detail view or a generation result; one host opens it as a full-screen layer above its own dialogs, another inline below a player. Read-only where the viewer cannot edit (shared pages, other people's tasks).
- Desktop and mobile browsers; mouse, keyboard and touch. Every function is reachable on a phone.
- Edits autosave as drafts through host callbacks; the original song is never modified.
- Preview is a browser oscillator synth (melody plus chords), labelled as a synthetic preview that does not represent the final song. No sound libraries, no network requests.

## Capabilities and Constraints

- Views: an arrangement view (default; timeline with section bands, chord track, `Vocal` and `Ins` piano-roll tracks, lyrics track), a read-only staff view, and a text view with live diagnostics.
- Editing: draw, select, move, resize, copy and paste notes; insert and delete bars; meter per section; tempo and key; chords; section operations; lyrics editing; note tools, quantize, transforms and generators; filter-select; undo and redo; restore the original score.
- Score dialects are pluggable; `song2` is the first. The dialect contract is `id`, declarative `constraints`, `parse`, `serialize`, `check`.
- Interface languages: `zh` and `en`, chosen by the host. Diagnostics carry only codes, parameters and positions; the package translates them.
- Styling: theme through CSS variables mapped by the host; every package class is prefixed so nothing leaks into the host; the package's own popovers stack above the host's full-screen layer.
- Public repository: no internal names, no upstream code or upstream sample scores; test samples are hand-written or traced to our own generations.

## Brand Commitments

None of its own. The editor carries no brand or visual identity: colours and type come from the host through CSS variables. The package owns structure, interaction, and a neutral set of default values used only where a host has not mapped a variable.

## Evidence on Hand

No real user content ships in the repository. Sample scores are hand-written or traced to our own generation records.

## Product Principles

1. The song is the user's: never change the original, never send anything without the user confirming in the host.
2. Lossless round-trips: what the user did not touch stays byte for byte as it was.
3. DAW conventions over invention: familiar gestures and shortcuts first, with visible affordances so non-musicians can find them.
4. Tell the truth about sound: the preview says it is synthetic; diagnostics say exactly where the score breaks a rule.
5. The host's look, the editor's structure: fit inside any host without leaking styles or fighting its layers.

## Accessibility & Inclusion

Keyboard and touch are both first-class: every editing action has a pointer or touch path and a keyboard path. No WCAG level has been set yet (open decision).
