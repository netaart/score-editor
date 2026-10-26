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
import { mountSelectionMenu } from "./selection-menu";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import { mountSynthControl } from "./synth-preview";
import { mountTempoKeyControls } from "./tempo-key";
import type { EditingPartOptions, Language, ProjectField, ViewPart } from "./types";
import { arrangementShown } from "./view-rules";
import { mountViewSwitch } from "./view-switch";
import { mountZoomControl } from "./zoom-control";

/** The toolbar part, and the way the frame asks its Project control to open on a missing field. */
export interface ToolbarPart extends ViewPart {
  openProject(field?: ProjectField): void;
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
  if (options.viewSwitch) row.dataset.views = "";
  const pencil = pencilMode(session);
  const showsPencil = options.pencil === true;
  const title = create(doc, "span", "sce-title", row);
  const zoom = mountZoomControl(row, session);
  const history = create(doc, "div", "sce-history", row);
  history.setAttribute("role", "group");
  const historyButton = (action: "undo" | "redo"): HTMLButtonElement => {
    const button = create(doc, "button", `sce-button sce-icon-button sce-${action}`, history);
    button.type = "button";
    button.appendChild(lineIcon(doc, ARROW));
    return button;
  };
  const undo = historyButton("undo");
  const redo = historyButton("redo");
  const remove = create(doc, "button", "sce-button sce-icon-button sce-delete", row);
  remove.type = "button";
  remove.setAttribute("aria-disabled", "true");
  remove.appendChild(lineIcon(doc, BIN));
  // The pencil sits in the edit cluster, after Delete and before Select. It is opt-in, so a bare toolbar gains no control
  // or tab stop; the merged Bars/Meter/handoff controls made the end of the row add a phone row, which this place does not.
  const pencilButton = create(doc, "button", "sce-button sce-icon-button sce-pencil-button", row);
  pencilButton.type = "button";
  pencilButton.setAttribute("aria-pressed", "false");
  pencilButton.hidden = !showsPencil;
  pencilButton.appendChild(lineIcon(doc, PENCIL));
  const select = mountSelectionMenu(row, session);
  const grid = mountGridControl(row, session, live);
  const bars = mountBarMenu(row, session, {
    live,
    ...(options.onRefused === undefined ? {} : { onRefused: options.onRefused }),
    ...(options.onChooseBars === undefined ? {} : { onChooseBars: options.onChooseBars }),
  });
  const meter = mountMeterControl(row, session, {
    live,
    ...(options.onRefused === undefined ? {} : { onRefused: options.onRefused }),
  });
  const spacer = create(doc, "span", "sce-spacer", row);
  // The badge and the switch end the row as one item, so a narrow row moves them to the next line together. They come
  // before the preview control in the row, and so in the tab order: the preview control comes and goes with the score
  // (it is there only while the score reads), and what comes after the switch cannot push it to the next line between a
  // person's typing and the tap that follows. Its place is kept while it is not there, so it cannot move the switch along
  // the line either (styles.ts).
  const end = options.viewSwitch ? create(doc, "div", "sce-toolbar-end", row) : null;
  const badge = create(doc, "span", "sce-badge", end ?? row);
  const views: ViewPart | null = end === null ? null : mountViewSwitch(end, session);
  const hint = options.hintId === undefined ? null : create(doc, "div", "sce-sr-only", root);
  if (hint && options.hintId !== undefined) hint.id = options.hintId;
  const song = options.tempoKey
    ? mountTempoKeyControls(row, session, {
        refused,
        live,
        showNotices: (notices) => noticeStrip.show(notices),
      })
    : null;
  const projectControl: ProjectControl | null = options.projectPanel
    ? mountProjectControl(row, root, session, live, options.onRefused)
    : null;
  let restore: ViewPart | null = null;
  /** The restore control is built only while the binding has a keeper, so a host without a store gets no draft DOM. */
  function syncRestore(): void {
    const keeper = options.draftKeeper;
    if (keeper !== undefined && keeper.status !== "destroyed") {
      if (restore === null) {
        restore = mountRestoreControl(
          row,
          session,
          {
            get status() {
              return keeper.status;
            },
            subscribe: (listener) => keeper.subscribe(() => listener()),
            restoreOriginal: () => keeper.restoreOriginal(),
          },
          (words) => live.say(words),
          spacer,
        );
      }
    } else if (restore !== null) {
      restore.destroy();
      restore = null;
    }
  }
  const synth = options.synthPreview === false ? null : mountSynthControl(row, session, live);
  if (synth) row.dataset.synth = "";
  // Last in the row, so the Tab order and the wrapping of the controls before it are as they were.
  const filter = mountFilterPanel(row, session);

  const abort = new AbortController();
  const { signal } = abort;
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
      [pencilButton, t.drawNotes, "B"],
    ] as const) {
      button.setAttribute("aria-label", label);
      button.title = `${label} (${keys})`;
    }
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
  const unsubscribePencil = pencil.subscribe(draw);
  const unsubscribeKeeper = options.draftKeeper?.subscribe(draw);
  let destroyed = false;
  return {
    openProject(field) {
      projectControl?.open(field);
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
      filter.destroy();
      grid.destroy();
      restore?.destroy();
      synth?.destroy();
      root.remove();
      releaseStyles();
    },
  };
}
