// ABOUTME: The preview player of one editing session: starts and stops the synth preview and publishes the tick under the playhead.
// ABOUTME: It knows the session and the audio, and no view; the arrangement view subscribes to it and draws the playhead from the tick it publishes.
import { type PreviewSchedule, schedulePreview } from "./preview-schedule";
import type { Score } from "./score";
import type { EditingSession } from "./session";
import { type AudioUse, audioAvailable, joinAudio, type Sounding, sound } from "./synth-engine";
import { secondsAtTick, tickAtSeconds } from "./tempo";

/**
 * What `start` came to. `"started"`: the preview is playing. `"nothing-to-play"`: there is no readable score, or nothing
 * is written from where the preview would start. `"unsupported"`: this browser has no Web Audio. `"blocked"`: the browser
 * did not let the sound start, which it does when no user gesture asked for it. `"cancelled"`: `stop` or a change of the
 * score came before the sound had started.
 */
export type PreviewStart = "started" | "nothing-to-play" | "unsupported" | "blocked" | "cancelled";

export interface PreviewPlayer {
  /** Whether the preview is sounding. */
  readonly playing: boolean;
  /** The tick under the playhead while playing, a fraction of a tick between frames; null otherwise. */
  readonly tick: number | null;
  /** The tick the preview started from while it plays; null otherwise. */
  readonly from: number | null;
  /**
   * Plays the synthetic preview of the session's score from `fromTick`, or from the insertion point when no tick is
   * given, or from the start when there is no insertion point or the session is not editable. A browser lets sound
   * start only for a user gesture, so call this synchronously from a click, tap or key handler. Does nothing while the
   * preview already plays.
   */
  start(fromTick?: number): Promise<PreviewStart>;
  /** Silences the preview at once. Does nothing when nothing plays. */
  stop(): void;
  /**
   * Calls `listener` when the preview starts or stops and after every frame it moves in. Read `playing` and `tick`
   * from the player. Returns the function that unsubscribes it.
   */
  subscribe(listener: () => void): () => void;
}

/** Seconds between the moment the sound is handed to the audio thread and its time zero, so the first notes are not late. */
const LEAD = 0.06;

interface Running {
  readonly score: Score;
  readonly schedule: PreviewSchedule;
  readonly use: AudioUse;
  readonly sounding: Sounding;
  readonly begin: number;
  readonly stopWatching: () => void;
  frame: number;
}

class Player implements PreviewPlayer {
  private listeners: Array<() => void> = [];
  private running: Running | null = null;
  private pending: Promise<PreviewStart> | null = null;
  private cancelled = false;
  private current: number | null = null;

  constructor(private readonly session: EditingSession) {}

  get playing(): boolean {
    return this.running !== null;
  }

  get tick(): number | null {
    return this.current;
  }

  get from(): number | null {
    return this.running?.schedule.fromTick ?? null;
  }

  start(fromTick?: number): Promise<PreviewStart> {
    if (this.running) return Promise.resolve("started");
    this.pending ??= this.begin(fromTick).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  /** Runs synchronously as far as asking for the audio context, which is what a browser wants inside a user gesture. */
  private async begin(fromTick?: number): Promise<PreviewStart> {
    const { session } = this;
    const reading = session.reading;
    if (reading.kind !== "score") return "nothing-to-play";
    if (!audioAvailable()) return "unsupported";
    const from =
      fromTick !== undefined && Number.isFinite(fromTick)
        ? Math.max(0, Math.floor(fromTick))
        : session.view.editable
          ? (session.insertionPoint?.tick ?? 0)
          : 0;
    const schedule = schedulePreview(reading.score, from);
    if (schedule.events.length === 0) return "nothing-to-play";
    const use = joinAudio();
    if (!use) return "unsupported";
    const project = session.project;
    this.cancelled = false;
    const ready = await use.ready;
    if (this.cancelled || session.project !== project) {
      use.leave();
      return "cancelled";
    }
    if (!ready) {
      use.leave();
      return "blocked";
    }
    this.play(reading.score, schedule, use);
    return "started";
  }

  private play(score: Score, schedule: PreviewSchedule, use: AudioUse): void {
    const { context } = use;
    const begin = context.currentTime + LEAD;
    const sounding = sound(context, schedule, begin, () => this.stop());
    const unsubscribe = this.session.subscribe((change) => {
      if (change.project) this.stop();
    });
    const interrupted = () => {
      if (context.state !== "running") this.stop();
    };
    const mediaStarted = (event: Event) => {
      if (typeof HTMLMediaElement !== "undefined" && event.target instanceof HTMLMediaElement) this.stop();
    };
    const escapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") this.stop();
    };
    context.addEventListener("statechange", interrupted);
    document.addEventListener("keydown", escapeKey);
    document.addEventListener("play", mediaStarted, true);
    this.running = {
      score,
      schedule,
      use,
      sounding,
      begin,
      frame: 0,
      stopWatching: () => {
        unsubscribe();
        context.removeEventListener("statechange", interrupted);
        document.removeEventListener("play", mediaStarted, true);
        document.removeEventListener("keydown", escapeKey);
      },
    };
    this.advance();
    if (this.running) this.running.frame = requestAnimationFrame(() => this.onFrame());
  }

  /** Moves the published tick to what the listener of this audio device is hearing now. */
  private advance(): void {
    const running = this.running;
    if (!running) return;
    const { context } = running.use;
    const latency = Number.isFinite(context.outputLatency) ? context.outputLatency : 0;
    const elapsed = Math.min(Math.max(0, context.currentTime - latency - running.begin), running.schedule.length);
    this.current = tickAtSeconds(running.score, secondsAtTick(running.score, running.schedule.fromTick) + elapsed);
    this.publish();
  }

  private onFrame(): void {
    const running = this.running;
    if (!running) return;
    this.advance();
    if (this.running) this.running.frame = requestAnimationFrame(() => this.onFrame());
  }

  stop(): void {
    if (this.pending && !this.running) this.cancelled = true;
    const running = this.running;
    if (!running) return;
    this.running = null;
    this.current = null;
    cancelAnimationFrame(running.frame);
    running.stopWatching();
    running.sounding.stop();
    running.use.leave();
    this.publish();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((other) => other !== listener);
    };
  }

  private publish(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

const players = new WeakMap<EditingSession, Player>();

/**
 * The preview player of `session`: one for each session, made on first use, so every control and view bound to the
 * session shows the same playback. Making it touches no audio; sound is made only by `start`.
 */
export function previewPlayer(session: EditingSession): PreviewPlayer {
  let player = players.get(session);
  if (!player) {
    player = new Player(session);
    players.set(session, player);
  }
  return player;
}

const holds = new WeakMap<EditingSession, number>();

/**
 * A control takes the player of `session` and gives it back when it is destroyed. The last one to give it back stops
 * the preview, so a destroyed editor does not leave music playing with no control to stop it.
 */
export function holdPreviewPlayer(session: EditingSession): { player: PreviewPlayer; release(): void } {
  const player = previewPlayer(session);
  holds.set(session, (holds.get(session) ?? 0) + 1);
  let released = false;
  return {
    player,
    release() {
      if (released) return;
      released = true;
      const left = (holds.get(session) ?? 1) - 1;
      holds.set(session, left);
      if (left <= 0) player.stop();
    },
  };
}
