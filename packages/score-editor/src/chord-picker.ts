// ABOUTME: The chord picker: a native popover in which a root, a type and an optional bass note are chosen and a chord is placed, changed or removed.
// ABOUTME: Everything it offers comes from the dialect's chord vocabulary; it hands back one chord name and edits nothing itself.
import type { BarPosition } from "./arrangement";
import type { ChordSlot } from "./chord-edit";
import { type ChordMessages, chordMessagesFor } from "./chord-text";
import { type ChordChoices, joinChordName, rootLetter, splitChordName } from "./chord-vocabulary";
import { create } from "./dom";
import type { ChordVocabulary, Language } from "./types";

export interface ChordPickerRequest {
  /** The start the chord goes on. */
  readonly slot: ChordSlot;
  readonly position: BarPosition;
  readonly choices: ChordChoices;
  readonly vocabulary: ChordVocabulary;
  readonly language: Language;
  /** Where the picker stands, in window pixels: the chosen start's left edge, the line under the chord row, and the row's top. */
  readonly anchor: { readonly left: number; readonly top: number; readonly rowTop: number };
  /** The name to set, or the empty string to remove the chord. Called after the picker has closed. */
  choose(name: string): void;
}

export interface ChordPicker {
  readonly isOpen: boolean;
  open(request: ChordPickerRequest): void;
  close(): void;
}

/** What the person has chosen so far. */
interface Draft {
  root: string;
  quality: string;
  bass: string | null;
  bassOpen: boolean;
}

interface Item {
  readonly value: string;
  readonly text: string;
}

/** A row of chips of which one is checked: one tab stop, and the arrow keys move the check, as in a native radio group. */
interface RadioGroup {
  readonly element: HTMLElement;
  set(items: ReadonlyArray<Item>, checked: string | null): void;
  /** The chip that holds the tab stop, if there is one. */
  stop(): HTMLElement | undefined;
}

function radioGroup(
  parent: HTMLElement,
  label: string,
  className: string,
  onPick: (value: string) => void,
  signal: AbortSignal,
): RadioGroup {
  const doc = parent.ownerDocument;
  const element = create(doc, "div", `sce-chip-row ${className}`, parent);
  element.setAttribute("role", "radiogroup");
  element.setAttribute("aria-label", label);
  let chips: HTMLButtonElement[] = [];

  element.addEventListener(
    "click",
    (event) => {
      const chip = event.target instanceof Element ? event.target.closest<HTMLElement>(".sce-chip") : null;
      if (chip && element.contains(chip)) onPick(chip.dataset.value ?? "");
    },
    { signal },
  );
  element.addEventListener(
    "keydown",
    (event) => {
      if (!(event.target instanceof HTMLButtonElement) || event.altKey || event.ctrlKey || event.metaKey) return;
      const at = chips.indexOf(event.target);
      if (at < 0) return;
      let next = -1;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (at + 1) % chips.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (at - 1 + chips.length) % chips.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = chips.length - 1;
      const chip = chips[next];
      if (chip === undefined) return;
      event.preventDefault();
      chip.focus();
      onPick(chip.dataset.value ?? "");
    },
    { signal },
  );

  return {
    element,
    set(items, checked) {
      const same = chips.length === items.length && chips.every((chip, at) => chip.dataset.value === items[at]?.value);
      if (!same) {
        element.replaceChildren();
        chips = items.map((item) => {
          const chip = create(doc, "button", "sce-button sce-chip", element);
          chip.type = "button";
          chip.setAttribute("role", "radio");
          chip.dataset.value = item.value;
          return chip;
        });
      }
      const stop = chips.find((chip) => chip.dataset.value === checked) ?? chips[0];
      for (const [at, chip] of chips.entries()) {
        chip.textContent = items[at]?.text ?? "";
        const on = chip.dataset.value === checked;
        chip.setAttribute("aria-checked", String(on));
        chip.tabIndex = chip === stop ? 0 : -1;
      }
    },
    stop: () => chips.find((chip) => chip.tabIndex === 0),
  };
}

/** The plain letter if the vocabulary has it, else the first spelling it has on that letter. */
function rootOnLetter(choices: ChordChoices, letter: string): string {
  const roots = choices.letters.find((found) => found.letter === letter)?.roots ?? [];
  return roots.includes(letter) ? letter : (roots[0] ?? "");
}

/**
 * What the picker opens on: the chord on the start, else the chord in force before it (so repeating a chord is one
 * press), else the first root and the first type of the vocabulary.
 */
function startDraft({ slot, choices, vocabulary }: ChordPickerRequest): Draft {
  const offered = new Set(choices.letters.flatMap((found) => found.roots));
  const parts = splitChordName(slot.chord ?? slot.before ?? "", vocabulary);
  const usable = parts !== null && offered.has(parts.root) && choices.qualities.includes(parts.quality);
  const first = choices.letters[0]?.letter ?? "";
  const bass = usable && choices.slashBass && parts.bass !== null && offered.has(parts.bass) ? parts.bass : null;
  return {
    root: usable ? parts.root : rootOnLetter(choices, first),
    quality: usable ? parts.quality : (choices.qualities[0] ?? ""),
    bass,
    bassOpen: bass !== null,
  };
}

