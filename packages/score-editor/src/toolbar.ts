// ABOUTME: The toolbar view part: the title, the zoom control, undo and redo, Delete, the opt-in pencil, the Select, Grid and Bars menus, Meter, the read-only badge, the synth preview control, the Filter button and the hint.
// ABOUTME: Undo and redo are there while the session is editable; the row scrolls sideways when its box is narrower than its controls.

import { mountBarMenu } from "./bar-menu";
import { create, requireDom } from "./dom";
import type { DraftKeeper } from "./draft-keeper";
import { mountRestoreControl } from "./draft-restore";
import { installEditKeys } from "./edit-keys";
import { canEditSelection, handleEditingInput } from "./editing-input";
import { mountFilterPanel } from "./filter-panel";
import { mountGridControl } from "./grid-control";
import { messagesFor, viewName } from "./i18n";
import { lineIcon } from "./icons";
import { createLiveRegion, sayRefusals } from "./live-region";
import { mountMeterControl } from "./meter-control";
import { pencilMode } from "./pencil-mode";
import { mountProjectControl, type ProjectControl } from "./project-control";
import { mountProjectNoticeStrip } from "./project-notice-strip";
import { watchScrollCue } from "./scroll-cue";
import { mountSelectionMenu } from "./selection-menu";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import { mountSynthControl } from "./synth-preview";
import { mountTempoKeyControls } from "./tempo-key";
import type { ScoreTool } from "./tool";
import { mountToolPanel } from "./tool-panel";
import type { EditingPartOptions, Language, ProjectField, ViewPart } from "./types";
import { arrangementShown } from "./view-rules";
import { mountViewSwitch } from "./view-switch";
import { mountZoomControl } from "./zoom-control";

/**
 * The toolbar part: `setTools` replaces the Tools panel's host tools (it does nothing without the `tools` option), and
 * `openProject` is the way the frame asks its Project control to open on a missing field.
 */
export interface ToolbarPart extends ViewPart {
  setTools(tools: ReadonlyArray<ScoreTool>): void;
  openProject(field?: ProjectField): void;
  /** Says a sentence in the toolbar's own polite live region. */
  say(words: string): void;
}

export interface ToolbarOptions extends EditingPartOptions {
  /**
   * The id to give the screen-reader hint. A host that points a view's `aria-describedby` at it gets the hint; without
   * this option the toolbar draws no hint, since a hint nothing refers to would only be noise.
   */
  hintId?: string;
  /**
   * Whether to end the row with the view switch (`mountViewSwitch`), as the default editor does. The title then names the
   * view that is shown, and the controls that only mean something on the arrangement are left out of the others. Without
   * it the toolbar has no switch and keeps its own title.
   */
  viewSwitch?: boolean;
  /**
   * Whether the toolbar holds the synth preview control. On by default, so a toolbar alone lets a person listen; a host
   * that mounts `mountSynthPreview` in a place of its own turns it off, so the control is not there twice.
   */
  synthPreview?: boolean;
  /**
   * Whether the toolbar holds the tempo field, the key menu and the two transpose buttons, which act on the whole song and
   * are there while the session is editable and its score reads. Off by default, so a toolbar a host already mounts gains
   * no control; the default editor turns it on.
   */
  tempoKey?: boolean;
  /**
   * Whether the toolbar holds the Project button, which opens the song project panel (`mountProjectPanel`) under it. The
   * button is there while the session has a dialect, in read-only mode too, where the panel only shows. Off by default; the
   * default editor turns it on. A host that mounts `mountProjectPanel` in a place of its own leaves it off.
   */
  projectPanel?: boolean;
  /** The draft keeper of this editor; see "In the default editor" in the package README. */
  draftKeeper?: DraftKeeper;
  /** The model inputs the host marked required; the Project panel says so on their empty fields. */
  requiredInputs?: ReadonlyArray<ProjectField>;
  /**
   * The host's tools. Giving this option, even an empty list, puts the Tools button and panel in the row before the Filter
   * button; the built-in note tools are always listed. Off by default, so a toolbar a host already mounts gains no control.
   */
  tools?: ReadonlyArray<ScoreTool>;
  /**
   * Puts the focus on the bar the Bars menu chose. The default editor passes its ruler's way there; a host that mounts
   * the toolbar without a ruler can leave it out, and the menu still chooses the bar in the session.
   */
  onChooseBars?: (bar: number) => void;
  /**
   * Whether the toolbar holds the pencil toggle, after Delete. Off by default, so a toolbar a host already mounts gains
   * no control or tab stop; the default editor turns it on. A host that mounts the toolbar itself can turn it on when it
   * has a voice track to draw on.
   */
  pencil?: boolean;
}

