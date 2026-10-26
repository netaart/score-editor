// ABOUTME: The toolbar's meter control: the target section's meter, the common meters the dialect allows, and a custom row.
// ABOUTME: It acts on the section of the first chosen bar, else of the insertion point's bar, else the first section.
import { barIndexAt, gridTicks } from "./arrangement";
import { create } from "./dom";
import { messagesFor } from "./i18n";
import { createLiveRegion, sayRefusals } from "./live-region";
import { meterAllowed, meterChoices } from "./meter";
import { nudgeIntoWindow, placeUnder } from "./popover-menu";
import type { Meter, Score } from "./score";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { EditingPartOptions, Language, ViewPart } from "./types";
import { arrangementShown } from "./view-rules";

interface Target {
  readonly bar: number;
  readonly section: number;
  readonly first: number;
  readonly last: number;
  readonly meter: Meter;
}

function targetOf(score: Score, session: EditingSession): Target | null {
  const bars = score.bars;
  if (bars.length === 0) return null;
  const tick = session.insertionPoint?.tick;
  const chosen =
    session.barSelection?.from ?? (tick === undefined ? 0 : barIndexAt(bars, Math.min(tick, gridTicks(score))));
  const bar = Math.max(0, Math.min(chosen, bars.length - 1));
  const section = score.sections.findIndex((found) => bar >= found.firstBar && bar < found.firstBar + found.barCount);
  const index = section < 0 ? 0 : section;
  const found = score.sections[index];
  const first = found?.firstBar ?? bar;
  const last = found === undefined ? bar : Math.min(bars.length - 1, found.firstBar + found.barCount - 1);
  const meter = bars[first]?.meter ?? bars[bar]?.meter;
  return meter === undefined ? null : { bar, section: index, first, last, meter };
}

/** The powers of two a meter rule allows, or the single allowed denominator when it is not restricted to powers of two. */
function denominators(min: number, max: number, powerOfTwo: boolean): number[] {
  const values: number[] = [];
  for (let value = Math.max(1, min); value <= max; value++) {
    if (!powerOfTwo || (value & (value - 1)) === 0) values.push(value);
  }
  return values;
}

/**
 * Mounts the meter control on `el`, at the end of the toolbar's controls. It is drawn while the session is editable, has
 * a score and shows the arrangement; its popover offers the common meters the dialect's rule allows and a custom pair.
 */
