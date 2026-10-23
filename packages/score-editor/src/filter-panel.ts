// ABOUTME: The Filter panel view part: a button that opens a panel of conditions, and the selection those conditions make.
// ABOUTME: It selects through the session, so it works while the session is read-only, and it adds nothing to the history.

import { pitchName } from "./arrangement";
import { create, requireDom } from "./dom";
import { type FilterMessages, filterMessagesFor } from "./filter-messages";
import { countNotes, filterNotes, type NoteFilter, type NoteSummary, summarizeNotes } from "./filter-notes";
import { FILTER_SHEET_QUERY } from "./filter-styles";
import type { Score } from "./score";
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
  readonly notes: number;
  readonly total: number;
}

/** The conditions as the panel holds them: what each one is set to, and whether it counts. */
interface Conditions {
  pitch: { on: boolean; min: number | null; max: number | null };
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

  /** A condition's row: a checkbox that says whether it counts, with its name, and a place for its fields. */
  function conditionRow(name: string, label: (t: FilterMessages) => string) {
    const row = create(doc, "div", "sce-filter-row", rows);
    row.dataset.condition = name;
    row.setAttribute("role", "group");
    const checkLabel = create(doc, "label", "sce-filter-check", row);
    const check = create(doc, "input", "", checkLabel);
    check.type = "checkbox";
    const text = create(doc, "span", "sce-filter-name", checkLabel);
    const fields = create(doc, "div", "sce-filter-fields", row);
    texts.push((t) => {
      text.textContent = label(t);
      row.setAttribute("aria-label", label(t));
    });
    return { row, check, fields };
  }

  function select(parent: HTMLElement, label: (t: FilterMessages) => string): HTMLSelectElement {
    const field = create(doc, "select", "sce-filter-select", parent);
    texts.push((t) => field.setAttribute("aria-label", label(t)));
    return field;
  }

  function word(parent: HTMLElement, label: (t: FilterMessages) => string): void {
    const span = create(doc, "span", "sce-filter-word", parent);
    texts.push((t) => {
      span.textContent = label(t);
    });
  }

  const pitch = conditionRow("pitch", (t) => t.pitch);
  const pitchLowest = select(pitch.fields, (t) => t.pitchLowest);
  word(pitch.fields, (t) => t.to);
  const pitchHighest = select(pitch.fields, (t) => t.pitchHighest);

  const status = create(doc, "div", "sce-filter-status", panel);
  status.setAttribute("role", "status");
  const actions = create(doc, "div", "sce-filter-actions", panel);
  const done = create(doc, "button", "sce-button", actions);
  done.type = "button";

  const conditions: Conditions = { pitch: { on: false, min: null, max: null } };
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
    done.textContent = t.done;
    for (const apply of texts) apply(t);
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
      field.replaceChildren(
        ...values.map((midi) => {
          const option = doc.createElement("option");
          option.value = String(midi);
          option.textContent = pitchName(midi);
          return option;
        }),
      );
      if (kept !== null) field.value = String(kept);
    }
    pitch.check.checked = conditions.pitch.on;
  }

  /** Takes what the person set in a field of the panel into the conditions. */
  function read(): void {
    conditions.pitch.on = pitch.check.checked;
    if (pitchLowest.value !== "") conditions.pitch.min = Number(pitchLowest.value);
    if (pitchHighest.value !== "") conditions.pitch.max = Number(pitchHighest.value);
  }

  function currentFilter(): { filter: NoteFilter; count: number } {
    const filter: { pitch?: { min: number; max: number } } = {};
    let count = 0;
    const { pitch: p } = conditions;
    if (p.on && p.min !== null && p.max !== null) {
      filter.pitch = { min: p.min, max: p.max };
      count += 1;
    }
    return { filter, count };
  }

  let applied: Applied | null = null;
  let applying = false;

  /** Selects the notes the panel's conditions pick in the score as it is now, and notes what was selected. */
  function apply(): void {
    const { reading } = session;
    if (reading.kind !== "score") return;
    const { filter, count } = currentFilter();
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
      text = t.statusNone;
    } else {
      text = t.statusSelected(applied.notes, applied.total);
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
      const check = row?.querySelector<HTMLInputElement>(".sce-filter-check input");
      // Changing a field of a condition turns the condition on; the checkbox itself turns it on or off.
      if (check && target !== check) check.checked = true;
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
