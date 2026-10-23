// ABOUTME: The small editor the lyric track opens on a line: a text input and the buttons for splitting, merging, deleting and adding.
// ABOUTME: It owns its elements and says what the person asked for through hooks; the track decides what that does to the project.
import { create, uniqueId } from "./dom";
import type { Messages } from "./i18n";

/** What the person asked for in the editor. Each hook is one user action. */
export interface LyricEditorHooks {
  /** Enter, or leaving the box, with text that differs from the line's. Null when the project took the text, else why it did not. */
  commit(text: string): string | null;
  /** Escape, or Enter with the text unchanged: the person is done with the line. */
  cancel(): void;
  /** The split button; `offset` is the caret, in code points. */
  split(offset: number): void;
  merge(): void;
  remove(): void;
  /** The place button, for a line that is not on bars; `bar` is the number typed, 1-based. */
  place(bar: number): void;
  /** Enter, or the add button, in a box for a new line. Null when the line was added, else why it was not. */
  add(text: string): string | null;
}

/** Which job the editor is doing now. */
export type LyricEditorMode = "line" | "new";

export interface LyricEditor {
  readonly element: HTMLElement;
  /** Shows the editor for a line (`text` is its text, `line` its 1-based place) or for a new one, with the buttons that apply. */
  show(mode: LyricEditorMode, text: string, options: { canMerge: boolean; line: number; canPlace: boolean }): void;
  /** Takes the text the line now has, and whether it has a next line, unless the person is typing in the box. */
  sync(text: string, canMerge: boolean): void;
  focus(): void;
}

/** The number of code points before `index` in `text`: the offset the split command counts in. */
export function codePointsBefore(text: string, index: number): number {
  return Array.from(text.slice(0, index)).length;
}

export function createLyricEditor(
  doc: Document,
  t: Messages,
  hooks: LyricEditorHooks,
  signal: AbortSignal,
): LyricEditor {
  const element = create(doc, "div", "sce-lyric-editor");
  element.setAttribute("role", "group");
  // The line the editor is on, in words: the buttons below it say "next" and "delete" of something.
  const caption = create(doc, "span", "sce-lyric-caption", element);
  caption.setAttribute("aria-hidden", "true");
  const input = create(doc, "input", "sce-lyric-input", element);
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  const problem = create(doc, "p", "sce-lyric-problem", element);
  problem.id = uniqueId("sce-lyric-problem");
  problem.hidden = true;
  const actions = create(doc, "div", "sce-lyric-actions", element);
  const button = (label: string, run: () => void): HTMLButtonElement => {
    const made = create(doc, "button", "sce-button sce-lyric-button", actions);
    made.type = "button";
    made.textContent = label;
    made.addEventListener("click", run, { signal });
    return made;
  };

  let mode: LyricEditorMode = "line";
  /** The text the line has, so leaving the box with the same text sends nothing. */
  let stored = "";
  /** Escape was pressed: the blur that follows must not send what was typed. */
  let cancelled = false;
  /** A text the project refused, so leaving the box with it does not send it, and say why, a second time. */
  let refusedText: string | null = null;

  /** Marks the box and says under it why the project did not take the text; null takes the mark and the sentence away. */
  function mark(sentence: string | null): void {
    problem.hidden = !sentence;
    problem.textContent = sentence ?? "";
    if (sentence === null) {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    } else {
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", problem.id);
    }
  }

  function send(): void {
    if (input.value === stored || input.value === refusedText) return;
    const refused = hooks.commit(input.value);
    if (refused === null) {
      stored = input.value;
      mark(null);
    } else {
      refusedText = input.value;
      mark(refused);
    }
  }

  // A box whose text the project has not taken has no caret in the line's text: the split waits until it has.
  const split = button(t.lyricSplit, () => {
    if (input.value === stored) hooks.split(codePointsBefore(input.value, input.selectionStart ?? input.value.length));
  });
  const merge = button(t.lyricMerge, () => hooks.merge());
  const remove = button(t.lyricDelete, () => hooks.remove());
  const addNew = (): void => mark(hooks.add(input.value));
  const add = button(t.lyricAdd, addNew);

  // A line that is not on bars can be put on a bar without a drag: type the bar's number and press the button.
  const place = create(doc, "div", "sce-lyric-place", element);
  const bar = create(doc, "input", "sce-lyric-input sce-lyric-bar", place);
  bar.type = "number";
  bar.min = "1";
  bar.step = "1";
  bar.inputMode = "numeric";
  bar.setAttribute("aria-label", t.lyricBarField);
  bar.placeholder = t.lyricBarField;
  const placeButton = create(doc, "button", "sce-button sce-lyric-button", place);
  placeButton.type = "button";
  placeButton.textContent = t.lyricPlace;
  placeButton.addEventListener("click", () => hooks.place(bar.valueAsNumber), { signal });

  input.addEventListener(
    "keydown",
    (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        if (mode === "new") {
          addNew();
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
    },
    { signal },
  );
  // A text that is not the refused one is a new try: the mark and the sentence go.
  input.addEventListener(
    "input",
    () => {
      if (refusedText !== null && input.value !== refusedText) {
        refusedText = null;
        mark(null);
      }
    },
    { signal },
  );
  input.addEventListener(
    "blur",
    () => {
      if (cancelled) {
        cancelled = false;
        return;
      }
      if (mode === "line") send();
    },
    { signal },
  );

  return {
    element,
    show(next, text, options) {
      mode = next;
      stored = next === "line" ? text : "";
      cancelled = false;
      refusedText = null;
      mark(null);
      caption.textContent = next === "line" ? t.lyricEditorLabel(options.line) : t.lyricNewLine;
      input.value = next === "line" ? text : "";
      const name = next === "line" ? t.lyricTextLabel : t.lyricNewTextLabel;
      element.setAttribute("aria-label", next === "line" ? t.lyricEditorLabel(options.line) : name);
      input.setAttribute("aria-label", name);
      input.placeholder = name;
      split.hidden = merge.hidden = remove.hidden = next === "new";
      add.hidden = next === "line";
      place.hidden = !options.canPlace;
      merge.setAttribute("aria-disabled", String(!options.canMerge));
    },
    sync(text, canMerge) {
      merge.setAttribute("aria-disabled", String(!canMerge));
      if (mode !== "line" || doc.activeElement === input) return;
      stored = text;
      input.value = text;
      refusedText = null;
      mark(null);
    },
    focus() {
      input.focus();
    },
  };
}
