// ABOUTME: The Web Audio side of the synth preview: oscillators with an envelope for notes and chords, and one shared audio context.
// ABOUTME: Every sound is made in the page from an oscillator; no sample, no worklet module and no request is involved.
import type { PreviewEvent, PreviewSchedule } from "./preview-schedule";

type ContextConstructor = new () => AudioContext;

/** The browser's audio context constructor, with the old WebKit name as a fallback, or null where there is none. */
function contextConstructor(): ContextConstructor | null {
  const scope = globalThis as { AudioContext?: ContextConstructor; webkitAudioContext?: ContextConstructor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/** Whether this browser can make sound with the Web Audio API at all. */
export function audioAvailable(): boolean {
  return contextConstructor() !== null;
}

/** How long a refused or interrupted `resume()` is waited for before the sound is given up as blocked. */
const RESUME_WAIT_MS = 500;
/** How long an idle context is kept running after its last user left, so a sound's release can finish. */
const IDLE_MS = 300;

let shared: AudioContext | null = null;
let users = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

/** One user of the shared audio context. `ready` settles true once the context is running, false if it is not. */
export interface AudioUse {
  readonly context: AudioContext;
  readonly ready: Promise<boolean>;
  /** Gives the context back; it is suspended once nobody uses it, so no audio device is held for an idle editor. */
  leave(): void;
}

/**
 * Takes part in the page's one audio context, making it first if there is none, and asks it to run. The browser lets a
 * context start only for a user gesture, so call this synchronously from a click, tap or key handler, before any
 * `await`. Returns null where there is no Web Audio.
 */
export function joinAudio(): AudioUse | null {
  const Context = contextConstructor();
  if (!Context) return null;
  if (!shared || shared.state === "closed") shared = new Context();
  const context = shared;
  users += 1;
  clearTimeout(idleTimer);
  const resumed = context.state === "running" ? Promise.resolve() : context.resume();
  const ready = Promise.race([
    resumed.then(
      () => context.state === "running",
      () => false,
    ),
    new Promise<boolean>((settle) => setTimeout(() => settle(false), RESUME_WAIT_MS)),
  ]);
  let left = false;
  return {
    context,
    ready,
    leave() {
      if (left) return;
      left = true;
      users -= 1;
      if (users > 0) return;
      idleTimer = setTimeout(() => {
        if (users === 0 && context.state === "running") void context.suspend().catch(() => undefined);
      }, IDLE_MS);
    },
  };
}

/** The seconds the sound of a note is allowed to ring on after its length, so the release is not cut. */
const TAIL = 0.02;
const MASTER_GAIN = 0.3;
/** Peak levels, before the master gain: a lead melody, a second voice (a square wave is bright, so it is quieter), a chord. */
const LEAD_LEVEL = 0.5;
const SECOND_VOICE_LEVEL = 0.16;
const CHORD_LEVEL = 0.4;

export function frequencyOf(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** One oscillator through its own envelope: a short attack, the level held, a short release to silence at `when + length`. */
function playTone(
  context: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  midi: number,
  when: number,
  length: number,
  level: number,
): OscillatorNode {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequencyOf(midi);
  const envelope = context.createGain();
  const attack = Math.min(0.008, length / 3);
  const release = Math.min(0.04, length / 3);
  envelope.gain.setValueAtTime(0, when);
  envelope.gain.linearRampToValueAtTime(level, when + attack);
  envelope.gain.setValueAtTime(level, when + length - release);
  envelope.gain.linearRampToValueAtTime(0, when + length);
  oscillator.connect(envelope).connect(out);
  oscillator.addEventListener("ended", () => envelope.disconnect(), { once: true });
  oscillator.start(when);
  oscillator.stop(when + length + TAIL);
  return oscillator;
}

/** A single pitch for a short time, through the shared context: the sound of a note preview. */
export function playPitch(context: AudioContext, midi: number, length: number): void {
  const out = context.createGain();
  out.gain.value = MASTER_GAIN;
  out.connect(context.destination);
  const tone = playTone(context, out, "triangle", midi, context.currentTime + 0.01, length, LEAD_LEVEL);
  tone.addEventListener("ended", () => out.disconnect(), { once: true });
}

export interface Sounding {
  /** Silences everything at once, with a short fade so there is no click. Safe to call twice. */
  stop(): void;
}

/** How far ahead of the audio clock events are handed to the audio thread, so a long song never makes thousands of nodes at once. */
const LOOKAHEAD = 4;
/** How often the next stretch is handed over. A hidden tab may run its timers only once a second, which the lookahead covers. */
const TOP_UP_MS = 200;

/**
 * Sounds `schedule` on `context` with its time zero at `begin`, on the audio clock. Events are placed a few seconds
 * ahead of the clock. `onEnd` is called once, after the last sound has ended, unless `stop` came first.
 */
export function sound(context: AudioContext, schedule: PreviewSchedule, begin: number, onEnd: () => void): Sounding {
  const master = context.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(context.destination);
  const live = new Set<OscillatorNode>();
  const leads = new Map<string, number>();
  const { events } = schedule;
  let next = 0;
  let finished = false;

  function place(event: PreviewEvent): void {
    const when = begin + event.at;
    const track = (oscillator: OscillatorNode): void => {
      live.add(oscillator);
      oscillator.addEventListener("ended", () => live.delete(oscillator), { once: true });
    };
    if (event.kind === "chord") {
      const level = CHORD_LEVEL / event.midis.length;
      for (const midi of event.midis) track(playTone(context, master, "sine", midi, when, event.length, level));
      return;
    }
    if (!leads.has(event.voice)) leads.set(event.voice, leads.size);
    const lead = leads.get(event.voice) === 0;
    track(
      playTone(
        context,
        master,
        lead ? "triangle" : "square",
        event.midi,
        when,
        event.length,
        lead ? LEAD_LEVEL : SECOND_VOICE_LEVEL,
      ),
    );
  }

  function topUp(): void {
    if (finished) return;
    const horizon = context.currentTime + LOOKAHEAD - begin;
    for (let event = events[next]; event && event.at <= horizon; event = events[next]) {
      place(event);
      next += 1;
    }
    if (next >= events.length && context.currentTime >= begin + schedule.length + TAIL) {
      end(false);
      onEnd();
    }
  }

  function end(fade: boolean): void {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    if (fade) {
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.03);
    }
    setTimeout(
      () => {
        for (const oscillator of live) {
          try {
            oscillator.stop();
          } catch {
            // Already stopped: nothing left to silence.
          }
        }
        live.clear();
        master.disconnect();
      },
      fade ? 60 : 0,
    );
  }

  const timer = setInterval(topUp, TOP_UP_MS);
  topUp();
  return {
    stop() {
      end(true);
    },
  };
}
