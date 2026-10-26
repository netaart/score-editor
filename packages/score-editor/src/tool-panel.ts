// ABOUTME: The Tools panel view part: a toolbar button that opens every registered tool, its declared controls, a preview and Apply.
// ABOUTME: The registry is the only list it reads, so a creator's tool gets the same controls and the same one-step run as a built-in one.

import { formatDiagnostic } from "./diagnostics";
import { create, requireDom, uniqueId } from "./dom";
import { NOTE_TOOLS } from "./note-tools";
import { anchorOf, clearPlacement, keepInside, placeUnder } from "./popover-menu";
import type { Score, SongProject } from "./score";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import { createToolRegistry, type ScoreTool, TOOL_GROUPS, type ToolParameter, type ToolParameterValues } from "./tool";
import { type ToolMessages, toolMessagesFor } from "./tool-messages";
import { toolPreviewChannel } from "./tool-preview";
import { TOOLS_SHEET_QUERY } from "./tool-styles";
import type { EditingPartOptions, Language, ViewPart } from "./types";
import { arrangementShown } from "./view-rules";

export interface ToolPanelOptions extends EditingPartOptions {
  /** The host's tools, added after the built-in note tools. A duplicate id is a registry error and throws at mount. */
  tools?: ReadonlyArray<ScoreTool>;
}

/** The Tools panel part: `setTools` replaces the host's tools, keeping the built-in ones and any values already set. */
export interface ToolPanelPart extends ViewPart {
  /**
   * Replaces the host's tools. The built-in note tools stay; a tool that is gone closes an open panel and clears the
   * preview, and a tool that stays keeps the values set in it.
   */
  setTools(tools: ReadonlyArray<ScoreTool>): void;
}

/** A tool row and the controls under it, kept so a language change can relabel both without rebuilding them. */
interface Entry {
  readonly tool: ScoreTool;
  readonly row: HTMLButtonElement;
  readonly name: HTMLElement;
  readonly description: HTMLElement | null;
  readonly controls: HTMLElement;
  readonly fields: Map<string, HTMLInputElement | HTMLSelectElement>;
  built: boolean;
}

/** One pitched tie chain as a key, to tell the notes a preview changes from the notes already there. */
function pitchedKeys(score: Score): string[] {
  const keys: string[] = [];
  for (const voice of score.voices) {
    const notes = score.notes
      .filter((note) => note.voice === voice && note.midi !== null)
      .sort((a, b) => a.start - b.start);
    for (let index = 0; index < notes.length; index += 1) {
      const note = notes[index] as (typeof notes)[number];
      let last = note;
      while (last.tie) {
        const next = notes[index + 1];
        if (next === undefined || next.start !== last.start + last.duration || next.midi !== last.midi) break;
        index += 1;
        last = next;
      }
      keys.push(`${voice}:${note.start}:${last.start + last.duration}:${String(note.midi)}`);
    }
  }
  return keys;
}

/** How many notes a preview adds, removes or changes, counted as the notes a person sees rather than their tied pieces. */
function changedNotes(session: EditingSession, before: SongProject, after: SongProject): number {
  const dialect = session.dialect;
  if (dialect === undefined) return 0;
  const oldScore = dialect.parse(before.score).score;
  const newScore = dialect.parse(after.score).score;
  if (oldScore === null || newScore === null) return 0;
  const oldKeys = new Set(pitchedKeys(oldScore));
  const newKeys = new Set(pitchedKeys(newScore));
  let added = 0;
  let removed = 0;
  for (const key of newKeys) if (!oldKeys.has(key)) added += 1;
  for (const key of oldKeys) if (!newKeys.has(key)) removed += 1;
  return Math.max(added, removed);
}

/**
 * Mounts the Tools button on `el`, with the panel it opens. The panel lists the built-in note tools and the host's tools
 * grouped as the spec groups them, draws one control per declared parameter, previews through `session.previewTool` and
 * runs through `session.runTool` as one history step. On a coarse pointer at a phone's width the panel is a bottom sheet.
 * It is an editing control: it is hidden while the session is read-only, while the score does not read, and while the
 * staff or text view is shown.
 */
