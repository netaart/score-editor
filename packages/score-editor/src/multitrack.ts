// ABOUTME: The multitrack part of a song project: added score tracks, audio tracks placed from takes, bindings, the base take,
// ABOUTME: the score-to-timeline map and every track's mixer settings. Plain data; a project without the part reads as the default one.

/** One mixer channel: volume in decibels from unity, pan from -1 (left) to 1 (right), and the two switches. */
export interface TrackMix {
  readonly volumeDb: number;
  readonly pan: number;
  readonly mute: boolean;
  readonly solo: boolean;
}

/** A track that sounds one synth timbre, named, through its mixer channel. */
export interface VoiceSettings {
  readonly timbre: string;
  readonly mix: TrackMix;
}

/** A sounding note of an added score track, in the package's own shape: `start` and `duration` in ticks, `midi` 0-127 (a drum piece's number on a drum track). The gaps between notes are the rests. */
export interface TrackNote {
  readonly start: number;
  readonly duration: number;
  readonly midi: number;
}

/** A score track the user added. Its notes are not dialect text: the dialect writes only Vocal, Ins and the chords. */
export interface ScoreTrack extends VoiceSettings {
  readonly id: string;
  readonly name: string;
  readonly drum: boolean;
  readonly notes: ReadonlyArray<TrackNote>;
}

/** A point of the score-to-timeline map: a nominal score time and a base-take timeline time, both in seconds. */
export interface TimePoint {
  readonly score: number;
  readonly timeline: number;
}

/** A point of a placement's map: a moment in the recording and the timeline moment it lands on, both in seconds. */
export interface Anchor {
  readonly recording: number;
  readonly timeline: number;
}

/** A span of the base timeline in seconds, from `start` up to `end`. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** One of a take's four stems. `null` in a placement means the take's whole recording, for a take that has no stems. */
export type StemName = "vocals" | "drums" | "bass" | "other";

/** One recording of a take laid on the base timeline: an audio track's own placement, or one of its candidates. */
export interface Placement {
  readonly id: string;
  /** The song2 task id of the take the recording came from. */
  readonly take: string;
  readonly stem: StemName | null;
  readonly anchors: ReadonlyArray<Anchor>;
  /** Spans of the timeline that are cut out: silent, with a short fade at each end. */
  readonly removed: ReadonlyArray<Span>;
  /** True when the alignment's self-check did not pass. */
  readonly uncertain: boolean;
  /** Spans of the timeline where the local stretch is suspect. */
  readonly suspect: ReadonlyArray<Span>;
}

/** An audio track: its placement and its channel, with the candidates kept under it. */
export interface AudioTrack extends Placement {
  readonly mix: TrackMix;
  readonly candidates: ReadonlyArray<Placement>;
}

/** The multitrack part of a song project. The audio itself is not in it: the take records hold the recordings. */
export interface MultitrackPart {
  /** The Vocal voice, the instrumental voice song2 follows (the dialect's Ins), and the Chords voice. */
  readonly vocal: VoiceSettings;
  readonly instrumental: VoiceSettings;
  readonly chords: VoiceSettings;
  readonly scoreTracks: ReadonlyArray<ScoreTrack>;
  readonly audioTracks: ReadonlyArray<AudioTrack>;
  /** Groups of audio track ids that are re-sung together; a track in no group is unbound. */
  readonly bindings: ReadonlyArray<ReadonlyArray<string>>;
  /** The task id of the base take, or `null` before the first take. */
  readonly baseTake: string | null;
  /** The anchors a person set on the score-to-timeline map, or `null` for the default proportional map. */
  readonly timeMap: ReadonlyArray<TimePoint> | null;
}

const DEFAULT_MIX: TrackMix = { volumeDb: 0, pan: 0, mute: false, solo: false };

/** The part a project without one reads as: the three dialect voices in their default timbres, and nothing added. */
export const DEFAULT_MULTITRACK: MultitrackPart = {
  vocal: { timbre: "lead", mix: DEFAULT_MIX },
  instrumental: { timbre: "square-lead", mix: DEFAULT_MIX },
  chords: { timbre: "pad", mix: DEFAULT_MIX },
  scoreTracks: [],
  audioTracks: [],
  bindings: [],
  baseTake: null,
  timeMap: null,
};

/** The part a project carries, or the default one when it carries none. */
export function multitrackOf(project: { readonly multitrack?: MultitrackPart }): MultitrackPart {
  return project.multitrack ?? DEFAULT_MULTITRACK;
}

/** Whether two parts hold the same data, however they were built: field by field, arrays in order. */
export function sameMultitrack(left: MultitrackPart, right: MultitrackPart): boolean {
  return sameData(left, right);
}

function sameData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => sameData((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}
