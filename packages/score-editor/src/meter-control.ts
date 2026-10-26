// ABOUTME: The toolbar's meter control: the target section's meter, the common meters the dialect allows, and a custom row.
// ABOUTME: It acts on the section of the first chosen bar, else of the insertion point's bar, else the first section.
import { barIndexAt, gridTicks } from "./arrangement";
import { type Diagnostic, formatDiagnostic } from "./diagnostics";
import { create } from "./dom";
import { messagesFor } from "./i18n";
import { type LiveRegion, sayRefusals } from "./live-region";
import { meterAllowed, meterChoices } from "./meter";
import { anchorOf, keepInside, placeUnder } from "./popover-menu";
import { type Meter, type Score, TICKS_PER_QUARTER } from "./score";
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

/** The denominators the rule allows: its powers of two, or every integer in its range when it does not restrict them. */
function denominators(min: number, max: number, powerOfTwo: boolean): number[] {
  const values: number[] = [];
  for (let value = Math.max(1, min); value <= max; value++) {
    if (!powerOfTwo || (value & (value - 1)) === 0) values.push(value);
  }
  return values;
}

/** What a meter does to the target's bars: the count after the change, and whether its last bar is short. */
function effectOf(score: Score, target: Target, meter: Meter): { bars: number; short: boolean } {
  const first = score.bars[target.first];
  const last = score.bars[target.last];
  if (!first || !last || meter.numerator < 1 || meter.denominator < 1) return { bars: 0, short: false };
  const length = last.start + last.length - first.start;
  const barTicks = (4 * TICKS_PER_QUARTER * meter.numerator) / meter.denominator;
  const whole = Math.floor(length / barTicks);
  const short = length % barTicks !== 0;
  return { bars: Math.max(1, whole), short };
}

/**
 * Mounts the meter control on `el`, after Bars and before the view controls. It is drawn while the session is editable,
 * has a score and shows the arrangement; its popover offers the common meters the dialect's rule allows and a custom pair.
 */
export interface MeterControlOptions extends EditingPartOptions {
  /** The toolbar's one live region; the control says its changes and refusals there. */
  live: LiveRegion;
}