export function mountToolPanel(
  el: HTMLElement,
  session: EditingSession,
  options: ToolPanelOptions = {},
): ToolPanelPart {
  requireDom("mountToolPanel");
  const doc = el.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-tools");
  el.appendChild(root);

  const button = create(doc, "button", "sce-button sce-tool-button", root);
  button.type = "button";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");

  const panel = create(doc, "div", "sce-popover sce-tool-panel", root);
  panel.setAttribute("popover", "auto");
  panel.setAttribute("role", "dialog");
  button.popoverTargetElement = panel;
  button.popoverTargetAction = "toggle";

  const title = create(doc, "div", "sce-tool-title", panel);
  const body = create(doc, "div", "sce-tool-body", panel);
  const footer = create(doc, "div", "sce-tool-footer", panel);
  const status = create(doc, "div", "sce-tool-status", footer);
  status.setAttribute("role", "status");
  const actions = create(doc, "div", "sce-tool-actions", footer);
  const apply = create(doc, "button", "sce-button sce-tool-apply", actions);
  apply.type = "button";
  const close = create(doc, "button", "sce-button", actions);
  close.type = "button";

  const entries = new Map<string, Entry>();
  const labels: Array<(messages: ToolMessages, language: Language) => void> = [];
  /** The values last read from each tool's controls, so rebuilding the list does not reset a tool that stays. */
  const saved = new Map<string, ToolParameterValues>();
  const preview = toolPreviewChannel(session);
  let chosen: ScoreTool | null = null;
  let language: Language | null = null;
  let t: ToolMessages = toolMessagesFor(session.view.language);

  function text(tag: "span" | "div", parent: HTMLElement, className: string): HTMLElement {
    return create(doc, tag, className, parent);
  }

  /** One control per declared parameter, inside a label so the name and the field travel together. */
  function control(entry: Entry, parameter: ToolParameter): void {
    const fieldLabel = create(doc, "label", "sce-tool-field", entry.controls);
    const name = text("span", fieldLabel, "sce-tool-field-name");
    labels.push((_messages, lang) => {
      name.textContent = parameter.label?.[lang] ?? parameter.name;
    });
    let field: HTMLInputElement | HTMLSelectElement;
    if (parameter.type === "choice") {
      const select = create(doc, "select", "sce-tool-select", fieldLabel);
      for (const value of parameter.values) {
        const option = doc.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      }
      select.value = parameter.default;
      field = select;
    } else {
      const input = create(doc, "input", parameter.type === "number" ? "sce-tool-number" : "sce-tool-text", fieldLabel);
      if (parameter.type === "number") {
        input.type = "number";
        input.inputMode = "numeric";
        input.step = String(parameter.step ?? 1);
        if (parameter.min !== undefined) input.min = String(parameter.min);
        if (parameter.max !== undefined) input.max = String(parameter.max);
        input.value = String(parameter.default);
      } else if (parameter.type === "boolean") {
        input.type = "checkbox";
        input.checked = parameter.default;
        fieldLabel.classList.add("sce-tool-check");
      } else {
        input.type = "text";
        input.value = parameter.default;
      }
      field = input;
    }
    field.addEventListener("input", () => previewNow(), { signal });
    field.addEventListener("change", () => previewNow(), { signal });
    entry.fields.set(parameter.name, field);
  }

  /** Fills a tool's controls the first time it is opened, so a large registry costs nothing until a person chooses. */
  function build(entry: Entry): void {
    if (entry.built) return;
    entry.built = true;
    for (const parameter of entry.tool.parameters ?? []) control(entry, parameter);
    const values = saved.get(entry.tool.id);
    if (values !== undefined) {
      for (const parameter of entry.tool.parameters ?? []) {
        const value = values[parameter.name];
        const field = entry.fields.get(parameter.name);
        if (field === undefined || value === undefined) continue;
        if (parameter.type === "boolean") (field as HTMLInputElement).checked = value === true;
        else field.value = String(value);
      }
    }
    for (const label of labels) label(t, language ?? "en");
  }

  /** The values of a tool's controls, or the declaration's defaults for one never opened. */
  function valuesOf(tool: ScoreTool): ToolParameterValues {
    const entry = entries.get(tool.id);
    const values: Record<string, string | number | boolean> = {};
    for (const parameter of tool.parameters ?? []) {
      const field = entry?.fields.get(parameter.name);
      if (field === undefined) {
        values[parameter.name] = parameter.default;
      } else if (parameter.type === "number") {
        values[parameter.name] = field.value === "" ? Number.NaN : Number(field.value);
      } else if (parameter.type === "boolean") {
        values[parameter.name] = (field as HTMLInputElement).checked;
      } else {
        values[parameter.name] = field.value;
      }
    }
    saved.set(tool.id, values);
    return values;
  }

  function setStatus(message: string, state: string): void {
    status.textContent = message;
    status.dataset.state = state;
  }

  function clearPreview(): void {
    preview.show(null);
  }

  /** What the chosen tool would do now: its status line, and the outlines the tracks draw. */
  function previewNow(): void {
    clearPreview();
    if (!panel.matches(":popover-open")) return;
    if (chosen === null) {
      setStatus(t.statusIdle, "idle");
      return;
    }
    if (!session.view.editable) {
      setStatus(t.statusReadOnly, "readonly");
      return;
    }
    build(entries.get(chosen.id) as Entry);
    const result = session.previewTool(chosen, valuesOf(chosen));
    const diagnostic = result.diagnostics[0];
    if (!result.ok) {
      setStatus(
        diagnostic === undefined ? t.statusUnchanged : formatDiagnostic(diagnostic, language ?? "en"),
        "refused",
      );
      return;
    }
    if (result.project.score === session.project.score) {
      setStatus(t.statusUnchanged, "unchanged");
      return;
    }
    setStatus(t.statusPreview(changedNotes(session, session.project, result.project)), "preview");
    preview.show({ project: result.project });
  }

  /** Opens one tool and closes the others; choosing the open one again closes it. */
  function choose(tool: ScoreTool | null): void {
    chosen = tool;
    for (const entry of entries.values()) {
      const open = entry.tool === tool;
      entry.controls.hidden = !open;
      entry.row.setAttribute("aria-expanded", String(open));
    }
    previewNow();
  }

  function buildEntry(tool: ScoreTool, parent: HTMLElement): void {
    const wrapper = create(doc, "div", "sce-tool-entry", parent);
    const row = create(doc, "button", "sce-tool-row", wrapper);
    row.type = "button";
    row.setAttribute("aria-expanded", "false");
    const controls = create(doc, "div", "sce-tool-controls", wrapper);
    controls.id = uniqueId("sce-tool-controls");
    controls.setAttribute("role", "group");
    row.setAttribute("aria-controls", controls.id);
    controls.hidden = true;
    const name = text("span", row, "sce-tool-name");
    const description = tool.description === undefined ? null : text("span", row, "sce-tool-description");
    labels.push((_messages, lang) => {
      name.textContent = tool.name[lang];
      row.setAttribute("aria-label", tool.name[lang]);
      controls.setAttribute("aria-label", tool.name[lang]);
      if (description !== null) description.textContent = tool.description?.[lang] ?? "";
    });
    const entry: Entry = {
      tool,
      row,
      name,
      description,
      controls,
      fields: new Map(),
      built: false,
    };
    entries.set(tool.id, entry);
    row.addEventListener(
      "click",
      () => {
        choose(chosen === tool ? null : tool);
        if (chosen !== null) {
          const first = entries.get(chosen.id)?.fields.values().next().value;
          first?.focus();
        }
      },
      { signal },
    );
  }

  /** Draws the groups and rows of a tool list, replacing the last; the entries and their labels are built again. */
  function renderTools(tools: ReadonlyArray<ScoreTool>): void {
    body.replaceChildren();
    entries.clear();
    labels.length = 0;
    for (const group of [...TOOL_GROUPS, "more"] as const) {
      const members = tools.filter((tool) => (tool.group ?? "more") === group);
      if (members.length === 0) continue;
      const section = create(doc, "div", "sce-tool-group", body);
      section.dataset.group = group;
      const heading = text("div", section, "sce-tool-group-name");
      heading.setAttribute("role", "heading");
      heading.setAttribute("aria-level", "3");
      labels.push((messages) => {
        heading.textContent = messages.group[group];
      });
      for (const tool of members) buildEntry(tool, section);
    }
  }

  renderTools(createToolRegistry([...NOTE_TOOLS, ...(options.tools ?? [])]).list());

  /** Replaces the host's tools: the built-ins stay, a tool that is gone closes the panel, a tool that stays keeps values. */
  function setTools(next: ReadonlyArray<ScoreTool>): void {
    const registry = createToolRegistry([...NOTE_TOOLS, ...next]);
    const keep = chosen === null ? null : (registry.find(chosen.id) ?? null);
    if (chosen !== null) saved.set(chosen.id, valuesOf(chosen));
    if (chosen !== null && keep === null) {
      chosen = null;
      if (panel.matches(":popover-open")) panel.hidePopover();
      clearPreview();
      setStatus(t.statusIdle, "idle");
    } else {
      chosen = keep;
    }
    renderTools(registry.list());
    for (const label of labels) label(t, language ?? "en");
    if (chosen !== null) choose(chosen);
  }

  function applyLanguage(): void {
    language = session.view.language;
    t = toolMessagesFor(language);
    root.lang = language;
    button.textContent = t.button;
    button.title = t.buttonTip;
    panel.setAttribute("aria-label", t.panel);
    title.textContent = t.panel;
    apply.textContent = t.apply;
    close.textContent = t.close;
    for (const label of labels) label(t, language);
    previewNow();
  }

  apply.addEventListener(
    "click",
    () => {
      if (chosen === null || !session.view.editable) return;
      build(entries.get(chosen.id) as Entry);
      const before = session.project.score;
      const result = session.runTool(chosen, valuesOf(chosen));
      const diagnostic = result.diagnostics[0];
      if (!result.ok) {
        setStatus(
          diagnostic === undefined ? t.statusUnchanged : formatDiagnostic(diagnostic, language ?? "en"),
          "refused",
        );
        clearPreview();
        if (result.diagnostics.length > 0) options.onRefused?.(result.diagnostics);
        return;
      }
      clearPreview();
      setStatus(
        result.project.score === before ? t.statusUnchanged : t.statusApplied,
        result.project.score === before ? "unchanged" : "applied",
      );
    },
    { signal },
  );
  close.addEventListener("click", () => panel.hidePopover(), { signal });

  const isSheet = (): boolean => doc.defaultView?.matchMedia(TOOLS_SHEET_QUERY).matches === true;
  panel.addEventListener(
    "beforetoggle",
    (event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      // The one placement rule in `popover-menu.ts`: under the button on the desktop, the stylesheet's own sheet on a phone.
      if (isSheet()) clearPlacement(panel);
      else placeUnder(anchorOf(button), panel);
    },
    { signal },
  );
  panel.addEventListener(
    "toggle",
    (event) => {
      const open = (event as ToggleEvent).newState === "open";
      button.setAttribute("aria-expanded", String(open));
      if (!open) {
        clearPreview();
        return;
      }
      if (!isSheet()) keepInside(panel, anchorOf(button));
      previewNow();
      const focusOn = chosen === null ? entries.values().next().value?.row : entries.get(chosen.id)?.row;
      focusOn?.focus();
    },
    { signal },
  );

  function draw(): void {
    if (session.view.language !== language) applyLanguage();
    const shown = session.view.editable && session.reading.kind === "score" && arrangementShown(session);
    root.hidden = !shown;
    if (!shown) {
      if (panel.matches(":popover-open")) panel.hidePopover();
      clearPreview();
    }
  }

  applyLanguage();
  draw();
  const unsubscribe = session.subscribe((change) => {
    draw();
    if (!panel.matches(":popover-open")) return;
    // A zoom or a scroll is the view's own; a preview of the same tool would only be recomputed for nothing.
    if (change.cause === "view" || change.cause === "active-view" || change.cause === "rejected-text") return;
    previewNow();
  });
  let destroyed = false;
  return {
    setTools,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      unsubscribe();
      clearPreview();
      root.remove();
      releaseStyles();
    },
  };
}
