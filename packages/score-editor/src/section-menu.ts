// ABOUTME: The section menu of the time ruler: each section band opens a menu of what the commands can do to its section, and a form for the two choices that need a name.
// ABOUTME: Menus and the form are built for one drawing of the ruler and dropped with it; the focus and the view are carried over to the section that was acted on.
import { barIndexAt } from "./arrangement";
import { revealTick } from "./axis";
import type { ScoreCommand } from "./commands";
import { type Diagnostic, formatDiagnostic } from "./diagnostics";
import { create } from "./dom";
import type { Messages } from "./i18n";
import { type LiveRegion, sayRefusals } from "./live-region";
import { mountPopoverMenu, type PopoverMenu, placePopover } from "./popover-menu";
import type { Score, Section } from "./score";
import { type SectionAction, type SectionActionName, sectionActions } from "./section-actions";
import type { EditingSession } from "./session";
import type { AxisPartOptions } from "./types";

/** What the ruler asks of the section menu: wire it to a part root, draw it with the ruler, keep it right after every change. */
export interface SectionMenus {
  /** Binds the menu to the ruler's root, the listeners it adds going with `signal`, and the live region it speaks in. */
  attach(root: HTMLElement, signal: AbortSignal, live: LiveRegion): void;
  /**
   * Starts one drawing of the ruler, dropping what the one before it built. Returns what to call on each section band, in
   * the order they are drawn, with the band and the section's index in the score.
   */
  begin(canvas: HTMLElement, score: Score, t: Messages): (band: HTMLElement, section: number) => void;
  /** Shows or hides the controls for the session's `editable`, and gives the focus back to the section that had it. */
  refresh(): void;
  destroy(): void;
}

/** The section the focus goes to once the ruler has drawn again, found from the score that was drawn. */
interface Pending {
  readonly find: (score: Score) => number;
  /** Whether the view is scrolled to show the section: after a move or a copy, not after a redraw that changed nothing. */
  readonly reveal: boolean;
}

/** Everything built for one drawing of the ruler; the maps fill as the bands are drawn. */
interface Drawing {
  readonly abort: AbortController;
  readonly score: Score;
  readonly t: Messages;
  readonly container: HTMLElement;
  readonly bands: Map<number, HTMLElement>;
  readonly buttons: Map<number, HTMLButtonElement>;
  readonly menus: Map<number, PopoverMenu>;
  readonly form: NameForm;
}

/** One name form for one drawing: filled in and shown for a section, in one of three ways. */
interface NameForm {
  readonly element: HTMLElement;
  open(section: number, how: FormKind): void;
}

type FormKind = "rename" | "name" | "start";

/** A section's index among the bands, for the arrow keys: the indices of the sections that have a band, in order. */
function bandIndices(bands: ReadonlyMap<number, unknown>): number[] {
  return [...bands.keys()].sort((a, b) => a - b);
}

/** Where a menu or the form hangs from: the start of the band's name, the line under the band, and the band's top. */
function anchorOf(band: HTMLElement): { left: number; bottom: number; top: number } {
  const box = band.getBoundingClientRect();
  const name = band.querySelector(".sce-section-name")?.getBoundingClientRect();
  return { left: Math.max(8, name?.left ?? box.left), bottom: box.bottom, top: box.top };
}

