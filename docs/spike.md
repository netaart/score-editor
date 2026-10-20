# Spike findings: the 8-bar piano roll

The first piece of the editor is a piano roll with one track (`Vocal`), eight bars, and notes you can move in time and pitch with a mouse, a finger or the keyboard. It exists to settle four decisions that every later piece builds on: how the roll is rendered, how input events are handled, how styles are isolated from the host, and how popovers are layered. This note records each decision, what was verified and how, and what was not.

Verification labels used below:

- **Direct**: the real thing ran in real Chromium and the effect was observed. A test name in `e2e/mount.spec.ts` or a script in `scripts/` is cited when one exists.
- **Scratch**: run once in a throw-away script that is not part of the suite. The result is stated; the script is not kept.
- **Not verified**: nobody ran it. Stated so that nobody mistakes it for a result.

All browser results are from Chromium 156 (Playwright 1.64), on an x86 server in a Windows 11 session. Firefox, WebKit, iOS Safari and real phones were not run.

## What exists

- `@neta-art/score-editor` exports `mount(el, options)`, which returns `{ update(options), destroy() }`. Options: `language` (`"zh"` or `"en"`), `editable`, `notify` (the host callback for one-time messages), and `spikeScore` (spike only: the score to show, standing in for the song project until the dialect parser exists).
- `@neta-art/score-dialect-song2` exports the dialect's identity and its declarative constraints, and depends on the core package for types only. Parse, serialize and check are not part of the spike.
- Importing either package runs no code that touches the DOM or a browser global. Direct: `tests/entries.test.ts` imports both entries in a node environment.
- `mount` on a server throws a clear error ("needs a browser DOM; call it from client-side code only") instead of a reference error. Direct: a bare Worker running in the Workers runtime (workerd, started locally) imported the built entry, saw `mount` as a function, and got that error when it called it.

## Rendering: one DOM element per note, geometry from CSS variables

**Decision.** The roll is a single native scroller (`overflow: auto`) holding a canvas. A sticky ruler is pinned to the top, a sticky track head under it, a sticky pitch column to the left. Each note is a `div` with `role="button"` whose position and size come from three custom properties (`--t` start in ticks, `--d` length in ticks, `--r` row), turned into pixels by `calc()` against the beat width and row height. The beat lines, bar lines and black-key shading are CSS gradients on the lane, so they cost no nodes. No canvas, no SVG, no virtual list.

**Why.** Native scrolling gives inertia, scroll anchoring and accessibility for free. A `div` per note is focusable, labelled (`C5, bar 4 beat 1, length 3 beats`), and reachable by pointer, keyboard and screen reader without any parallel structure. Geometry in custom properties means moving a note is one style write.

**Verified.**

- Direct: an 8-bar score renders and is usable on desktop and phone profiles (every test in `e2e/mount.spec.ts`).
- Direct: scale. `scripts/measure-scale.mjs` mounts a synthetic score on the test page and records, with `performance.now()` around `mount()` and until the second animation frame, plus a frame recorder and a `longtask` observer during a 90-move mouse drag and during scrolling (90 wheel events, and a script moving `scrollLeft` every frame). Garbage is collected before each gesture. Numbers on this machine, Chromium headless, viewport 1280 by 800:

| Score | CPU | First frame after mount | Re-mount | DOM nodes | Long tasks in drag and scrolling | Worst frame |
| --- | --- | --- | --- | --- | --- | --- |
| 8 bars, 40 notes | 1x | 26 ms | 3 ms | 94 | 0 | 16.8 ms |
| 128 bars, 1500 notes, two tracks | 1x | 83 ms | 27 ms | 1677 | 0 | 16.8 ms |
| 128 bars, 1500 notes | 4x slowdown | 463 ms | 114 ms | 1677 | 0 | 16.8 ms |
| 128 bars, 1500 notes | 6x slowdown | 742 ms | 174 ms | 1677 | 0 | 16.8 ms |
| 256 bars, 6000 notes | 1x | 253 ms | 85 ms | 6305 | 0 | 16.8 ms |
| 256 bars, 6000 notes | 4x slowdown | 1988 ms | 470 ms | 6305 | none in the drag but 7 frames over 33 ms (worst 50 ms); 72 ms and 76 ms in the two scrolls | 66.7 ms |

  The slowdown rows use the browser's CPU throttle, a rough stand-in for a mid-range phone. At 128 bars and 1500 notes, input-to-frame latency during a drag had a 95th percentile of about 15 ms. In a headed run, frames were 31 ms apart without a long task, which is the display's refresh limit on this remote session rather than the editor's cost (one earlier run, not repeated on the final build).