export function mountMeterControl(
  el: HTMLElement,
  session: EditingSession,
  options: EditingPartOptions = {},
): ViewPart {
  const doc = el.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-meter");
  el.appendChild(root);
  const live = createLiveRegion(root);
  const refused = sayRefusals(live, session, options.onRefused);

  const button = create(doc, "button", "sce-button sce-meter-button", root);
  button.type = "button";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  const menu = create(doc, "div", "sce-popover sce-meter-popover", root);
  menu.setAttribute("popover", "auto");
  menu.setAttribute("role", "dialog");
  button.popoverTargetElement = menu;
  button.popoverTargetAction = "toggle";
  let choices: HTMLButtonElement[] = [];

  function closeAndFocus(): void {
    menu.hidePopover();
    button.focus();
  }

  function apply(target: Target, meter: Meter): void {
    const result = session.dispatch({ type: "setSectionMeter", section: target.section, meter });
    if (!result.ok) {
      refused(result.diagnostics);
      return;
    }
    live.say(messagesFor(session.view.language).meterSet(target.section + 1, meter));
    closeAndFocus();
  }

  function renderMenu(target: Target): void {
    const t = messagesFor(session.view.language);
    menu.setAttribute(
      "aria-label",
      `${t.meter}: ${t.meterSection(target.section + 1, target.first + 1, target.last + 1)}`,
    );
    menu.replaceChildren();
    const summary = create(doc, "div", "sce-meter-summary", menu);
    summary.textContent = t.meterSection(target.section + 1, target.first + 1, target.last + 1);

    const group = create(doc, "div", "sce-meter-presets", menu);
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", t.meter);
    const constraints = session.constraints;
    const offered = constraints === null ? [] : meterChoices(constraints);
    if (constraints !== null && meterAllowed(target.meter, constraints.meter)) {
      if (
        !offered.some(
          (found) => found.numerator === target.meter.numerator && found.denominator === target.meter.denominator,
        )
      ) {
        offered.push(target.meter);
      }
    }
    choices = offered.map((meter) => {
      const choice = create(doc, "button", "sce-menu-item sce-meter-choice", group);
      choice.type = "button";
      choice.setAttribute("role", "radio");
      const checked = meter.numerator === target.meter.numerator && meter.denominator === target.meter.denominator;
      choice.setAttribute("aria-checked", String(checked));
      choice.textContent = t.meterText(meter);
      choice.addEventListener("click", () => apply(target, meter), { signal });
      return choice;
    });

    if (constraints === null) return;
    const custom = create(doc, "div", "sce-meter-custom", menu);
    create(doc, "span", "sce-meter-custom-label", custom).textContent = t.meterCustom;
    const beatsLabel = create(doc, "label", "sce-meter-field", custom);
    create(doc, "span", "sce-meter-field-label", beatsLabel).textContent = t.meterBeats;
    const beats = create(doc, "input", "sce-meter-input", beatsLabel);
    beats.type = "number";
    beats.min = String(constraints.meter.numerator.min);
    beats.max = String(constraints.meter.numerator.max);
    beats.step = "1";
    beats.value = String(target.meter.numerator);
    const valueLabel = create(doc, "label", "sce-meter-field", custom);
    create(doc, "span", "sce-meter-field-label", valueLabel).textContent = t.meterValue;
    const value = create(doc, "select", "sce-meter-input", valueLabel);
    for (const denominator of denominators(
      constraints.meter.denominator.min,
      constraints.meter.denominator.max,
      constraints.meter.denominator.powerOfTwo,
    )) {
      const option = create(doc, "option", "", value);
      option.value = String(denominator);
      option.textContent = String(denominator);
    }
    value.value = String(target.meter.denominator);
    const applyButton = create(doc, "button", "sce-button sce-meter-apply", custom);
    applyButton.type = "button";
    applyButton.textContent = t.meterApply;
    const submit = () => {
      const numerator = Number(beats.value);
      const denominator = Number(value.value);
      apply(target, { numerator, denominator });
    };
    applyButton.addEventListener("click", submit, { signal });
    for (const field of [beats, value] as HTMLElement[]) {
      field.addEventListener(
        "keydown",
        (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          submit();
        },
        { signal },
      );
    }
  }

  let language: Language | null = null;
  let drawn = "";
  function draw(): void {
    if (session.view.language !== language) {
      language = session.view.language;
      root.lang = language;
    }
    const t = messagesFor(session.view.language);
    const { reading, view } = session;
    const score = reading.kind === "score" ? reading.score : null;
    const target = score === null ? null : targetOf(score, session);
    const shown = score !== null && target !== null && view.editable && arrangementShown(session);
    const state = [shown, target?.section, target?.meter.numerator, target?.meter.denominator, view.language].join();
    if (state === drawn) return;
    drawn = state;
    root.hidden = !shown;
    if (!shown || target === null) return;
    const label = `${t.meter} ${t.meterText(target.meter)}`;
    button.textContent = label;
    button.setAttribute("aria-label", label);
    button.title = t.meterSection(target.section + 1, target.first + 1, target.last + 1);
  }

  menu.addEventListener(
    "beforetoggle",
    (event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      placeUnder(button, menu);
      const { reading } = session;
      const target = reading.kind === "score" ? targetOf(reading.score, session) : null;
      if (target !== null) renderMenu(target);
    },
    { signal },
  );
  menu.addEventListener(
    "toggle",
    (event) => {
      const open = (event as ToggleEvent).newState === "open";
      button.setAttribute("aria-expanded", String(open));
      if (!open) {
        if (menu.contains(doc.activeElement)) button.focus();
        return;
      }
      nudgeIntoWindow(menu);
      (choices.find((choice) => choice.getAttribute("aria-checked") === "true") ?? choices[0])?.focus();
    },
    { signal },
  );
  menu.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAndFocus();
        return;
      }
      if (!(event.target instanceof HTMLButtonElement)) return;
      const at = choices.indexOf(event.target);
      if (at < 0) return;
      let next = -1;
      if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (at + 1) % choices.length;
      else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (at - 1 + choices.length) % choices.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = choices.length - 1;
      if (next < 0) return;
      event.preventDefault();
      choices[next]?.focus();
    },
    { signal },
  );

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
