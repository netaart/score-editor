// ABOUTME: The shared conflict banner and its choices popover, used by the draft conflict and the score-file conflict.
// ABOUTME: One sentence and one Choose button; the two two-line ways out live in a dialog anchored under the banner.
import { create } from "./dom";
import { anchorOf, keepInside, placeUnder } from "./popover-menu";
import { revealConflictInChrome } from "./reveal-conflict";

/** The words of one conflict, in the session's language. */
export interface ConflictCopy {
  /** The banner's and the dialog's name. */
  name: string;
  sentence: string;
  choose: string;
  choices: readonly [ConflictChoiceCopy, ConflictChoiceCopy];
}

/** One way out: what it is, and what it does, the second line spoken as the button's description. */
export interface ConflictChoiceCopy {
  label: string;
  note: string;
}

export interface ConflictBannerOptions {
  /** The part class after `sce-part-`: `draft-conflict` or `save-conflict`. */
  part: string;
  /** An extra class on the strip, for the score-file strip's own rule. */
  stripClass?: string;
  /** The words in the current language; called on every language change. */
  copy(): ConflictCopy;
  /** The two ways out, in the order of the copy's choices. */
  actions: readonly [() => Promise<void>, () => Promise<void>];
}

/** The shared banner: the strip, its Choose button and the dialog that holds the two choices. */
export interface ConflictBanner {
  readonly strip: HTMLElement;
  readonly choose: HTMLButtonElement;
  readonly choices: readonly HTMLButtonElement[];
  /** Applies `copy()` again after a language change. */
  apply(): void;
  /** Shows or hides the banner, revealing it in the chrome when it appears. */
  show(visible: boolean): void;
  destroy(): void;
}

/**
 * Builds the conflict banner on `parent`. The strip takes no focus and the editor keeps editing under it; pressing
 * `Choose` opens the two ways out in a native dialog under the strip, with the first one focused.
 */
export function mountConflictBanner(parent: HTMLElement, options: ConflictBannerOptions): ConflictBanner {
  const doc = parent.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const root = create(doc, "div", `sce-root sce-part sce-part-${options.part}`, parent);
  const strip = create(
    doc,
    "div",
    `sce-notice sce-draft-conflict${options.stripClass ? ` ${options.stripClass}` : ""}`,
    root,
  );
  strip.setAttribute("role", "group");
  const sentence = create(doc, "p", "sce-draft-conflict-text", strip);
  sentence.setAttribute("role", "alert");
  const choose = create(doc, "button", "sce-button sce-draft-choose", strip);
  choose.type = "button";
  choose.setAttribute("aria-haspopup", "dialog");
  choose.setAttribute("aria-expanded", "false");

  const popover = create(doc, "div", "sce-popover sce-draft-choices", root);
  popover.setAttribute("popover", "auto");
  popover.setAttribute("role", "dialog");
  choose.popoverTargetElement = popover;
  choose.popoverTargetAction = "toggle";

  const parts = options.actions.map((act) => {
    const button = create(doc, "button", "sce-button sce-draft-choice", popover);
    button.type = "button";
    const label = create(doc, "span", "sce-draft-label", button);
    const note = create(doc, "span", "sce-draft-note", button);
    note.setAttribute("aria-hidden", "true");
    button.addEventListener(
      "click",
      () => {
        if (busy) return;
        void run(act);
      },
      { signal },
    );
    return { button, label, note };
  }) as [
    { button: HTMLButtonElement; label: HTMLElement; note: HTMLElement },
    { button: HTMLButtonElement; label: HTMLElement; note: HTMLElement },
  ];

  /** One way out at a time: a second press while the first is being answered by the store does nothing. */
  let busy = false;
  async function run(act: () => Promise<void>): Promise<void> {
    busy = true;
    for (const { button } of parts) button.setAttribute("aria-disabled", "true");
    try {
      await act();
    } finally {
      busy = false;
      for (const { button } of parts) button.setAttribute("aria-disabled", "false");
    }
  }

  const anchor = () => anchorOf(strip);
  /** The room left under the banner inside the editor's own box, so the choices do not run past the music it keeps. */
  const room = (): number | undefined => {
    const view = doc.defaultView;
    if (view === null) return undefined;
    const editor = strip.closest<HTMLElement>(".sce-editor")?.getBoundingClientRect();
    const bottom = Math.min(view.innerHeight, editor?.bottom ?? view.innerHeight);
    return Math.max(1, bottom - 8 - (anchor().bottom + 4));
  };
  popover.addEventListener(
    "beforetoggle",
    (event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      const height = room();
      placeUnder(anchor(), popover, height === undefined ? {} : { maxHeight: height });
    },
    { signal },
  );
  popover.addEventListener(
    "toggle",
    (event) => {
      const open = (event as ToggleEvent).newState === "open";
      choose.setAttribute("aria-expanded", String(open));
      if (!open) {
        if (!strip.hidden) choose.focus();
        return;
      }
      const height = room();
      keepInside(popover, anchor(), height === undefined ? {} : { maxHeight: height });
      parts[0].button.focus();
    },
    { signal },
  );

  function apply(): void {
    const copy = options.copy();
    strip.setAttribute("aria-label", copy.name);
    popover.setAttribute("aria-label", copy.name);
    sentence.textContent = copy.sentence;
    choose.textContent = copy.choose;
    for (const [index, part] of parts.entries()) {
      const choice = copy.choices[index];
      if (choice === undefined) continue;
      part.label.textContent = choice.label;
      part.note.textContent = choice.note;
      part.button.setAttribute("aria-description", choice.note);
    }
  }

  let visible = false;
  function show(next: boolean): void {
    strip.hidden = !next;
    if (!next && popover.matches(":popover-open")) popover.hidePopover();
    if (next && !visible) revealConflictInChrome(strip);
    visible = next;
  }

  apply();
  for (const { button } of parts) button.setAttribute("aria-disabled", "false");
  return {
    strip,
    choose,
    choices: [parts[0].button, parts[1].button],
    apply,
    show,
    destroy() {
      abort.abort();
      root.remove();
    },
  };
}
