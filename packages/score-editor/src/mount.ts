// ABOUTME: mount(el, options): the only place the package touches the DOM.
// ABOUTME: Everything before a call to mount is safe to run on a server.
import type { MountedEditor, MountOptions } from "./types";

export function mount(_el: HTMLElement, _options: MountOptions): MountedEditor {
  if (typeof document === "undefined") {
    throw new Error("@neta-art/score-editor: mount() needs a browser DOM; call it from client-side code only.");
  }
  return { update() {}, destroy() {} };
}