- Direct: holding a dragged note at the edge of the 128-bar roll (edge scrolling running for 1.5 s) kept every frame at 16.7 ms with no long task, at 1x and at 4x (scratch script; the roll moved about 650 px).

**What the measurement says.** The approach meets the targets at the size of a real song (128 bars, 1500 notes): first render well under a second even at 6x slowdown, no long task above 50 ms in drag or scroll. It does not at 6000 notes on a slow CPU: first render near two seconds and long tasks of 70 ms or more. Cost grows linearly with node count (first frame 83 ms at 1677 nodes, 253 ms at 6305 nodes, both at 1x).

**What later work must do.**

- Window the notes by visible bar range plus an overscan once a song can exceed about 3000 notes, or when targeting low-end phones. Not built and not verified; this is an inference from the linear growth above. Keep the note's geometry in custom properties, so a windowed note is created or removed without touching its neighbours.
- Keep per-note CSS cheap. A first version reset every node with `all: revert`; at 1500 notes this made style recalculation dominate (first frame 1422 ms at 4x slowdown, against 463 ms after notes were given a light, hand-written reset). Anything created in the thousands must stay in the cheap path. `content-visibility` on notes made things worse, `contain: strict` and sticky positioning made no measurable difference.
- A canvas layer is not needed at this size. Revisit it only if windowing proves insufficient.

**Not verified.** Windowing. Firefox and WebKit scroll and sticky behaviour. Real phone hardware. A host that scales the editor with a CSS transform (the code reads layout once per gesture to tolerate this; no test applies a transform).

## Event model: pointer events, one gesture at a time

**Decision.**

- One delegated `pointerdown` listener on the editor root. A drag attaches `pointermove`, `pointerup`, `pointercancel` and `lostpointercapture` to the pressed note for the length of the gesture only, with the note holding pointer capture, and removes them all through one `AbortController`.
- A drag starts after a threshold of 3 px for a mouse and 6 px for touch or pen. Below it, a press is a selection.
- `touch-action: none` on notes, so the browser gives a finger on a note to the editor; `pan-x pan-y pinch-zoom` on the scroller, so a finger on empty space scrolls. Mouse is unaffected.
- During a drag the note itself is shifted (a `translate`) to the snapped position it would land on, with a readout of that position; the score changes on release, through one pure command (`moveNote`), which the keyboard also uses (arrow keys move by the grid, Shift plus up or down by an octave). Clamping to the score and the pitch range, and refusing a move onto another note's start, happen in that command, in one place.
- Escape, `pointercancel` and `lostpointercapture` cancel a drag and leave the score untouched.
- Holding a dragged note within 32 px (mouse) or 48 px (touch) of the roll's visible edge scrolls the roll, with speed rising towards the edge, so a note can travel further than the screen shows. A key move scrolls the roll just enough to keep the note clear of the edges and of the sticky parts.
- Every listener is registered with an `AbortSignal`; `destroy` aborts them all.

**Verified (direct).**

- Mouse drag changes time and pitch: `with a mouse › dragging a note changes its time and pitch`.
- Touch drag moves a note without scrolling, and a swipe on empty space scrolls without moving a note, with real touch input sent through the browser's input protocol on a phone profile: `with a finger › …`. Removing `touch-action: none` from the notes, or turning the scroller's `touch-action` to `none`, each made this test fail, so the test does depend on them.
- Escape cancels a drag and the readout stays inside the editor; holding a dragged note near the edge scrolls the roll and the note lands bars away: `with a mouse › Escape …`, `… holding a dragged note near the edge …`.
- Keys: nudges by grid, semitone and octave; a move is announced; a refused move is announced and reported; Space toggles selection; a key move past the visible edge scrolls it into view: the tests under `host callbacks`.
- `update` and `destroy` leave no listener and no node: after four mount, update and destroy cycles, listener counts on `window`, `document`, `html`, `body`, `head` and the stage are unchanged, the page's HTML is byte for byte what it was, and no listener remains on a retained copy of the removed subtree (read through the browser's debugger protocol). `repeated update and destroy leave no listeners and no nodes behind`. Removing the abort call, the style release or the root removal each made it fail.
- Mounting twice on one element throws.