export function createSectionMenus(session: EditingSession, options: AxisPartOptions = {}): SectionMenus {
  let root: HTMLElement | null = null;
  let live: LiveRegion | null = null;
  let say: ((diagnostics: ReadonlyArray<Diagnostic>) => void) | null = null;
  let pending: Pending | null = null;
  let lastEditable: boolean | null = null;

  let drawing: Drawing | null = null;

  function speak(words: string): void {
    live?.say(words);
  }

  /** Puts the focus on the section `pending` names, and brings it into view when asked. */
  function settle(): void {
    const wanted = pending;
    pending = null;
    if (!wanted || !drawing) return;
    const indices = bandIndices(drawing.buttons);
    const target = wanted.find(drawing.score);
    const index = indices.find((found) => found >= target) ?? indices[indices.length - 1];
    if (index === undefined) return;
    drawing.buttons.get(index)?.focus({ preventScroll: true });
    const section = drawing.score.sections[index];
    const first = section === undefined ? undefined : drawing.score.bars[section.firstBar];
    if (wanted.reveal && first) revealTick(session, first.start);
  }

  /** Dispatches `command` with the focus it should leave, or hands its refusal to `onRefused` and keeps nothing pending. */
  function dispatch(
    command: ScoreCommand,
    next: Pending,
    onRefused: (diagnostics: ReadonlyArray<Diagnostic>) => void,
  ): boolean {
    pending = next;
    const result = session.dispatch(command);
    if (!result.ok) {
      pending = null;
      onRefused(result.diagnostics);
      return false;
    }
    return true;
  }

  /** Runs `command`, then says `words` and moves the focus. A refusal changes nothing and is told the way a refused key is. */
  function run(command: ScoreCommand, next: Pending, words: string): boolean {
    if (!dispatch(command, next, (diagnostics) => say?.(diagnostics))) return false;
    speak(words);
    settle();
    return true;
  }

  /** The bar typed in the form, counted from 0 as the commands count it; an empty field is no bar at all. */
  function typedBar(input: HTMLInputElement): number {
    const typed = input.value.trim();
    return typed === "" ? Number.NaN : Number(typed) - 1;
  }

  /** The section that holds a bar, and whether that bar starts it. `null` when the bar is no bar of this score. */
  function sectionAt(
    score: Score,
    bar: number,
  ): { readonly section: Section; readonly index: number; readonly starts: boolean } | null {
    if (!Number.isInteger(bar) || bar < 0 || bar >= score.bars.length) return null;
    const index = score.sections.findIndex(
      (each) => each.barCount > 0 && bar >= each.firstBar && bar < each.firstBar + each.barCount,
    );
    const section = score.sections[index];
    if (index < 0 || section === undefined) return null;
    return { section, index, starts: section.firstBar === bar };
  }

  function nameFormFor(draw: Omit<Drawing, "form">): NameForm {
    const { t, score, container } = draw;
    const doc = container.ownerDocument;
    const signal = draw.abort.signal;
    const element = create(doc, "div", "sce-popover sce-section-form", container);
    element.setAttribute("popover", "auto");
    element.setAttribute("role", "dialog");
    const form = create(doc, "form", "sce-form", element);
    form.noValidate = true;

    const field = (label: string): { wrap: HTMLLabelElement; input: HTMLInputElement } => {
      const wrap = create(doc, "label", "sce-form-field", form);
      create(doc, "span", "sce-form-label", wrap).textContent = label;
      const input = create(doc, "input", "sce-form-input", wrap);
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
      return { wrap, input };
    };
    const covers = create(doc, "p", "sce-form-hint", form);
    const bar = field(t.sectionFormBar);
    bar.input.inputMode = "numeric";
    const renames = create(doc, "p", "sce-form-hint", form);
    const name = field(t.sectionFormName);
    const error = create(doc, "p", "sce-form-error", form);
    error.setAttribute("role", "alert");
    error.hidden = true;
    const actions = create(doc, "div", "sce-form-actions", form);
    const cancel = create(doc, "button", "sce-button", actions);
    cancel.type = "button";
    cancel.textContent = t.sectionFormCancel;
    const confirm = create(doc, "button", "sce-button sce-button-strong", actions);
    confirm.type = "submit";

    let current: { section: number; how: FormKind } | null = null;

    function showError(words: string, input: HTMLInputElement): void {
      error.textContent = words;
      error.hidden = false;
      input.closest("label")?.after(error);
      for (const each of [bar.input, name.input]) each.removeAttribute("aria-invalid");
      input.setAttribute("aria-invalid", "true");
      input.focus();
    }
    function clearError(): void {
      error.hidden = true;
      error.textContent = "";
      for (const each of [bar.input, name.input]) each.removeAttribute("aria-invalid");
    }

    /** The context line, the hint under the bar and the confirm label for the form's current kind and typed bar. */
    function updateForm(): void {
      if (!current) return;
      const { section: opened, how } = current;
      const found = score.sections[opened];
      if (!found) return;
      let context = t.sectionFormCovers(found.firstBar + 1, found.firstBar + found.barCount);
      let hint = "";
      let confirmLabel =
        how === "rename" ? t.sectionRename : how === "name" ? t.sectionConfirmName : t.sectionConfirmStart;
      if (how === "start") {
        const at = typedBar(bar.input);
        const target = sectionAt(score, at);
        if (target?.starts) {
          hint = t.sectionFormRenames(target.section.name, at + 1);
          confirmLabel = target.section.name === null ? t.sectionConfirmName : t.sectionRename;
        } else if (target && target.index !== opened) {
          context = t.sectionFormBarCovers(
            target.section.name,
            at + 1,
            target.section.firstBar + 1,
            target.section.firstBar + target.section.barCount,
          );
        }
        // A description and not an id, since ids come from a counter that two editors on a page would share.
        bar.input.setAttribute("aria-description", [context, hint].filter(Boolean).join(" "));
      } else bar.input.removeAttribute("aria-description");
      covers.textContent = context;
      renames.textContent = hint;
      renames.hidden = hint === "";
      confirm.textContent = confirmLabel;
    }
    bar.input.addEventListener("input", clearError, { signal });
    bar.input.addEventListener("input", updateForm, { signal });
    name.input.addEventListener("input", clearError, { signal });
    cancel.addEventListener("click", () => element.hidePopover(), { signal });

    form.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        if (!current) return;
        const { section: opened, how } = current;
        const typed = name.input.value;
        const language = session.view.language;
        const refused = (diagnostics: ReadonlyArray<Diagnostic>, input: HTMLInputElement): void => {
          const first = diagnostics[0];
          if (first) showError(formatDiagnostic(first, language), input);
          options.onRefused?.(diagnostics);
        };
        if (how === "start") {
          const at = typedBar(bar.input);
          const target = sectionAt(score, at);
          const command: ScoreCommand = { type: "nameSection", bar: at, name: typed };
          const onRefused = (diagnostics: ReadonlyArray<Diagnostic>): void =>
            refused(diagnostics, diagnostics[0]?.code === "bar-out-of-range" ? bar.input : name.input);
          const find = (found: Score) => found.sections.findIndex((each) => each.firstBar === at);
          if (!dispatch(command, { find, reveal: true }, onRefused)) return;
          closeForm();
          if (target?.starts) speak(t.sectionRenamed(target.section.name, typed));
          else speak(t.sectionStarted(typed, at + 1));
          settle();
          return;
        }
        const before = score.sections[opened]?.name ?? null;
        const command: ScoreCommand = { type: "renameSection", section: opened, name: typed };
        const onRefused = (diagnostics: ReadonlyArray<Diagnostic>): void => refused(diagnostics, name.input);
        if (!dispatch(command, { find: () => opened, reveal: false }, onRefused)) return;
        closeForm();
        speak(t.sectionRenamed(before, typed));
        settle();
      },
      { signal },
    );

    /** The form may already have gone with a drawing that the command made; then there is nothing to close. */
    function closeForm(): void {
      if (element.isConnected && element.matches(":popover-open")) element.hidePopover();
    }

    return {
      element,
      open(section, how) {
        const found = score.sections[section];
        if (!found) return;
        current = { section, how };
        clearError();
        const title = how === "rename" ? t.sectionRename : how === "name" ? t.sectionNameIt : t.sectionStart;
        element.setAttribute("aria-label", title);
        bar.wrap.hidden = how !== "start";
        name.input.value = how === "rename" ? (found.name ?? "") : "";
        const point = session.insertionPoint;
        // A bar offered by default is inside this section and does not start it, since a bar that starts a section renames it:
        // the insertion point's bar when it is such a bar, else the section's second bar.
        const second = found.barCount >= 2 ? found.firstBar + 2 : null;
        const at = point === null ? -1 : barIndexAt(score.bars, point.tick);
        const inside = at > found.firstBar && at < found.firstBar + found.barCount;
        const start = inside ? at + 1 : second;
        bar.input.value = start === null ? "" : String(start);
        updateForm();
        element.showPopover();
        const band = draw.bands.get(section);
        if (band) {
          const place = anchorOf(band);
          placePopover(element, place, place.top);
        }
        const focus = how === "start" ? bar.input : name.input;
        focus.focus();
        focus.select();
      },
    };
  }

  function buildBand(draw: Drawing, band: HTMLElement, index: number): void {
    const { t, score, container } = draw;
    const section = score.sections[index];
    if (!section) return;
    const doc = band.ownerDocument;
    const signal = draw.abort.signal;
    const label = t.sectionButton(section.name);

    const button = create(doc, "button", "sce-section-open", band);
    button.type = "button";
    button.tabIndex = -1;
    button.setAttribute("aria-label", label);
    draw.buttons.set(index, button);
    draw.bands.set(index, band);
    const menu = mountPopoverMenu(container, button, signal, { anchor: () => anchorOf(band) });
    draw.menus.set(index, menu);
    menu.element.setAttribute("aria-label", label);

    let latest: ReadonlyArray<SectionAction> | null = null;
    const choices = new Map<SectionActionName, { item: HTMLButtonElement; note: HTMLElement }>();
    const choice = (name: SectionActionName, words: string, choose: () => void): void => {
      const item = menu.item("menuitem", choose);
      item.textContent = words;
      // The note is for the eye and is hidden from assistive technology, so it adds no child to the menu there: each muted
      // item already carries the same words as its description.
      const note = create(doc, "div", "sce-menu-note", menu.element);
      note.setAttribute("aria-hidden", "true");
      note.hidden = true;
      choices.set(name, { item, note });
    };
    const act = (name: "move-earlier" | "move-later" | "duplicate" | "delete") => (): void => {
      const command = latest?.find((found) => found.name === name)?.command;
      if (!command) return;
      const current = score.sections[index]?.name ?? null;
      if (name === "delete") {
        run(
          command,
          { find: (found) => Math.min(index, found.sections.length - 1), reveal: true },
          t.sectionDeleted(current),
        );
      } else if (name === "duplicate") {
        run(command, { find: () => index + 1, reveal: true }, t.sectionDuplicated(current));
      } else {
        const direction = name === "move-earlier" ? "earlier" : "later";
        const to = name === "move-earlier" ? index - 1 : index + 1;
        run(command, { find: () => to, reveal: true }, t.sectionMoved(current, direction));
      }
    };

    // The choices are made when the menu first opens, so the bands of a long song hold two nodes each until one is pressed.
    let filled = false;
    const fill = (): void => {
      if (filled) return;
      filled = true;
      const naming: FormKind = section.name === null ? "name" : "rename";
      choice("rename", `${section.name === null ? t.sectionNameIt : t.sectionRename}…`, () =>
        draw.form.open(index, naming),
      );
      choice("start", `${t.sectionStart}…`, () => draw.form.open(index, "start"));
      menu.rule();
      choice("move-earlier", t.sectionMoveEarlier, act("move-earlier"));
      choice("move-later", t.sectionMoveLater, act("move-later"));
      choice("duplicate", t.sectionDuplicate, act("duplicate"));
      menu.rule();
      choice("delete", t.sectionDelete, act("delete"));
    };

    // A choice the commands would refuse is muted and says why; pressing it does nothing and leaves the menu open.
    // Muted choices that are refused in the same words, side by side, share one note under the last of them.
    menu.element.addEventListener(
      "click",
      (event) => {
        const muted =
          event.target instanceof Element ? event.target.closest('.sce-menu-item[aria-disabled="true"]') : null;
        if (muted) {
          event.stopPropagation();
          speak(muted.getAttribute("aria-description") ?? "");
        }
      },
      { capture: true, signal },
    );
    menu.element.addEventListener(
      "beforetoggle",
      (event) => {
        if ((event as ToggleEvent).newState !== "open") return;
        fill();
        latest = sectionActions(session, index);
        const language = session.view.language;
        const entries = [...choices.entries()].map(([name, found]) => {
          const why = latest?.find((action) => action.name === name)?.unavailable ?? null;
          return { ...found, words: why === null ? null : formatDiagnostic(why, language) };
        });
        for (const [at, { item, note, words }] of entries.entries()) {
          item.setAttribute("aria-disabled", String(words !== null));
          if (words === null) item.removeAttribute("aria-description");
          else item.setAttribute("aria-description", words);
          const next = entries[at + 1];
          const speaks = words !== null && next?.words !== words;
          note.hidden = !speaks;
          note.textContent = speaks ? words : "";
        }
      },
      { signal },
    );

    const open = (): void => {
      if (!button.isConnected || menu.element.matches(":popover-open")) return;
      button.focus();
      menu.element.showPopover();
    };
    band.addEventListener(
      "contextmenu",
      (event) => {
        if (!session.view.editable) return;
        event.preventDefault();
        open();
      },
      { signal },
    );
    button.addEventListener(
      "keydown",
      (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const order = bandIndices(draw.buttons);
        const at = order.indexOf(index);
        let to: number | undefined;
        if (event.key === "ArrowLeft") to = order[at - 1];
        else if (event.key === "ArrowRight") to = order[at + 1];
        else if (event.key === "Home") to = order[0];
        else if (event.key === "End") to = order[order.length - 1];
        else return;
        event.preventDefault();
        if (to !== undefined) draw.buttons.get(to)?.focus();
      },
      { signal },
    );
  }

  /** Opens the menu of the section the insertion point is in, or the first section that has a band. */
  function openFromKeyboard(): void {
    if (!drawing) return;
    const { score, buttons, menus } = drawing;
    const point = session.insertionPoint;
    const at = point === null ? 0 : barIndexAt(score.bars, point.tick);
    const index = score.sections.findIndex((found) => at >= found.firstBar && at < found.firstBar + found.barCount);
    const order = bandIndices(buttons);
    const chosen = buttons.has(index) ? index : order[0];
    if (chosen === undefined) return;
    const menu = menus.get(chosen);
    buttons.get(chosen)?.focus();
    if (menu && !menu.element.matches(":popover-open")) menu.element.showPopover();
  }

  function closeEverything(): void {
    if (!drawing) return;
    for (const menu of drawing.menus.values()) {
      if (menu.element.isConnected && menu.element.matches(":popover-open")) menu.element.hidePopover();
    }
    const form = drawing.form.element;
    if (form.isConnected && form.matches(":popover-open")) form.hidePopover();
  }

  return {
    attach(own, signal, region) {
      root = own;
      live = region;
      own.setAttribute("data-editable", String(session.view.editable));
      say = sayRefusals(region, session, options.onRefused);
      const surface = options.scroller ?? own;
      surface.addEventListener(
        "keydown",
        (event) => {
          const asks = event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
          if (!asks || event.defaultPrevented || event.isComposing || !drawing || !session.view.editable) return;
          const target = event.target;
          const onBand = target instanceof Element && target.closest(".sce-section-open") !== null;
          if (target !== surface && !onBand) return;
          event.preventDefault();
          if (onBand && target instanceof Element) {
            const button = target.closest(".sce-section-open");
            const entry = [...drawing.buttons].find(([, found]) => found === button);
            const menu = entry === undefined ? undefined : drawing.menus.get(entry[0]);
            if (menu && !menu.element.matches(":popover-open")) menu.element.showPopover();
            return;
          }
          openFromKeyboard();
        },
        { signal },
      );
      // Before the ruler draws again, note which band holds the focus, so the redraw can give it back.
      const unsubscribe = session.subscribe(() => {
        if (pending !== null || !drawing) return;
        const active = (own.getRootNode() as Document | ShadowRoot).activeElement;
        const entry = [...drawing.buttons].find(([, found]) => found === active);
        if (entry) pending = { find: () => entry[0], reveal: false };
      });
      signal.addEventListener("abort", unsubscribe, { once: true });
    },
    begin(canvas, score, t) {
      drawing?.abort.abort();
      lastEditable = null;
      const doc = canvas.ownerDocument;
      const container = create(doc, "div", "sce-section-menus", canvas);
      const base = {
        abort: new AbortController(),
        score,
        t,
        container,
        bands: new Map<number, HTMLElement>(),
        buttons: new Map<number, HTMLButtonElement>(),
        menus: new Map<number, PopoverMenu>(),
      };
      const draw: Drawing = { ...base, form: nameFormFor(base) };
      drawing = draw;
      return (band, index) => buildBand(draw, band, index);
    },
    refresh() {
      if (!drawing || !root) return;
      const editable = session.view.editable;
      if (editable !== lastEditable) {
        lastEditable = editable;
        root.setAttribute("data-editable", String(editable));
        for (const button of drawing.buttons.values()) button.hidden = !editable;
        if (!editable) closeEverything();
      }
      settle();
    },
    destroy() {
      drawing?.abort.abort();
      drawing = null;
      pending = null;
    },
  };
}
