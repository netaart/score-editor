// ABOUTME: The chord picker: a native popover in which a root, a type and an optional bass note are chosen and a chord is placed, changed or removed.
// ABOUTME: Everything it offers comes from the dialect's chord vocabulary; it hands back one chord name and edits nothing itself.
import type { BarPosition } from "./arrangement";
import type { ChordSlot } from "./chord-edit";
import { type ChordMessages, chordMessagesFor } from "./chord-text";
import { type ChordChoices, splitChordName } from "./chord-vocabulary";
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

const letterOf = (root: string): string => root.slice(0, 1);

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
  return `${draft.root}${draft.quality}${draft.bass === null ? "" : `/${draft.bass}`}`;
}

/**
 * Makes the picker for the part whose root is `root`. The picker is a native popover, so it stands in the top layer, above
 * a host's full-screen layer; it is the last child of `root`, so the part's style sheet and theme reach it, and it goes with
 * `root`. `onToggle` hears when it opens and closes, including when the browser closes it (Escape, a press outside).
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
      (choices.letters.find((found) => found.letter === letterOf(root))?.roots ?? []).map((name) => ({
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
      const grows = panel.matches(":popover-open");
      letters.set(letterItems, letterOf(draft.root));
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
          draft.bass === null ? "" : letterOf(draft.bass),
        );
        bassAccidentals.set(draft.bass === null ? [] : spellings(draft.bass), draft.bass);
        bassAccidentals.element.hidden = draft.bass === null;
      }
      if (grows) refit(panel);
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

  /** Puts the picker under the chord row at the chosen start, kept inside the window, above the row when there is no room below. */
  function place(panel: HTMLElement, anchor: ChordPickerRequest["anchor"]): void {
    const view = doc.defaultView;
    if (!view) return;
    panel.style.left = `${anchor.left}px`;
    panel.style.top = `${anchor.top}px`;
    panel.style.maxHeight = "";
    const rect = panel.getBoundingClientRect();
    const below = view.innerHeight - anchor.top - 8;
    const above = anchor.rowTop - 4 - 8;
    if (rect.height > below && above > below) {
      panel.style.maxHeight = `${above}px`;
      panel.style.top = `${Math.max(8, anchor.rowTop - 4 - Math.min(rect.height, above))}px`;
    } else {
      panel.style.maxHeight = `${below}px`;
    }
    // The width the page lays out in, which a scroll bar or a page wider than the screen makes smaller than the window's.
    const width = Math.min(view.innerWidth, doc.documentElement.clientWidth || view.innerWidth);
    const overflow = rect.right - (width - 8);
    if (overflow > 0) panel.style.left = `${Math.max(8, anchor.left - overflow)}px`;
  }

  /**
   * Called when a choice makes the open picker taller or shorter: it stays where it is, so that what a finger is on does not
   * move, and moves up only as far as the edge of the window makes it.
   */
  function refit(panel: HTMLElement): void {
    const view = doc.defaultView;
    if (!view) return;
    panel.style.maxHeight = "";
    const rect = panel.getBoundingClientRect();
    const height = Math.min(rect.height, view.innerHeight - 16);
    panel.style.top = `${Math.max(8, Math.min(rect.top, view.innerHeight - 8 - height))}px`;
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