**Not verified.** Edge scrolling with a finger (only a mouse was driven). Safari's handling of `touch-action` and pointer capture on iOS. Two fingers during a drag (pinch). Pen input. Right button and control-click. Any host that listens for pointer events on an ancestor in the capture phase and stops them.

**Known gaps, by design of the spike.** No overlap rules (two notes of one voice may not start at the same tick; the second is refused). No multi-select, no note-to-note keyboard navigation, no undo.

## Style isolation: prefixed, reset from the root, delivered as a constructed stylesheet

**Decision.**

- Every class is prefixed `sce-`; every public variable is `--sce-*`. The theme is a handful of host-mapped variables (colours, font family, radius, row height, beat width, pitch column width); `DESIGN.md` lists them. Colours not mapped by the host are derived from the mapped background and text, so mapping only those two stays readable.
- The root declares `all: initial`, so nothing inherits from the host except the font family (explicitly) and the colour scheme. Descendants are reverted with `all: revert` under a doubled class (`.sce-root.sce-root`) so a host rule as specific as `.page div` loses. Notes are exempt and reset the few properties they need by hand, for the cost reason above.
- Text is sized with the keyword `small` at the root and `em` below: the user's browser font size applies, a host's `html { font-size: 62.5% }` does not distort the tool.
- The stylesheet is a string in the package, delivered as a constructed stylesheet adopted by the document (or by the host's shadow root when the editor is mounted inside one), parsed once per document, and removed with the last editor. A `<style>` element is the fallback where constructed stylesheets are missing.
- Time runs left to right whatever the page's writing direction.

**Verified.**

- Direct: a host page with hostile element rules (`div, span, button` given margins, borders, backgrounds, fonts, text transform, shadows, and `main div` rules) does not change a note, the title or the grid button, and the editor leaves the host's own probe elements unchanged while mounted and after destroy: `host styling › the host's global styles do not change the editor…`. The first run of this test failed on a `text-transform` leak through the root, which is why the root resets everything.
- Direct: a host that maps only background and text gets readable text (contrast above 4.5:1 on title, grid label, bar numbers, octave labels): `a host that maps only the background and text colours…`. Before the derivation, the same mapping gave 1.12:1.
- Direct: under a strict `Content-Security-Policy: style-src 'self'` an injected `<style>` is blocked and leaves the editor with no styling at all (note height 0, scratch); the constructed stylesheet is not blocked: `style delivery › the editor is styled under a strict style policy…`.
- Direct: mounted inside an open shadow root the editor is styled there, works (drag, popover), is not affected by host rules that would otherwise reach it, even with ID selectors and `!important`, and leaves nothing behind after `destroy`: `style delivery › inside a host's shadow root…`.
- Direct: coarse pointers get 24 px rows (the first version's media rule never applied, because a doubled-class selector outranked it; found by review, covered by the touch test).
- Scratch: under a right-to-left page the first note sits right after the pitch column and the column stays pinned at the left while scrolling.
- Direct: both host apps (below) render and style the editor, and map their own theme variables through it.

**Known limit, verified in a scratch run.** Mounted directly in the page, the editor is not defended against host rules with an ID selector (`#stage span { … }`) or `!important`: padding and colour leaked through. A host with such rules mounts the editor inside a shadow root. The package does not create the shadow root itself.

**Not verified.** `all: revert` and `light-dark()` in Firefox and Safari. Host styles inside cascade layers against the editor's unlayered styles. A host that adopts its own sheets after the editor mounts and relies on ordering.

## Popovers: the native top layer

**Decision.** The grid choice is a native popover (`popover="auto"`) opened by a `popovertarget` button, positioned with `position: fixed` from the button's rectangle when it opens, and nudged left if it would leave the viewport. Items are `menuitemradio` buttons; arrow keys, Home and End walk them; Enter or Space picks. Light dismiss and Escape come from the platform, and focus returns to the button.

**Why.** A popover in the top layer is above every `z-index` and outside every clipping ancestor, so the package does not have to know the host's stacking. The requirement is that the editor's popovers stack above a host's full-screen layer.

**Verified (direct).**

- Above a host layer that is `position: fixed`, `z-index: 1000`, `overflow: hidden` and `transform`ed, and below nothing: with a sibling at `z-index: 2147483647` covering the menu's area, the menu is visible, extends past the clip of its container, and can be clicked or tapped, on the desktop and phone profiles: `popovers › the grid popover works above a host's layers…`.
- Inside a host's modal `<dialog>` (itself in the top layer): opens, Escape closes it and returns focus to the button, and it can be used again: `… it opens inside a host's modal dialog…`. Removing the `popover` attribute made both popover tests fail.
- Arrow-key walking and choosing with Enter: `the open menu is walked with the arrow keys…`.
- Both host apps: a host layer above the host's own highest overlay value, with a covering toast at `z-index: 2147483647`; the menu item was clicked through the toast.

**Not verified.** A popover opened inside another popover. A host focus-trap library that refuses focus outside its container while the editor's popover is open. Safari before 17, where `popover` is missing (the package assumes a browser with it, as it assumes `:has()` and `light-dark()`). Backdrops that mark the rest of the page `inert`.

## Accessibility

Direct: every note is a labelled button; the roll is a labelled region described by a hint that names the drag and key gestures; moves and refusals are announced through a polite status region; the grid choice is a menu with checked state; focus shows on the buttons, notes and, as a ring over the whole body, on the scroller; selected-and-focused is distinguishable from selected. Reduced motion: the only transition (note opacity, 120 ms) is off. The design tooling's detector reported no findings on the build after the review fixes.

Not verified: any real screen reader. Target size: fine-pointer notes are 14 px tall (below the 24 px target size), accepted for a dense editor; coarse pointers get 24 px rows.

## Hosts

The spike was mounted by a temporary page in the local development environment of each of two host apps, without touching their dependency graphs (the built entry was copied in) and without committing anything to them. Each page was removed and the checkout was clean afterwards.

- **A Next app** (Next 16, Turbopack dev server). A server component rendered a client component that **imports the built entry statically**: the server render returned 200 and contained the stage, so the import is safe on the server. The client component mounts in an effect and destroys on cleanup; after React's double-invoked effects exactly one editor existed. A second variant loaded it with `next/dynamic` and `ssr: false`. In both: mouse drag moved a note; a touch drag moved a note without scrolling; a swipe on empty space scrolled; the host's two themes mapped through the variables (the editor's background equalled the host's token in each theme); the popover worked above the host's highest overlay and a covering toast.
- **A SvelteKit app with the Cloudflare adapter** (Vite 8, Svelte 5). A route in the server-rendered group **imports the built entry statically**; the server render returned 200. The dev server's server rendering runs in Node, not in the Workers runtime, so the same entry was also imported by a bare Worker run locally in workerd (above). Mouse drag, touch drag, swipe, popover above the host's top overlay and a covering toast all worked, and the editor followed each of the host's seven themes (editor background equal to the host's token in every one).

**Not verified.** A production build of either host. The host apps' own console errors seen in the Next app (a prerender timing error and a null `parentNode` error) appear on a page with no editor too, so they are not the editor's.

## What the later work should keep

- One command per edit, shared by pointer and keyboard; the host is told about every refusal.
- Cheap per-node CSS; window the notes before the song size or the target device forces it.
- The variable contract in `DESIGN.md` as the only public styling surface; mount inside a shadow root when a host's CSS is hostile.
- Direct tests through `window.harness` on the test page; add a measurement run (`scripts/measure-scale.mjs`) whenever the note's DOM or CSS changes.
