// ABOUTME: The Filter panel view part: a button that opens a panel of conditions, and the selection those conditions make.
// ABOUTME: It selects through the session, so it works while the session is read-only, and it adds nothing to the history.

import { pitchName } from "./arrangement";
import { create, requireDom } from "./dom";
import { createConditions, currentFilter, readConditions } from "./filter-conditions";
import { type FilterMessages, filterMessagesFor } from "./filter-messages";
import { countNotes, filterNotes, type NoteSummary, summarizeNotes } from "./filter-notes";
import { FILTER_SHEET_QUERY } from "./filter-styles";
import type { Score } from "./score";
import { TICKS_PER_QUARTER } from "./score";
import type { EditingSession, ScoreReading } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";
import { arrangementShown } from "./view-rules";

/** What the last selection of the panel was made from and came to, to tell whether it still holds. */
interface Applied {
  readonly scoreText: string;
  readonly ids: ReadonlySet<string>;
  /** How many conditions were on. With none, the panel selected nothing. */
  readonly conditions: number;
  /** Whether a condition that was on cannot match any note: a range with its ends crossed, or a count that is not one. */
  readonly invalid: boolean;
  readonly notes: number;
  readonly total: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** A length in ticks as a part of a whole note, the way a grid names a note value: 256 is 1/4, 384 is 3/8, 1024 is 1/1. */
function lengthName(ticks: number): string {
  const whole = 4 * TICKS_PER_QUARTER;
  const divisor = gcd(ticks, whole);
  return `${ticks / divisor}/${whole / divisor}`;
}

function sameIds(a: ReadonlySet<string>, b: ReadonlyArray<string>): boolean {
  return a.size === b.length && b.every((id) => a.has(id));
}

/**
 * Mounts the Filter button on `el`. It opens a panel of conditions (pitch, time, length, key, count, and invert) that
 * selects the notes that satisfy them through `session.select`, each time a condition is changed or Re-apply is pressed.
 * The panel keeps its conditions, so it always shows those of the last selection it made. Selecting is not an edit: the
 * history gets no step, and the part works while the session is read-only. The button is there while the score reads
 * and the arrangement is shown, the one view with notes to select. It follows the session's language.
 */
export function mountFilterPanel(el: HTMLElement, session: EditingSession): ViewPart {
  requireDom("mountFilterPanel");
  const doc = el.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-filter");
  el.appendChild(root);

  const button = create(doc, "button", "sce-button sce-select-button sce-filter-button", root);
  button.type = "button";
  const panel = create(doc, "div", "sce-popover sce-filter-panel", root);
  panel.setAttribute("popover", "auto");
  panel.setAttribute("role", "dialog");
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.popoverTargetElement = panel;
  button.popoverTargetAction = "toggle";

  const title = create(doc, "div", "sce-filter-title", panel);
  const rows = create(doc, "div", "sce-filter-rows", panel);
  const texts: Array<(t: FilterMessages) => void> = [];

  /** The checkbox each condition row holds, so a change anywhere in the row can find it without searching by class. */
  const rowChecks = new WeakMap<HTMLElement, HTMLInputElement>();

  /** A condition's row: a checkbox that says whether it counts, with its name, and a place for its fields. */
  function conditionRow(label: (t: FilterMessages) => string) {
    const row = create(doc, "div", "sce-filter-row", rows);
    row.setAttribute("role", "group");
    const checkLabel = create(doc, "label", "sce-filter-check", row);
    const check = create(doc, "input", "", checkLabel);
    check.type = "checkbox";
    rowChecks.set(row, check);
    const text = create(doc, "span", "sce-filter-name", checkLabel);
    const fields = create(doc, "div", "sce-filter-fields", row);
    texts.push((t) => {
      text.textContent = label(t);
      row.setAttribute("aria-label", label(t));
    });
    return { row, check, fields };
  }

  /** One option of a menu, built the one way every menu in the panel builds it. */
  function option(value: string, text: string): HTMLOptionElement {
    const built = doc.createElement("option");
    built.value = value;
    built.textContent = text;
    return built;
  }

  function select(parent: HTMLElement, label: (t: FilterMessages) => string): HTMLSelectElement {
    const field = create(doc, "select", "sce-filter-select", parent);
    texts.push((t) => field.setAttribute("aria-label", label(t)));
    return field;
  }

  function number(parent: HTMLElement, label: (t: FilterMessages) => string): HTMLInputElement {
    const field = create(doc, "input", "sce-filter-number", parent);
    field.type = "number";
    field.inputMode = "numeric";
    texts.push((t) => field.setAttribute("aria-label", label(t)));
    return field;
  }

  function word(parent: HTMLElement, label: (t: FilterMessages) => string): void {
    const span = create(doc, "span", "sce-filter-word", parent);
    texts.push((t) => {
      span.textContent = label(t);
    });
  }

  const pitch = conditionRow((t) => t.pitch);
  const pitchLowest = select(pitch.fields, (t) => t.pitchLowest);
  word(pitch.fields, (t) => t.to);
  const pitchHighest = select(pitch.fields, (t) => t.pitchHighest);

  const time = conditionRow((t) => t.time);
  word(time.fields, (t) => t.timeBars);
  const timeFirst = number(time.fields, (t) => t.timeFirst);
  word(time.fields, (t) => t.to);
  const timeLast = number(time.fields, (t) => t.timeLast);

  const length = conditionRow((t) => t.length);
  const lengthShortest = select(length.fields, (t) => t.lengthShortest);
  word(length.fields, (t) => t.to);
  const lengthLongest = select(length.fields, (t) => t.lengthLongest);

  const key = conditionRow((t) => t.key);
  const keyChoice = select(key.fields, (t) => t.keyChoice);

  // Each number keeps the words around it on one line, so a line breaks between the two numbers and not inside one.
  const count = conditionRow((t) => t.count);
  const countEveryPhrase = create(doc, "span", "sce-filter-phrase", count.fields);
  word(countEveryPhrase, (t) => t.countEveryBefore);
  const countEvery = number(countEveryPhrase, (t) => t.countEvery);
  word(countEveryPhrase, (t) => t.countEveryAfter);
  const countSkipPhrase = create(doc, "span", "sce-filter-phrase", count.fields);
  word(countSkipPhrase, (t) => t.countSkipBefore);
  const countSkip = number(countSkipPhrase, (t) => t.countSkip);
  word(countSkipPhrase, (t) => t.countSkipAfter);

  const invertLabel = create(doc, "label", "sce-filter-check sce-filter-invert", rows);
  const invert = create(doc, "input", "", invertLabel);
  invert.type = "checkbox";
  const invertName = create(doc, "span", "sce-filter-name", invertLabel);
  const invertHint = create(doc, "span", "sce-filter-hint", invertLabel);
  texts.push((t) => {
    invertName.textContent = t.invert;
    invertHint.textContent = t.invertHint;
  });

  // The status and the buttons stay at the bottom edge while the conditions scroll, so the result is in view as they change.
  const footer = create(doc, "div", "sce-filter-footer", panel);
  const status = create(doc, "div", "sce-filter-status", footer);
  status.setAttribute("role", "status");
  const actions = create(doc, "div", "sce-filter-actions", footer);
  const reapply = create(doc, "button", "sce-button", actions);
  reapply.type = "button";
  const done = create(doc, "button", "sce-button", actions);
  done.type = "button";

  const conditions = createConditions();
  /** The reading the open panel was last filled from. */
  let rendered: ScoreReading | null = null;
  let language: Language | null = null;
  let t: FilterMessages = filterMessagesFor(session.view.language);
  function applyLanguage(): void {
    language = session.view.language;
    t = filterMessagesFor(language);
    root.lang = language;
    button.textContent = t.button;
    button.title = t.buttonTip;
    panel.setAttribute("aria-label", t.panel);
    title.textContent = t.panel;
    reapply.textContent = t.reapply;
    done.textContent = t.done;
    for (const apply of texts) apply(t);
    const { reading } = session;
    if (reading.kind === "score" && panel.matches(":popover-open")) render(reading.score);
    renderStatus(true);
  }

  let summary: { score: Score; value: NoteSummary } | null = null;
  function summaryOf(score: Score): NoteSummary {
    if (summary?.score !== score) summary = { score, value: summarizeNotes(score) };
    return summary.value;
  }

  /**
   * Fills the fields from the conditions and the score. The pitches offered run from the lowest to the highest note of
   * the score, a semitone at a time. The fields are filled when the panel opens and while it is open, so a closed panel
   * leaves no options in the page; the first time they are filled, the pitch range is the whole range of the score.
   */
  function render(score: Score): void {
    const { lowest, highest } = summaryOf(score);
    if (conditions.pitch.min === null) conditions.pitch.min = lowest;
    if (conditions.pitch.max === null) conditions.pitch.max = highest;
    const wanted: number[] = [];
    if (lowest !== null && highest !== null) for (let midi = lowest; midi <= highest; midi++) wanted.push(midi);
    for (const [field, kept] of [
      [pitchLowest, conditions.pitch.min],
      [pitchHighest, conditions.pitch.max],
    ] as const) {
      const values = kept !== null && !wanted.includes(kept) ? [...wanted, kept].sort((a, b) => a - b) : wanted;
      field.replaceChildren(...values.map((midi) => option(String(midi), pitchName(midi))));
      if (kept !== null) field.value = String(kept);
    }
    pitch.check.checked = conditions.pitch.on;

    const bars = score.bars.length;
    if (conditions.time.first === null) conditions.time.first = 1;
    if (conditions.time.last === null) conditions.time.last = bars;
    for (const [field, kept] of [
      [timeFirst, conditions.time.first],
      [timeLast, conditions.time.last],
    ] as const) {
      field.value = String(kept);
    }
    time.check.checked = conditions.time.on;

    const { durations } = summaryOf(score);
    if (conditions.length.min === null) conditions.length.min = durations[0] ?? null;
    if (conditions.length.max === null) conditions.length.max = durations[durations.length - 1] ?? null;
    for (const [field, kept] of [
      [lengthShortest, conditions.length.min],
      [lengthLongest, conditions.length.max],
    ] as const) {
      const values =
        kept !== null && !durations.includes(kept) ? [...durations, kept].sort((a, b) => a - b) : durations;
      field.replaceChildren(...values.map((ticks) => option(String(ticks), lengthName(ticks))));
      if (kept !== null) field.value = String(kept);
    }
    length.check.checked = conditions.length.on;

    keyChoice.replaceChildren(
      ...(["in", "out"] as const).map((mode) => option(mode, mode === "in" ? t.keyIn : t.keyOut)),
    );
    keyChoice.value = conditions.key.mode;
    key.check.checked = conditions.key.on;

    countEvery.value = conditions.count.every === null ? "" : String(conditions.count.every);
    countSkip.value = conditions.count.skip === null ? "" : String(conditions.count.skip);
    count.check.checked = conditions.count.on;
    invert.checked = conditions.invert;
  }

  /** Takes what the person set in the fields into the conditions. */
  function read(): void {
    readConditions(conditions, {
      pitch: { on: pitch.check.checked, min: pitchLowest.value, max: pitchHighest.value },
      time: { on: time.check.checked, first: timeFirst.value, last: timeLast.value },
      length: { on: length.check.checked, min: lengthShortest.value, max: lengthLongest.value },
      key: { on: key.check.checked, mode: keyChoice.value },
      count: { on: count.check.checked, every: countEvery.value, skip: countSkip.value },
      invert: invert.checked,
    });
  }

  let applied: Applied | null = null;
  let applying = false;

  /** Selects the notes the panel's conditions pick in the score as it is now, and notes what was selected. */
  function apply(): void {
    const { reading } = session;
    if (reading.kind !== "score") return;
    const { filter, count, invalid } = currentFilter(reading.score, conditions);
    if (countSkip.value === "" && conditions.count.skip === null) {
      // A cleared Skip is 0, the filter's default, so the field shows the number that is in force.
      conditions.count.skip = 0;
      countSkip.value = "0";
    }
    applying = true;
    try {
      session.select(count === 0 ? [] : filterNotes(reading.score, filter));
    } finally {
      applying = false;
    }
    applied = {
      scoreText: session.project.score,
      ids: new Set(session.selection),
      conditions: count,
      invalid,
      notes: countNotes(reading.score, session.selection),
      total: summaryOf(reading.score).notes,
    };
    renderStatus();
  }

  let statusShown = "";
  function renderStatus(force = false): void {
    let state = "applied";
    let text: string;
    if (applied === null || applied.conditions === 0) {
      state = "idle";
      text = t.statusIdle;
    } else if (session.project.score !== applied.scoreText || !sameIds(applied.ids, session.selection)) {
      state = "stale";
      text = t.statusStale;
    } else if (applied.notes === 0) {
      text = applied.invalid ? t.statusNoneInvalid : t.statusNone;
    } else {
      text = session.view.editable
        ? t.statusSelected(applied.notes, applied.total)
        : t.statusSelectedReadOnly(applied.notes, applied.total);
    }
    status.dataset.state = state;
    if (text === statusShown && !force) return;
    statusShown = text;
    status.textContent = text;
  }

  panel.addEventListener(
    "change",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const row = target.closest<HTMLElement>(".sce-filter-row");
      const check = row === null ? undefined : rowChecks.get(row);
      // Changing a field of a condition turns the condition on; the checkbox itself turns it on or off.
      if (check && target !== check) check.checked = true;
      read();
      apply();
    },
    { signal },
  );
  reapply.addEventListener(
    "click",
    () => {
      read();
      apply();
    },
    { signal },
  );
  done.addEventListener("click", () => panel.hidePopover(), { signal });

