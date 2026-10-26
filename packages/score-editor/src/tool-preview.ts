// ABOUTME: What a tool preview shows: the project a tool would make, shared by the Tools panel and every voice track.
// ABOUTME: The panel writes the preview; a track draws the notes that would change as the drag's dashed outlines, and nothing is dispatched.
import type { SongProject } from "./score";
import type { EditingSession } from "./session";

/** The result a tool would make, held while the panel shows it. Null when no preview is shown. */
export interface ToolPreview {
  readonly project: SongProject;
}

export interface ToolPreviewChannel {
  /** The preview in progress, or null. */
  readonly current: ToolPreview | null;
  /** Shows a preview, or with null takes the outlines down. */
  show(preview: ToolPreview | null): void;
  /** Calls `listener` after every change of the preview. Returns the function that unsubscribes it. */
  subscribe(listener: () => void): () => void;
}

const channels = new WeakMap<EditingSession, ToolPreviewChannel>();

/** The preview channel of one session, made on first use. The panel writes it and every voice track reads it. */
export function toolPreviewChannel(session: EditingSession): ToolPreviewChannel {
  const known = channels.get(session);
  if (known) return known;
  const listeners = new Set<() => void>();
  let current: ToolPreview | null = null;
  const channel: ToolPreviewChannel = {
    get current() {
      return current;
    },
    show(preview) {
      if (preview === null && current === null) return;
      current = preview;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  channels.set(session, channel);
  return channel;
}