/** An arrow that turns back on itself; redo is the same drawing mirrored by the stylesheet. */
const ARROW = ["5.5,2.5 2.5,5.5 5.5,8.5", "2.5,5.5 9.5,5.5 12.5,7.5 12.5,10.5 9.5,12.5 5,12.5"];

/** A bin: the lid and its handle, then the body. */
const BIN = ["2.5,4.5 13.5,4.5", "6,4.5 6,2.5 10,2.5 10,4.5", "4,4.5 4.8,13.5 11.2,13.5 12,4.5"];

/** A pencil: the body from the point to the eraser, and the line that separates them. */
const PENCIL = ["3,13 4.5,9 11,2.5 13.5,5 7,11.5 3,13", "9.5,4 12,6.5"];

/**
 * Mounts the toolbar on `el`. It holds the title, the zoom control, undo and redo (while the session is editable), Delete,
 * the pencil when asked, the Select and Grid menus and the Bars menu and meter control (while it is editable and the
 * arrangement is shown), the read-only badge (while the session is not editable), the view switch when asked, the synth
 * preview control, which is there either way unless `synthPreview` is off, the Filter button, last in the row, and, when
 * asked, the screen-reader hint. The controls are in that order in the row and in the tab order, the Filter button last.
 * It follows the session's language.
 */
