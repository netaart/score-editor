// ABOUTME: Seam 1 for the preview exports in a plain Node environment, which has no DOM and no Web Audio.
// ABOUTME: They must import and answer without touching either; what they do with a real audio device is the browser seam's.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createDialectRegistry,
  createEditingSession,
  mountSynthPreview,
  previewNote,
  previewPlayer,
  type SongProject,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

const project = (score: string): SongProject => ({
  style: "",
  lyrics: "",
  score,
  scoreMode: "full",
  seed: null,
  modelId: "song2",
  sourceKey: "n",
});

const SCORE = [
  "X:1",
  "T:",
  "M:4/4",
  "L:1/16",
  "Q:1/4=120",
  'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
  "K:C",
  "% a",
  "V: Vocal",
  "C4D4E4F4|",
  "",
].join("\n");

const dialects = createDialectRegistry([song2Dialect]);

describe("the single-note preview where there is no Web Audio", () => {
  it("resolves false and makes no sound, for a pitch that is allowed", async () => {
    expect(typeof AudioContext).toBe("undefined");
    expect(await previewNote(60)).toBe(false);
    expect(await previewNote(0)).toBe(false);
    expect(await previewNote(127, { duration: 2 })).toBe(false);
  });

  it("refuses at once, with a RangeError, a pitch that is no whole number from 0 to 127", () => {
    for (const bad of [-1, 128, 60.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => previewNote(bad), String(bad)).toThrow(RangeError);
    }
  });
});

describe("the preview player of a session where there is no Web Audio", () => {
  it("is one player for each session, idle until it is started", () => {
    const session = createEditingSession({ project: project(SCORE), dialects });
    const player = previewPlayer(session);
    expect(previewPlayer(session)).toBe(player);
    expect(previewPlayer(createEditingSession({ project: project(SCORE), dialects }))).not.toBe(player);
    expect(player.playing).toBe(false);
    expect(player.tick).toBeNull();
    expect(player.from).toBeNull();
  });

  it("says unsupported for a score it could play and nothing-to-play for one it cannot read", async () => {
    const readable = createEditingSession({ project: project(SCORE), dialects });
    expect(await previewPlayer(readable).start()).toBe("unsupported");
    const unreadable = createEditingSession({ project: project("not a score"), dialects });
    expect(await previewPlayer(unreadable).start()).toBe("nothing-to-play");
  });

  it("stops harmlessly when nothing plays, and a listener it was given can be taken away", () => {
    const session = createEditingSession({ project: project(SCORE), dialects });
    const player = previewPlayer(session);
    let heard = 0;
    const unsubscribe = player.subscribe(() => {
      heard += 1;
    });
    player.stop();
    player.stop();
    unsubscribe();
    unsubscribe();
    expect(heard).toBe(0);
  });
});

describe("the synth preview part without a DOM", () => {
  it("refuses to mount instead of failing obscurely", () => {
    const session = createEditingSession({ project: project(SCORE), dialects });
    expect(() => mountSynthPreview({} as HTMLElement, session)).toThrow(/browser/i);
  });
});
