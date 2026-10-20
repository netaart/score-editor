// ABOUTME: mount(el, options): the only place the package touches the DOM.
// ABOUTME: Everything before a call to mount is safe to run on a server.
import { Editor } from "./editor";
import type { MountedEditor, MountOptions } from "./types";

const mounted = new WeakSet<HTMLElement>();

/**
 * Mounts the editor into `el` and returns its handle. Call it from client-side code only.
 * An element holds at most one editor; destroy the first before mounting again.
 */
export function mount(el: HTMLElement, options: MountOptions): MountedEditor {
  if (typeof document === "undefined") {
    throw new Error("@neta-art/score-editor: mount() needs a browser DOM; call it from client-side code only.");
  }
  if (mounted.has(el)) {
    throw new Error("@neta-art/score-editor: this element already holds an editor; destroy it before mounting again.");
  }
  mounted.add(el);
  return new Editor(el, options, () => mounted.delete(el));
}