export function mountMeterControl(el: HTMLElement, session: EditingSession, options: MeterControlOptions): ViewPart {
  const doc = el.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-meter");
  el.appendChild(root);
  const refused = sayRefusals(options.live, session, options.onRefused);

  const button = create(doc, "button", "sce-button sce-meter-button", root);
  button.type = "button";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  const menu = create(doc, "div", "sce-popover sce-meter-popover", root);
  menu.setAttribute("popover", "auto");
  menu.setAttribute("role", "dialog");
  button.popoverTargetElement = menu;
  button.popoverTargetAction = "toggle";

  let target: Target | null = null;
  let offered: Meter[] = [];
  let choices: HTMLButtonElement[] = [];
  let effect: HTMLElement | null = null;
  let refusal: HTMLElement | null = null;
  let beats: HTMLInputElement | null = null;
  let value: HTMLSelectElement | null = null;
  let lastRefusal: Diagnostic | null = null;

  function closeAndFocus(): void {
    menu.hidePopover();
    button.focus();
  }

  function nameOf(t: ReturnType<typeof messagesFor>, section: Target): string {
    const score = session.reading.kind === "score" ? session.reading.score : null;
    return score?.sections[section.section]?.name ?? t.unnamedSection;
  }

  function effectText(t: ReturnType<typeof messagesFor>, meter: Meter): string {
    if (target === null) return "";
    const score = session.reading.kind === "score" ? session.reading.score : null;
    if (score === null) return "";
    const { bars, short } = effectOf(score, target, meter);
    return t.meterEffect(nameOf(t, target), target.first + 1, target.last + 1, meter, bars, short);
  }

  function showRefusal(diagnostic: Diagnostic | undefined): void {
    lastRefusal = diagnostic ?? null;
    if (diagnostic === undefined || refusal === null) {
      if (refusal !== null) {
        refusal.textContent = "";
        refusal.hidden = true;
      }
      return;
    }
    refusal.textContent = formatDiagnostic(diagnostic, session.view.language);
    refusal.hidden = false;
  }

  function clearRefusal(): void {
    lastRefusal = null;
    if (refusal === null) return;
    refusal.textContent = "";
    refusal.hidden = true;
  }

  function selectMeter(meter: Meter, moveFocus = false): void {
    const t = messagesFor(session.view.language);
    offered.forEach((found, at) => {
      const choice = choices[at];
      if (!choice) return;
      const checked = found.numerator === meter.numerator && found.denominator === meter.denominator;
      choice.setAttribute("aria-checked", String(checked));
      choice.tabIndex = checked ? 0 : -1;
      if (checked && moveFocus) choice.focus();
    });
    if (beats !== null) beats.value = String(meter.numerator);
    if (value !== null) value.value = String(meter.denominator);
    if (effect !== null) effect.textContent = effectText(t, meter);
  }

  function apply(meter: Meter): void {
    if (target === null) return;
    const t = messagesFor(session.view.language);
    const effectSentence = effectText(t, meter);
    const result = session.dispatch({ type: "setSectionMeter", section: target.section, meter });
    if (!result.ok) {
      refused(result.diagnostics);
      showRefusal(result.diagnostics[0]);
      return;
    }
    clearRefusal();
    options.live.say(t.meterSet(nameOf(t, target), meter, effectSentence));
    closeAndFocus();
  }

  function renderMenu(next: Target): void {
    target = next;
    const t = messagesFor(session.view.language);
    const name = nameOf(t, next);
    menu.setAttribute("aria-label", `${t.meter}: ${t.meterSection(name, next.first + 1, next.last + 1)}`);
    menu.replaceChildren();

    const summary = create(doc, "div", "sce-meter-summary", menu);
    summary.textContent = t.meterSection(name, next.first + 1, next.last + 1);
    effect = create(doc, "div", "sce-meter-effect", menu);

    const group = create(doc, "div", "sce-meter-presets", menu);
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", t.meter);
    const constraints = session.constraints;
    offered = constraints === null ? [] : meterChoices(constraints);
    if (constraints !== null && meterAllowed(next.meter, constraints.meter)) {
      if (
        !offered.some(
          (found) => found.numerator === next.meter.numerator && found.denominator === next.meter.denominator,
        )
      ) {
        offered.push(next.meter);
      }
    }
    choices = offered.map((meter) => {
      const choice = create(doc, "button", "sce-menu-item sce-meter-choice", group);
      choice.type = "button";
      choice.setAttribute("role", "radio");
      choice.tabIndex = -1;
      choice.textContent = t.meterText(meter);
      choice.addEventListener("click", () => selectMeter(meter), { signal });
      return choice;
    });

    if (constraints !== null) {
      const custom = create(doc, "div", "sce-meter-custom", menu);
      create(doc, "span", "sce-meter-custom-label", custom).textContent = t.meterCustom;
      const beatsLabel = create(doc, "label", "sce-meter-field", custom);
      create(doc, "span", "sce-meter-field-label", beatsLabel).textContent = t.meterBeats;
      beats = create(doc, "input", "sce-field sce-meter-input", beatsLabel);
      beats.type = "number";
      beats.min = String(constraints.meter.numerator.min);
      beats.max = String(constraints.meter.numerator.max);
      beats.step = "1";
      value = null;
      const valueLabel = create(doc, "label", "sce-meter-field", custom);
      create(doc, "span", "sce-meter-field-label", valueLabel).textContent = t.meterValue;
      value = create(doc, "select", "sce-field sce-meter-input", valueLabel);
      for (const denominator of denominators(
        constraints.meter.denominator.min,
        constraints.meter.denominator.max,
        constraints.meter.denominator.powerOfTwo,
      )) {
        const option = create(doc, "option", "", value);
        option.value = String(denominator);
        option.textContent = String(denominator);
      }
      const applyButton = create(doc, "button", "sce-button sce-meter-apply", custom);
      applyButton.type = "button";
      applyButton.textContent = t.meterApply;
      const submit = () => {
        const numerator = Number(beats?.value);
        const denominator = Number(value?.value);
        if (Number.isFinite(numerator) && Number.isFinite(denominator)) apply({ numerator, denominator });
      };
      applyButton.addEventListener("click", submit, { signal });
      for (const field of [beats as HTMLElement, value as HTMLElement]) {
        field.addEventListener(
          "keydown",
          (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            submit();
          },
          { signal },
        );
        field.addEventListener(
          "input",
          () => {
            const numerator = Number(beats?.value);
            const denominator = Number(value?.value);
            if (Number.isFinite(numerator) && Number.isFinite(denominator) && effect !== null) {
              effect.textContent = effectText(t, { numerator, denominator });
            }
          },
          { signal },
        );
      }
    } else {
      beats = null;
      value = null;
    }

    refusal = create(doc, "div", "sce-menu-refusal sce-meter-refusal", menu);
    refusal.hidden = true;
    if (lastRefusal !== null) showRefusal(lastRefusal);
    selectMeter(next.meter);
  }

  let language: Language | null = null;
  let drawn = "";
  function draw(): void {
    if (session.view.language !== language) {
      language = session.view.language;
      root.lang = language;
    }
    const { reading, view } = session;
    const score = reading.kind === "score" ? reading.score : null;
    const next = score === null ? null : targetOf(score, session);
    const shown = score !== null && next !== null && view.editable && arrangementShown(session);
    const state = [
      shown,
      next?.section,
      next?.first,
      next?.last,
      next?.meter.numerator,
      next?.meter.denominator,
      view.language,
    ].join();
    if (state === drawn) return;
    drawn = state;
    target = next;
    root.hidden = !shown;
    if (!shown || next === null) {
      button.textContent = "";
      button.removeAttribute("aria-label");
      button.removeAttribute("title");
      return;
    }
    const t2 = messagesFor(session.view.language);
    const label = `${t2.meter} ${t2.meterText(next.meter)}`;
    button.textContent = label;
    button.setAttribute("aria-label", label);
    button.title = t2.meterSection(nameOf(t2, next), next.first + 1, next.last + 1);
  }

  /** The room under the button, leaving the window's 12px margin; undefined where there is no window. */
  function roomBelow(): number | undefined {
    const view = doc.defaultView;
    return view === null ? undefined : Math.max(0, view.innerHeight - button.getBoundingClientRect().bottom - 12);
  }

  menu.addEventListener(
    "beforetoggle",
    (event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      const room = roomBelow();
      placeUnder(anchorOf(button), menu, room === undefined ? {} : { maxHeight: room });
      const { reading } = session;
      const next = reading.kind === "score" ? targetOf(reading.score, session) : null;
      if (next !== null) renderMenu(next);
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
      const room = roomBelow();
      keepInside(menu, anchorOf(button), room === undefined ? {} : { maxHeight: room });
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
      const meter = offered[next];
      if (meter !== undefined) selectMeter(meter, true);
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
