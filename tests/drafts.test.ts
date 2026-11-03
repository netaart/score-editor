// ABOUTME: Seam 1 for the draft document: the content hash and the JSON text, through the package entry in Node.
// ABOUTME: The expected hash is worked out with node:crypto over the UTF-8 bytes the test writes out itself.
import { createHash } from "node:crypto";
import {
  contentHash,
  DRAFT_FORMAT_VERSION,
  type DraftProject,
  draftText,
  type MultitrackPart,
  readDraft,
  type ScoreDraft,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

/** A hand-written lyric with non-ASCII text, and a hand-written score, so the bytes are not all ASCII. */
const LYRICS = `月亮升起
Moon rises`;
const SCORE = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
V: Vocal
C4D4E4F4|G16|`;

/** The independent implementation: SHA-256 of the UTF-8 bytes of the pair, written out here. */
function expectedHash(lyrics: string, score: string): string {
  const bytes = Buffer.from(JSON.stringify([lyrics, score]), "utf8");
  return createHash("sha256").update(bytes).digest("hex");
}

/** The part a version 1 draft reads as, written out from the spec: the three dialect voices in their default timbres, centred at unity, with nothing added. */
const DEFAULT_PART = {
  vocal: { timbre: "lead", mix: { volumeDb: 0, pan: 0, mute: false, solo: false } },
  instrumental: { timbre: "square-lead", mix: { volumeDb: 0, pan: 0, mute: false, solo: false } },
  chords: { timbre: "pad", mix: { volumeDb: 0, pan: 0, mute: false, solo: false } },
  scoreTracks: [],
  audioTracks: [],
  bindings: [],
  baseTake: null,
  timeMap: null,
};

const project: DraftProject = {
  style: "indie pop",
  lyrics: LYRICS,
  lyricLines: [
    { text: "月亮升起", phrase: { firstBar: 0, barCount: 1 } },
    { text: "Moon rises", phrase: null },
  ],
  score: SCORE,
  scoreMode: "melody",
  seed: 42,
  multitrack: DEFAULT_PART,
};

const draft: ScoreDraft = {
  version: DRAFT_FORMAT_VERSION,
  sourceKey: "song-1",
  sourceHash: expectedHash(LYRICS, SCORE),
  project,
  handoffHash: expectedHash("la la", SCORE),
  updatedAt: 1_700_000_000_000,
};

describe("the content hash", () => {
  it("is the lowercase SHA-256 of the UTF-8 bytes of the JSON pair", async () => {
    await expect(contentHash(LYRICS, SCORE)).resolves.toBe(expectedHash(LYRICS, SCORE));
  });

  it("does not normalise either text", async () => {
    const spaced = " a \r\n";
    const tabbed = "\ta \n";
    await expect(contentHash(spaced, tabbed)).resolves.toBe(expectedHash(spaced, tabbed));
    expect(expectedHash(spaced, tabbed)).not.toBe(expectedHash("a", "a"));
  });

  it("gives different texts different hashes", async () => {
    const first = await contentHash("one", SCORE);
    const second = await contentHash("two", SCORE);
    expect(first).not.toBe(second);
  });
});

describe("the format versions", () => {
  /** A version 1 draft as this package wrote it before the multitrack part existed, written out here by hand. */
  const VERSION_1_TEXT = JSON.stringify({
    version: 1,
    sourceKey: "song-1",
    sourceHash: expectedHash(LYRICS, SCORE),
    project: {
      style: "indie pop",
      lyrics: LYRICS,
      lyricLines: [
        { text: "月亮升起", phrase: { firstBar: 0, barCount: 1 } },
        { text: "Moon rises", phrase: null },
      ],
      score: SCORE,
      scoreMode: "melody",
      seed: 42,
    },
    handoffHash: null,
    updatedAt: 1_700_000_000_000,
  });

  it("reads a version 1 draft as version 2 with the default multitrack part: no added tracks, no audio tracks", () => {
    expect(readDraft(VERSION_1_TEXT)).toEqual({
      version: 2,
      sourceKey: "song-1",
      sourceHash: expectedHash(LYRICS, SCORE),
      project: {
        style: "indie pop",
        lyrics: LYRICS,
        lyricLines: [
          { text: "月亮升起", phrase: { firstBar: 0, barCount: 1 } },
          { text: "Moon rises", phrase: null },
        ],
        score: SCORE,
        scoreMode: "melody",
        seed: 42,
        multitrack: DEFAULT_PART,
      },
      handoffHash: null,
      updatedAt: 1_700_000_000_000,
    });
  });

  it("opens an old draft with none of the mood, ending, change record, stop mark or handoff fields", () => {
    for (const text of [VERSION_1_TEXT, draftText(draft)]) {
      const found = readDraft(text);
      expect(found).not.toBeNull();
      for (const field of ["mood", "ending", "changeRecords", "stoppedBatches", "handedOutAt"] as const) {
        expect(found?.project).not.toHaveProperty(field);
      }
    }
  });
});

/** A part with an entry of every kind, written out here, so a round trip is checked against these literals. */
const FULL_PART: MultitrackPart = {
  vocal: { timbre: "lead", mix: { volumeDb: -3, pan: 0, mute: false, solo: false } },
  instrumental: { timbre: "square-lead", mix: { volumeDb: 0, pan: -0.25, mute: true, solo: false } },
  chords: { timbre: "pad", mix: { volumeDb: 0, pan: 0, mute: false, solo: true } },
  scoreTracks: [
    {
      id: "score-track-1",
      name: "Hats",
      timbre: "metal",
      drum: true,
      notes: [
        { start: 0, duration: 128, midi: 42 },
        { start: 256, duration: 128, midi: 42 },
      ],
      mix: { volumeDb: -6, pan: 0.5, mute: false, solo: false },
    },
  ],
  audioTracks: [
    {
      id: "audio-track-1",
      take: "task-base",
      stem: "vocals",
      anchors: [
        { recording: 0, timeline: 0.5 },
        { recording: 12.25, timeline: 12 },
      ],
      removed: [{ start: 3, end: 4 }],
      uncertain: true,
      suspect: [{ start: 8, end: 9.5 }],
      mix: { volumeDb: 0, pan: 0, mute: false, solo: false },
      candidates: [
        { id: "candidate-1", take: "task-other", stem: null, anchors: [], removed: [], uncertain: false, suspect: [] },
      ],
    },
    {
      id: "audio-track-2",
      take: "task-base",
      stem: "drums",
      anchors: [{ recording: 0, timeline: 0.5 }],
      removed: [],
      uncertain: false,
      suspect: [],
      mix: { volumeDb: -2, pan: 0, mute: false, solo: false },
      candidates: [],
    },
  ],
  bindings: [["audio-track-1", "audio-track-2"]],
  baseTake: "task-base",
  timeMap: [
    { score: 0, timeline: 0.5 },
    { score: 61.5, timeline: 61.75 },
  ],
};

describe("the draft document", () => {
  it("reads a version 2 draft back with a multitrack part of every kind as it was written", () => {
    const withPart: ScoreDraft = {
      ...draft,
      project: { ...project, multitrack: FULL_PART },
      handoffHash: expectedHash("la la", SCORE),
    };
    expect(readDraft(draftText(withPart))).toEqual(withPart);
  });

  it("writes JSON and reads it back unchanged", () => {
    const text = draftText(draft);
    expect(JSON.parse(text)).toEqual(draft);
    expect(readDraft(text)).toEqual(draft);
  });

  it("keeps a null handoff hash and every project field", () => {
    const beforeHandoff: ScoreDraft = { ...draft, handoffHash: null };
    expect(readDraft(draftText(beforeHandoff))).toEqual(beforeHandoff);
    expect(readDraft(draftText({ ...draft, project: { ...project, seed: null } }))?.project.seed).toBeNull();
  });

  it("reads a text of an unknown format version as no draft", () => {
    expect(readDraft(JSON.stringify({ ...draft, version: 3 }))).toBeNull();
    expect(readDraft(JSON.stringify({ ...draft, version: 0 }))).toBeNull();
  });

  it("reads a text that is not a draft as no draft", () => {
    expect(readDraft("")).toBeNull();
    expect(readDraft("not json")).toBeNull();
    expect(readDraft("{}")).toBeNull();
    expect(readDraft(JSON.stringify({ ...draft, sourceKey: 7 }))).toBeNull();
    expect(readDraft(JSON.stringify({ ...draft, updatedAt: "yesterday" }))).toBeNull();
    expect(readDraft(JSON.stringify({ ...draft, project: { ...project, scoreMode: "other" } }))).toBeNull();
    expect(
      readDraft(
        JSON.stringify({ ...draft, project: { ...project, lyricLines: [{ text: "x", phrase: { firstBar: -1 } }] } }),
      ),
    ).toBeNull();
  });

  it("ignores a field it does not know", () => {
    const text = JSON.stringify({ ...draft, later: "ignored" });
    expect(readDraft(text)).toEqual(draft);
  });
});

describe("a version 2 draft's multitrack part", () => {
  const cases: ReadonlyArray<readonly [string, unknown]> = [
    ["the part is missing", undefined],
    ["the audio tracks are not a list", { ...FULL_PART, audioTracks: "none" }],
    [
      "a stem is not one of the four names or null",
      { ...FULL_PART, audioTracks: [{ ...FULL_PART.audioTracks[0], stem: "mix" }, FULL_PART.audioTracks[1]] },
    ],
    [
      "an anchor has no timeline position",
      {
        ...FULL_PART,
        audioTracks: [{ ...FULL_PART.audioTracks[0], anchors: [{ recording: 0 }] }, FULL_PART.audioTracks[1]],
      },
    ],
    [
      "a mixer switch is not true or false",
      { ...FULL_PART, vocal: { timbre: "lead", mix: { ...FULL_PART.vocal.mix, mute: "no" } } },
    ],
    [
      "a note starts between ticks",
      {
        ...FULL_PART,
        scoreTracks: [{ ...FULL_PART.scoreTracks[0], notes: [{ start: 0.5, duration: 128, midi: 42 }] }],
      },
    ],
    ["a binding names a track by a number", { ...FULL_PART, bindings: [[1, 2]] }],
    ["the base take is a number", { ...FULL_PART, baseTake: 7 }],
  ];

  it.each(cases)("reads as no draft when %s", (_description, multitrack) => {
    expect(readDraft(JSON.stringify({ ...draft, project: { ...project, multitrack } }))).toBeNull();
  });
});

/** The fields a song project keeps beside its score: each is absent, or a value of its kind; a malformed one makes the text no draft. */
describe("the fields a song project keeps beside its score", () => {
  it("reads a mood name back, and reads a mood that is not a name as no draft", () => {
    expect(readDraft(JSON.stringify({ ...draft, project: { ...project, mood: "bright" } }))?.project.mood).toBe(
      "bright",
    );
    expect(readDraft(JSON.stringify({ ...draft, project: { ...project, mood: 5 } }))).toBeNull();
  });

  it("reads an ending of either kind back, and any other ending as no draft", () => {
    expect(
      readDraft(JSON.stringify({ ...draft, project: { ...project, ending: "back-to-start" } }))?.project.ending,
    ).toBe("back-to-start");
    expect(readDraft(JSON.stringify({ ...draft, project: { ...project, ending: "end-here" } }))?.project.ending).toBe(
      "end-here",
    );
    expect(readDraft(JSON.stringify({ ...draft, project: { ...project, ending: "fade" } }))).toBeNull();
  });

  it("reads the stopped batches back as their names, and a list of anything else as no draft", () => {
    const stopped = { ...draft, project: { ...project, stoppedBatches: ["run-6"] } };
    expect(readDraft(JSON.stringify(stopped))?.project.stoppedBatches).toStrictEqual(["run-6"]);
    expect(readDraft(JSON.stringify({ ...draft, project: { ...project, stoppedBatches: [6] } }))).toBeNull();
  });

  it("reads the time of the last handoff of output back, and a time that is not a number as no draft", () => {
    const handedOut = { ...draft, project: { ...project, handedOutAt: 1_700_000_100_000 } };
    expect(readDraft(JSON.stringify(handedOut))?.project.handedOutAt).toBe(1_700_000_100_000);
    expect(readDraft(JSON.stringify({ ...draft, project: { ...project, handedOutAt: "later" } }))).toBeNull();
  });

  it("reads the change records back as they were written, and a record without the project before its batch as no draft", () => {
    const before = { ...project, modelId: "song2", sourceKey: "song-1" };
    const record = {
      author: "agent-a",
      batch: "run-1",
      at: 1_700_000_200_000,
      note: "Rested the D",
      commands: [{ type: "replaceScoreText", text: SCORE }],
      before,
    };
    expect(
      readDraft(JSON.stringify({ ...draft, project: { ...project, changeRecords: [record] } }))?.project.changeRecords,
    ).toStrictEqual([record]);
    expect(
      readDraft(
        JSON.stringify({ ...draft, project: { ...project, changeRecords: [{ ...record, before: undefined }] } }),
      ),
    ).toBeNull();
  });
});
