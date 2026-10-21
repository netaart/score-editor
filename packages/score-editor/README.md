# @neta-art/score-editor

A browser score editor for song projects. A host app mounts it onto an element, maps its own theme through CSS variables, and receives one-time messages through a callback. No framework is exposed.

Work in progress: today the package holds an eight-bar piano-roll spike (drag a note in time and pitch with a mouse, a finger or the keyboard).

```ts
import { mount } from "@neta-art/score-editor";

const editor = mount(element, {
  language: "en", // "zh" or "en"
  editable: true,
  notify: (notice) => showToast(notice.message), // already in the current language
});

editor.update({ language: "zh" }); // only the given keys change
editor.destroy(); // removes every listener, node and stylesheet it added
```

- Importing the package runs nothing that touches the DOM, so a server render can import it. `mount` needs a browser and throws a clear error elsewhere; call it from client-side code.
- The edit layer is dialect-agnostic: `applyScoreCommand(dialect, text, command)` and `applyProjectCommand(dialect, project, command)` apply one command to the shared score model, write it with the dialect, and run `dialect.check`. A failure returns a diagnostic and changes nothing.
- Styles: every class is prefixed `sce-`. The host maps its theme onto `--sce-color-bg`, `--sce-color-text`, `--sce-color-accent` and a few more; unmapped colours fall back to neutral defaults derived from the mapped ones. The full list is in [DESIGN.md](../../DESIGN.md).
- A host whose own CSS uses ID selectors or `!important` on plain elements should mount the editor inside a shadow root. See [docs/spike.md](../../docs/spike.md).
- The package assumes a browser with native popovers, `:has()` and `light-dark()`. Only Chromium has been run so far.

MIT licensed.