function compose(draft: Draft): string {
  return joinChordName(draft.root, draft.quality, draft.bass);
}

/**
 * Makes the picker for the part whose root is `root`. It is a native popover in the top layer, and the last child of
 * `root`, so the part's style sheet and theme reach it and it goes with `root`; the reasons are in
 * DESIGN.md#chord-editing. `onToggle` hears when it opens and closes, including when the browser closes it.
 */
export function mountChordPicker(
  root: HTMLElement,
  signal: AbortSignal,
  onToggle: (open: boolean) => void,
): ChordPicker {
  const doc = root.ownerDocument;
  let popover: HTMLElement | null = null;

  function close(): void {
    if (popover?.matches(":popover-open")) popover.hidePopover();
  }

  /** The hold of the open picker's own listeners, released when it is built again and with the part. */
  let own: AbortController | null = null;
  /** What Enter does among the choices of the picker that is open. */
  let confirmNow: (() => void) | null = null;
  signal.addEventListener("abort", () => own?.abort(), { once: true });

  function build(request: ChordPickerRequest, panel: HTMLElement, signal: AbortSignal): HTMLElement | undefined {
    const t: ChordMessages = chordMessagesFor(request.language);
    const { choices, slot } = request;
    const draft = startDraft(request);
    panel.replaceChildren();
    panel.setAttribute("aria-label", t.pickerLabel(request.position));
    panel.lang = request.language;

    const head = create(doc, "div", "sce-picker-head", panel);
    create(doc, "span", "sce-picker-place", head).textContent = t.pickerPlace(request.position);
    create(doc, "span", "sce-picker-now", head).textContent = t.pickerNow(slot.chord);
    const readout = create(doc, "div", "sce-picker-name", panel);
    readout.setAttribute("role", "status");
    readout.setAttribute("aria-live", "polite");

    const confirm = (): void => {
      const name = compose(draft);
      close();
      request.choose(name);
    };
    confirmNow = null;

    const has = choices.letters.length > 0 && choices.qualities.length > 0;
    const section = (label: string): HTMLElement => {
      const group = create(doc, "div", "sce-picker-group", panel);
      create(doc, "span", "sce-picker-label", group).textContent = label;
      return group;
    };
    const letterItems = choices.letters.map((found) => ({ value: found.letter, text: found.letter }));
    const spellings = (root: string): Item[] =>
      (choices.letters.find((found) => found.letter === rootLetter(root))?.roots ?? []).map((name) => ({
        value: name,
        text: name,
      }));

    let letters: RadioGroup | null = null;
    let accidentals: RadioGroup | null = null;
    let types: RadioGroup | null = null;
    let bassToggle: HTMLButtonElement | null = null;
    let bassValue: HTMLElement | null = null;
    let bassBody: HTMLElement | null = null;
    let bassLetters: RadioGroup | null = null;
    let bassAccidentals: RadioGroup | null = null;

    if (has) {
      const rootSection = section(t.root);
      letters = radioGroup(
        rootSection,
        t.root,
        "sce-chip-letters",
        (value) => {
          draft.root = rootOnLetter(choices, value);
          update();
        },
        signal,
      );
      accidentals = radioGroup(
        rootSection,
        t.accidental,
        "sce-chip-spellings",
        (value) => {
          draft.root = value;
          update();
        },
        signal,
      );
      types = radioGroup(
        section(t.type),
        t.type,
        "sce-chip-types",
        (value) => {
          draft.quality = value;
          update();
        },
        signal,
      );
      if (choices.slashBass) {
        const bassSection = create(doc, "div", "sce-picker-group", panel);
        bassToggle = create(doc, "button", "sce-button sce-picker-bass", bassSection);
        bassToggle.type = "button";
        create(doc, "span", "sce-picker-bass-label", bassToggle).textContent = t.bass;
        bassValue = create(doc, "span", "sce-picker-bass-value", bassToggle);
        bassBody = create(doc, "div", "sce-picker-bass-body", bassSection);
        bassLetters = radioGroup(
          bassBody,
          t.bass,
          "sce-chip-letters",
          (value) => {
            draft.bass = value === "" ? null : rootOnLetter(choices, value);
            update();
          },
          signal,
        );
        bassAccidentals = radioGroup(
          bassBody,
          `${t.bass}: ${t.accidental}`,
          "sce-chip-spellings",
          (value) => {
            draft.bass = value;
            update();
          },
          signal,
        );
        bassToggle.addEventListener(
          "click",
          () => {
            draft.bassOpen = !draft.bassOpen;
            update();
          },
          { signal },
        );
      }
    }

    function update(): void {
      readout.textContent = compose(draft);
      if (!letters || !accidentals || !types) return;
      // Opening the bass note or choosing a spelling changes the height, so the picker is fitted to the window again.
      const isOpen = panel.matches(":popover-open");
      letters.set(letterItems, rootLetter(draft.root));
      accidentals.set(spellings(draft.root), draft.root);
      types.set(
        choices.qualities.map((quality) => ({ value: quality, text: `${draft.root}${quality}` })),
        draft.quality,
      );
      if (bassToggle && bassValue && bassBody && bassLetters && bassAccidentals) {
        bassValue.textContent = draft.bass ?? t.bassNone;
        bassToggle.setAttribute("aria-expanded", String(draft.bassOpen));
        bassBody.hidden = !draft.bassOpen;
        bassLetters.set(
          [{ value: "", text: t.bassNone }, ...letterItems],
          draft.bass === null ? "" : rootLetter(draft.bass),
        );
        bassAccidentals.set(draft.bass === null ? [] : spellings(draft.bass), draft.bass);
        bassAccidentals.element.hidden = draft.bass === null;
      }
      if (isOpen) refit(panel);
    }

    const actions = create(doc, "div", "sce-picker-actions", panel);
    if (slot.chord !== null) {
      const remove = create(doc, "button", "sce-button sce-picker-remove", actions);
      remove.type = "button";
      remove.textContent = t.remove;
      remove.addEventListener(
        "click",
        () => {
          close();
          request.choose("");
        },
        { signal },
      );
    }
    create(doc, "span", "sce-picker-gap", actions);
    const cancel = create(doc, "button", "sce-button sce-picker-cancel", actions);
    cancel.type = "button";
    cancel.textContent = t.cancel;
    cancel.addEventListener("click", close, { signal });
    if (has) {
      const primary = create(doc, "button", "sce-button sce-picker-primary", actions);
      primary.type = "button";
      primary.textContent = slot.chord === null ? t.place : t.change;
      primary.addEventListener("click", confirm, { signal });
    }

    update();
    if (has) confirmNow = confirm;
    return letters?.stop() ?? actions.querySelector("button") ?? undefined;
  }

  /**
   * Fits the picker to the window: its left edge is clamped to the width the page lays out in, its height to the visible
   * height, and on a first placement it goes under the row, or above it when that has more room. A refit keeps the top it
   * has and moves up only as far as the edge needs.
   */
  function fit(panel: HTMLElement, anchor: ChordPickerRequest["anchor"], mode: "place" | "refit"): void {
    const view = doc.defaultView;
    if (!view) return;
    const innerHeight = view.innerHeight;
    const highest = Math.max(0, innerHeight - 16);
    panel.style.maxHeight = `${highest}px`;
    if (mode === "place") {
      panel.style.left = `${anchor.left}px`;
      panel.style.top = `${anchor.top}px`;
      const rect = panel.getBoundingClientRect();
      const below = Math.max(0, innerHeight - anchor.top - 8);
      const above = Math.max(0, anchor.rowTop - 4 - 8);
      if (rect.height > below && above > below) {
        const height = Math.min(rect.height, above);
        panel.style.maxHeight = `${Math.min(highest, height)}px`;
        panel.style.top = `${Math.max(8, anchor.rowTop - 4 - height)}px`;
      } else {
        panel.style.maxHeight = `${Math.min(highest, below)}px`;
      }
    } else {
      const rect = panel.getBoundingClientRect();
      panel.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - 8 - rect.height))}px`;
    }
    const rect = panel.getBoundingClientRect();
    const layoutWidth = Math.min(view.innerWidth, doc.documentElement.clientWidth || view.innerWidth);
    const left = mode === "place" ? anchor.left : rect.left;
    panel.style.left = `${Math.max(8, Math.min(left, layoutWidth - 8 - rect.width))}px`;
  }

  function place(panel: HTMLElement, anchor: ChordPickerRequest["anchor"]): void {
    fit(panel, anchor, "place");
  }

  function refit(panel: HTMLElement): void {
    fit(panel, { left: panel.getBoundingClientRect().left, top: 0, rowTop: 0 }, "refit");
  }

  return {
    get isOpen() {
      return popover?.matches(":popover-open") ?? false;
    },
    open(request) {
      if (!popover) {
        popover = create(doc, "div", "sce-popover sce-chord-picker", root);
        popover.setAttribute("popover", "auto");
        popover.setAttribute("role", "dialog");
        popover.addEventListener("toggle", (event) => onToggle((event as ToggleEvent).newState === "open"), {
          signal,
        });
        // Enter anywhere among the choices places the chord, as Enter in a form does; the buttons keep their own Enter.
        popover.addEventListener(
          "keydown",
          (event) => {
            if (event.key !== "Enter" || event.isComposing || event.defaultPrevented) return;
            if (event.target instanceof Element && event.target.getAttribute("role") === "radio" && confirmNow) {
              event.preventDefault();
              confirmNow();
            }
          },
          { signal },
        );
      }
      const panel = popover;
      close();
      own?.abort();
      own = new AbortController();
      const first = build(request, panel, own.signal);
      panel.showPopover();
      place(panel, request.anchor);
      first?.focus();
    },
    close,
  };
}
