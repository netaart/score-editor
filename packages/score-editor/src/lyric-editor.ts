// ABOUTME: The small editor the lyric track opens on a line: a text input and the buttons for splitting, merging, deleting and adding.
// ABOUTME: It owns its elements and says what the person asked for through hooks; the track decides what that does to the project.
import { create } from "./dom";
import type { Messages } from "./i18n";

/** What the person asked for in the editor. Each hook is one user action. */
export interface LyricEditorHooks {
  /** Enter, or leaving the box, with text that differs from the line's. True when the project took the text. */
  commit(text: string): boolean;
  /** Escape, or Enter with the text unchanged: the person is done with the line. */
  cancel(): void;
  /** The split button; `offset` is the caret, in code points. */
  split(offset: number): void;
  merge(): void;
  remove(): void;
  /** Enter, or the add button, in a box for a new line. */
  add(text: string): void;
}

/** Which job the editor is doing now. */
export type LyricEditorMode = "line" | "new";

export interface LyricEditor {
  readonly element: HTMLElement;
  /** Shows the editor for a line (`text` is its text, `line` its 1-based place) or for a new one, with the buttons that apply. */
  show(mode: LyricEditorMode, text: string, options: { canMerge: boolean; line: number }): void;
  /** Takes the text the line now has, and whether it has a next line, unless the person is typing in the box. */
  sync(text: string, canMerge: boolean): void;
  focus(): void;
}

/** The number of code points before `index` in `text`: the offset the split command counts in. */
export function codePointsBefore(text: string, index: number): number {
  return Array.from(text.slice(0, index)).length;
}

export function createLyricEditor(doc: Document, t: Messages, hooks: LyricEditorHooks): LyricEditor {
  const element = create(doc, "div", "sce-lyric-editor");
  element.setAttribute("role", "group");
  const input = create(doc, "input", "sce-lyric-input", element);
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  const actions = create(doc, "div", "sce-lyric-actions", element);
  const button = (label: string, run: () => void): HTMLButtonElement => {
    const made = create(doc, "button", "sce-button sce-lyric-button", actions);
    made.type = "button";
    made.textContent = label;
    made.addEventListener("click", run);
    return made;
  };

  let mode: LyricEditorMode = "line";
  /** The text the line has, so leaving the box with the same text sends nothing. */
  let stored = "";
  /** Escape was pressed: the blur that follows must not send what was typed. */
  let cancelled = false;
  /** A text the project refused, so leaving the box with it does not send it, and say why, a second time. */
  let refusedText: string | null = null;

  function send(): void {
    if (input.value === stored || input.value === refusedText) return;
    if (hooks.commit(input.value)) stored = input.value;
    else refusedText = input.value;
  }

  // A box whose text the project has not taken has no caret in the line's text: the split waits until it has.
  const split = button(t.lyricSplit, () => {
    if (input.value === stored) hooks.split(codePointsBefore(input.value, input.selectionStart ?? input.value.length));
  });
  const merge = button(t.lyricMerge, () => hooks.merge());
  const remove = button(t.lyricDelete, () => hooks.remove());
  const add = button(t.lyricAdd, () => hooks.add(input.value));

  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (mode === "new") {
        hooks.add(input.value);
        return;
      }
      send();
      // The text is in the project, or it was never changed: the person is done with the line. A refused text stays to be mended.
      if (input.value === stored) hooks.cancel();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelled = true;
      input.value = stored;
      hooks.cancel();
    }
  });
  input.addEventListener("blur", () => {
    if (cancelled) {
      cancelled = false;
      return;
    }
    if (mode === "line") send();
  });

  return {
    element,
    show(next, text, options) {
      mode = next;
      stored = next === "line" ? text : "";
      cancelled = false;
      refusedText = null;
      input.value = next === "line" ? text : "";
      const name = next === "line" ? t.lyricTextLabel : t.lyricNewTextLabel;
      element.setAttribute("aria-label", next === "line" ? t.lyricEditorLabel(options.line) : name);
      input.setAttribute("aria-label", name);
      split.hidden = merge.hidden = remove.hidden = next === "new";
      add.hidden = next === "line";
      merge.setAttribute("aria-disabled", String(!options.canMerge));
    },
    sync(text, canMerge) {
      merge.setAttribute("aria-disabled", String(!canMerge));
      if (mode !== "line" || doc.activeElement === input) return;
      stored = text;
      input.value = text;
    },
    focus() {
      input.focus();
    },
  };
}