  const isSheet = (): boolean => doc.defaultView?.matchMedia(FILTER_SHEET_QUERY).matches === true;
  panel.addEventListener(
    "beforetoggle",
    (event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      const { reading } = session;
      if (reading.kind === "score") {
        render(reading.score);
        rendered = reading;
      }
      if (isSheet()) {
        panel.style.left = "";
        panel.style.top = "";
        return;
      }
      const rect = button.getBoundingClientRect();
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.bottom + 4}px`;
    },
    { signal },
  );
  panel.addEventListener(
    "toggle",
    (event) => {
      const open = (event as ToggleEvent).newState === "open";
      button.setAttribute("aria-expanded", String(open));
      if (!open) return;
      const view = doc.defaultView;
      if (view && !isSheet()) {
        const rect = panel.getBoundingClientRect();
        const overflow = rect.right - (view.innerWidth - 8);
        if (overflow > 0) panel.style.left = `${Math.max(8, rect.left - overflow)}px`;
        // Under the button when there is room, else over it, else as high as the window allows.
        const room = view.innerHeight - 8;
        if (rect.bottom > room) {
          const over = button.getBoundingClientRect().top - 4 - rect.height;
          panel.style.top = `${over >= 8 ? over : Math.max(8, room - rect.height)}px`;
        }
      }
      panel.querySelector<HTMLElement>("input, select, button")?.focus();
    },
    { signal },
  );

  function draw(): void {
    if (session.view.language !== language) applyLanguage();
    const { reading } = session;
    const shown = reading.kind === "score" && arrangementShown(session);
    root.hidden = !shown;
    if (!shown) {
      if (panel.matches(":popover-open")) panel.hidePopover();
      return;
    }
    if (panel.matches(":popover-open") && reading !== rendered) render(reading.score);
    rendered = reading;
    if (!applying) renderStatus();
  }

  draw();
  const unsubscribe = session.subscribe(draw);
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      unsubscribe();
      root.remove();
      releaseStyles();
    },
  };
}
