// ABOUTME: Seam 1 for the draft document: the content hash and the JSON text, through the package entry in Node.
// ABOUTME: The expected hash is worked out with node:crypto over the UTF-8 bytes the test writes out itself.
import { createHash } from "node:crypto";
import {
  contentHash,
  DRAFT_FORMAT_VERSION,
  type DraftProject,
  draftText,
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

describe("the draft document", () => {
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
    expect(readDraft(JSON.stringify({ ...draft, version: 2 }))).toBeNull();
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