export function mountToolbar(el: HTMLElement, session: EditingSession, options: ToolbarOptions = {}): ToolbarPart {
  requireDom("mountToolbar");
  const doc = el.ownerDocument;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-toolbar");
  el.appendChild(root);
  const live = createLiveRegion(root);
  const refused = sayRefusals(live, session, options.onRefused);
  // What a taken command itself had to say (a style without a BPM after a tempo change) stays under the row until the
  // project changes by anything else, as the text view keeps its notice.
  const noticeStrip = mountProjectNoticeStrip(root, session);

  const row = create(doc, "div", "sce-toolbar", root);
  // Two rows on any toolbar that has a bar: a one-line strip for the editing and song controls, and the bar with the
  // view switch and the preview control. A toolbar with neither keeps today's single scrolling row.
  const hasBar = options.viewSwitch === true || options.synthPreview !== false;
  const strip = hasBar ? create(doc, "div", "sce-tools", row) : row;
  const bar = hasBar ? create(doc, "div", "sce-bar", row) : null;
  if (bar !== null) row.dataset.bar = "";
  if (options.viewSwitch) row.dataset.views = "";
  const pencil = pencilMode(session);
  const showsPencil = options.pencil === true;
  const title = create(doc, "span", "sce-title", strip);
  const zoom = mountZoomControl(strip, session);
  const badge = create(doc, "span", "sce-badge", strip);
  const history = create(doc, "div", "sce-history", strip);
  history.setAttribute("role", "group");
  const historyButton = (action: "undo" | "redo"): HTMLButtonElement => {
    const button = create(doc, "button", `sce-button sce-icon-button sce-${action}`, history);
    button.type = "button";
    button.appendChild(lineIcon(doc, ARROW));
    return button;
  };
  const undo = historyButton("undo");
  const redo = historyButton("redo");
  const remove = create(doc, "button", "sce-button sce-icon-button sce-delete", strip);
  remove.type = "button";
  remove.setAttribute("aria-disabled", "true");
  remove.appendChild(lineIcon(doc, BIN));
  // The pencil sits in the edit cluster, after Delete and before Select. It is opt-in, so a bare toolbar gains no control
  // or tab stop; the merged Bars/Meter/handoff controls made the end of the row add a phone row, which this place does not.
  const pencilButton = create(doc, "button", "sce-button sce-icon-button sce-pencil-button", strip);
  pencilButton.type = "button";
  pencilButton.setAttribute("aria-pressed", "false");
  pencilButton.setAttribute("aria-keyshortcuts", "b");
  pencilButton.hidden = !showsPencil;
  pencilButton.appendChild(lineIcon(doc, PENCIL));
  const select = mountSelectionMenu(strip, session);
  const grid = mountGridControl(strip, session, live);
  const bars = mountBarMenu(strip, session, {
    live,
    ...(options.onRefused === undefined ? {} : { onRefused: options.onRefused }),
    ...(options.onChooseBars === undefined ? {} : { onChooseBars: options.onChooseBars }),
  });
  const meter = mountMeterControl(strip, session, {
    live,
    ...(options.onRefused === undefined ? {} : { onRefused: options.onRefused }),
  });
  // Restore original and Hand to agent… are mounted by the editor into this slot, between the editing cluster and the song
  // controls: a comment takes no box and keeps the DOM order the Tab order reads.
  const restoreAnchor = doc.createComment("restore original and hand off");
  strip.appendChild(restoreAnchor);
  // The view switch ends the bar; the preview control follows it. Both are in sight at rest, and the strip's own width
  // can never move them: it takes a line of its own on a phone and shares one with the bar on a wide box.
  const end = options.viewSwitch ? create(doc, "div", "sce-toolbar-end", bar ?? strip) : null;
  const views: ViewPart | null = end === null ? null : mountViewSwitch(end, session);
  const hint = options.hintId === undefined ? null : create(doc, "div", "sce-sr-only", root);
  if (hint && options.hintId !== undefined) hint.id = options.hintId;
  const song = options.tempoKey
    ? mountTempoKeyControls(strip, session, {
        refused,
        live,
        showNotices: (notices) => noticeStrip.show(notices),
      })
    : null;
  const projectControl: ProjectControl | null = options.projectPanel
    ? mountProjectControl(strip, root, session, live, options.onRefused, options.requiredInputs)
    : null;
  let restore: ViewPart | null = null;
  /** The restore control is built only while the binding has a keeper, so a host without a store gets no draft DOM. */
  function syncRestore(): void {
    const keeper = options.draftKeeper;
    if (keeper !== undefined && keeper.status !== "destroyed") {
      if (restore === null) {
        restore = mountRestoreControl(
          strip,
          session,
          {
            get status() {
              return keeper.status;
            },
            subscribe: (listener) => keeper.subscribe(() => listener()),
            restoreOriginal: () => keeper.restoreOriginal(),
          },
          (words) => live.say(words),
          strip.querySelector(".sce-part-handoff") ?? restoreAnchor,
        );
      }
    } else if (restore !== null) {
      restore.destroy();
      restore = null;
    }
  }
  const synth = options.synthPreview === false ? null : mountSynthControl(bar ?? strip, session, live);
  if (synth) row.dataset.synth = "";
  // The Tools button and the Filter button after it end the row as one item, held to the right edge: the Tools panel
  // hangs from the right, so a preview on the arrangement stays in view, and the pair wraps together onto the line
  // Filter already used, so the row keeps its height at a phone's width.
  const toolsHost = options.tools === undefined ? null : create(doc, "div", "sce-toolbar-tools", strip);
  const tools =
    toolsHost === null
      ? null
      : mountToolPanel(toolsHost, session, {
          tools: options.tools ?? [],
          ...(options.onRefused === undefined ? {} : { onRefused: options.onRefused }),
        });
  // Last in the row, so the Tab order and the wrapping of the controls before it are as they were.
  const filter = mountFilterPanel(toolsHost ?? strip, session);

  const abort = new AbortController();
  const { signal } = abort;
  watchScrollCue(strip, "horizontal", signal);
  // A focused control is scrolled wholly into the strip, not left with its edge under the root: the browser stops as
  // soon as any part of it is in view.
  strip.addEventListener(
    "focusin",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !strip.contains(target)) return;
      const frame = strip.getBoundingClientRect();
      const box = target.getBoundingClientRect();
      if (box.left < frame.left + 8) strip.scrollLeft -= frame.left + 8 - box.left;
      else if (box.right > frame.right - 8) strip.scrollLeft += box.right - (frame.right - 8);
    },
    { signal },
  );
  undo.addEventListener("click", () => session.undo(), { signal });
  redo.addEventListener("click", () => session.redo(), { signal });
  remove.addEventListener(
    "click",
    () => {
      const result = handleEditingInput(session, { type: "delete" });
      if (result.refused.length > 0) refused(result.refused);
    },
    { signal },
  );
  if (showsPencil) pencilButton.addEventListener("click", () => pencil.toggle(), { signal });
  installEditKeys(root, session, signal, { ...options, onRefused: refused });

  /** What the last draw showed, so a change of zoom or scroll, which this part does not draw, costs nothing here. */
  let drawn = "";
  let language: Language | null = null;
  let t = messagesFor(session.view.language);
  /** The title is the shown view's name; its tooltip holds the whole name, for where the row cuts it short. */
  function setTitle(): void {
    const name = options.viewSwitch ? viewName(t, session.activeView) : t.title;
    title.textContent = name;
    title.title = name;
  }

  function applyLanguage(): void {
    language = session.view.language;
    t = messagesFor(language);
    root.lang = language;
    setTitle();
    history.setAttribute("aria-label", t.history);
    for (const [button, label, keys] of [
      [undo, t.undo, "Ctrl/Cmd+Z"],
      [redo, t.redo, "Ctrl/Cmd+Shift+Z"],
      [remove, t.delete, "Del/Backspace"],
    ] as const) {
      button.setAttribute("aria-label", label);
      button.title = `${label} (${keys})`;
    }
    pencilButton.setAttribute("aria-label", t.drawNotes);
    pencilButton.title = t.drawNotesTip;
    drawn = "";
  }

  function draw(): void {
    syncRestore();
    if (session.view.language !== language) applyLanguage();
    const { editable } = session.view;
    const readable = session.reading.kind === "score";
    const deletable = canEditSelection(session);
    const arrangement = !options.viewSwitch || arrangementShown(session);
    const opening = options.draftKeeper?.status === "opening";
    const shown = [
      editable,
      readable,
      session.canUndo,
      session.canRedo,
      deletable,
      session.activeView,
      opening,
      showsPencil && pencil.on,
    ].join();
    if (shown === drawn) return;
    drawn = shown;
    // An empty pair still costs a flex gap and its auto margin, and would rebalance the row while the parts are hidden.
    if (toolsHost !== null) toolsHost.hidden = !(arrangement && readable);
    if (hint) hint.textContent = editable ? t.hintEditing : t.hint;
    if (options.viewSwitch) setTitle();
    history.hidden = !editable || !readable;
    remove.hidden = history.hidden || !arrangement;
    pencilButton.hidden = !showsPencil || history.hidden || !arrangement;
    pencilButton.setAttribute("aria-pressed", String(showsPencil && pencil.on));
    badge.hidden = editable;
    badge.textContent = opening ? t.draftOpening : t.readOnly;
    undo.setAttribute("aria-disabled", String(!session.canUndo));
    redo.setAttribute("aria-disabled", String(!session.canRedo));
    remove.setAttribute("aria-disabled", String(!deletable));
  }

  draw();
  const unsubscribe = session.subscribe((change) => {
    if (change.project) noticeStrip.clear();
    draw();
  });
  const unsubscribePencil = pencil.subscribe(() => {
    draw();
    live.say(pencil.on ? t.drawOn : t.drawOff);
  });
  const unsubscribeKeeper = options.draftKeeper?.subscribe(draw);
  let destroyed = false;
  return {
    setTools(next) {
      tools?.setTools(next);
    },
    openProject(field) {
      projectControl?.open(field);
    },
    say(words) {
      live.say(words);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      unsubscribe();
      unsubscribePencil();
      unsubscribeKeeper?.();
      zoom.destroy();
      views?.destroy();
      select.destroy();
      bars.destroy();
      meter.destroy();
      noticeStrip.destroy();
      song?.destroy();
      projectControl?.destroy();
      tools?.destroy();
      filter.destroy();
      grid.destroy();
      restore?.destroy();
      synth?.destroy();
      root.remove();
      releaseStyles();
    },
  };
}
