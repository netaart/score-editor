// ABOUTME: Seam 1 for the voice commands and tools: octave moves and the instrumental version on hand-written scores.
// ABOUTME: The expected texts are worked out from the music and writer rules, never from running the command under test.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  applyScoreCommand,
  createDialectRegistry,
  createEditingSession,
  formatDiagnostic,
  NOTE_TOOLS,
  type ScoreTool,
  type SongProject,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";
import { SAMPLE_SWEEP_TIMEOUT } from "./song2-support";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

const TWO_VOICES = `${HEADER}
V: Ins clef=treble name="Ins Melody" snm="Inst."`;

function oneVoice(body: string): string {
  return `${HEADER}
K:C
V: Vocal
${body}`;
}

function twoVoices(vocal: string, ins: string): string {
  return `${TWO_VOICES}
K:C
V: Vocal
${vocal}
V: Ins
${ins}`;
}

const project: SongProject = {
  style: "pop",
  lyrics: "",
  score: oneVoice("C4D4E4F4|G16|"),
  scoreMode: "full",
  seed: null,
  modelId: "song2",
  sourceKey: "voice-tools-test",
};

const dialects = createDialectRegistry([song2Dialect]);

function tool(id: string): ScoreTool {
  const found = NOTE_TOOLS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no built-in tool ${id}`);
  return found;
}

function sessionWith(score: string): ReturnType<typeof createEditingSession> {
  return createEditingSession({ project: { ...project, score }, dialects, grid: { value: 16 } });
}

describe("voice octave", () => {
  it("moves C4 D4 E4 F4 and G4 up one octave, and reports the median as singable", () => {
    const result = applyScoreCommand(song2Dialect, oneVoice("C4D4E4F4|G16|"), { type: "voiceOctave", octaves: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(oneVoice("c4d4e4f4|g16|"));
    expect(result.report).toEqual({ kind: "voiceOctave", octaves: 1, medianMidi: 76, singable: true });
  });

  it("moves up two octaves and down one and two octaves", () => {
    for (const [octaves, body] of [
      [2, "c'4d'4e'4f'4|g'16|"],
      [-1, "C,4D,4E,4F,4|G,16|"],
      [-2, "C,,4D,,4E,,4F,,4|G,,16|"],
    ] as const) {
      const result = applyScoreCommand(song2Dialect, oneVoice("C4D4E4F4|G16|"), {
        type: "voiceOctave",
        octaves,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.text).toBe(oneVoice(body));
    }
  });

  it("leaves Ins, the chords and the key timeline alone", () => {
    const before = twoVoices('"C"C4D4[K:G]E4F4|', "C4D4[K:G]E4F4|");
    const result = applyScoreCommand(song2Dialect, before, { type: "voiceOctave", octaves: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain('"C"');
    expect(result.text).toContain("[K:G]");
    expect(result.text).toContain("V: Ins\nC4D4[K:G]E4F4|");
    expect(result.text).toBe(twoVoices('"C"c4d4[K:G]e4f4|', "C4D4[K:G]E4F4|"));
  });

  it("refuses the whole move at the bottom of MIDI", () => {
    const result = applyScoreCommand(song2Dialect, oneVoice("C,,,,,4z4D4z4|"), { type: "voiceOctave", octaves: -1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("voice-octave-range");
    expect(result.diagnostic.params).toMatchObject({ voice: "Vocal", octaves: -1, midi: 0, moved: -12 });
    expect(formatDiagnostic(result.diagnostic, "en")).toContain("MIDI 0");
  });

  it("refuses the whole move at the top of MIDI", () => {
    const result = applyScoreCommand(song2Dialect, oneVoice("c''''4z4C4z4|"), { type: "voiceOctave", octaves: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("voice-octave-range");
    expect(result.diagnostic.params).toMatchObject({ midi: 120, moved: 132 });
  });

  it("reports no median and no singable range when Vocal has no pitched notes", () => {
    const result = applyScoreCommand(song2Dialect, oneVoice("z16|z16|"), { type: "voiceOctave", octaves: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(oneVoice("z16|z16|"));
    expect(result.report).toEqual({ kind: "voiceOctave", octaves: 1, medianMidi: null, singable: false });
  });
});

describe("instrumental version", () => {
  it("moves Vocal's notes into an empty Ins and leaves rests in Vocal", () => {
    const result = applyScoreCommand(song2Dialect, twoVoices("C4D4E4F4|G16|", "Z|Z|"), {
      type: "instrumentalVersion",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(twoVoices("z16|z16|", "C4D4E4F4|G16|"));
    expect(result.report).toEqual({ kind: "instrumentalVersion", moved: 5, shortened: 0, dropped: 0 });
  });

  it("cuts, splits and drops the Ins notes the moved notes overlap", () => {
    const before = twoVoices("z4C4z8|D4z12|z4E4z8|", "F16|G4z12|A8z8|");
    const result = applyScoreCommand(song2Dialect, before, { type: "instrumentalVersion" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(twoVoices("z16|z16|z16|", "F4C4F8|D4z12|A4E4z8|"));
    expect(result.report).toEqual({ kind: "instrumentalVersion", moved: 3, shortened: 2, dropped: 1 });
  });

  it("keeps a Vocal tie across a bar as one moved Ins span", () => {
    const before = twoVoices("z8C8-|C8z8|", "Z|Z|");
    const result = applyScoreCommand(song2Dialect, before, { type: "instrumentalVersion" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(twoVoices("z16|z16|", "z8C8-|C8z8|"));
    expect(result.report).toEqual({ kind: "instrumentalVersion", moved: 1, shortened: 0, dropped: 0 });
  });

  it("keeps every chord and changes none of them", () => {
    const before = twoVoices('"C"C4z4"D"D4z4|', "Z|");
    const result = applyScoreCommand(song2Dialect, before, { type: "instrumentalVersion" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = song2Dialect.parse(result.text).score;
    expect(after?.chords.map((chord) => [chord.start, chord.name])).toEqual([
      [0, "C"],
      [512, "D"],
    ]);
  });
});

describe("the built-in voice tools in the Tools panel", () => {
  it("both tools exist in the Transform group and produce the two commands", () => {
    const octave = tool("voice-octave");
    const instrumental = tool("instrumental-version");
    expect(octave.group).toBe("transform");
    expect(instrumental.group).toBe("transform");
    expect(octave.parameters?.map((parameter) => parameter.name)).toEqual(["octaves"]);
    expect(instrumental.parameters ?? []).toEqual([]);

    const session = sessionWith(oneVoice("C4D4E4F4|G16|"));
    const moved = session.runTool(octave, { octaves: "1" });
    expect(moved.ok).toBe(true);
    expect(moved.reports?.[0]).toEqual({ kind: "voiceOctave", octaves: 1, medianMidi: 76, singable: true });
    expect(moved.project.score).toBe(oneVoice("c4d4e4f4|g16|"));
  });
});

describe("the voice commands on every sample", () => {
  const directory = new URL("../packages/score-dialect-song2/tests/", import.meta.url);
  const facts = JSON.parse(readFileSync(new URL("samples.json", directory), "utf8")) as { file: string }[];

  for (const fact of facts) {
    it(`${fact.file}: octave up or a range refusal, then the instrumental version`, {
      timeout: SAMPLE_SWEEP_TIMEOUT,
    }, () => {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      const before = song2Dialect.parse(text).score;
      expect(before).not.toBeNull();
      if (before === null) return;
      const octave = applyScoreCommand(song2Dialect, text, { type: "voiceOctave", octaves: 1 });
      if (octave.ok) {
        const after = song2Dialect.parse(octave.text).score;
        expect(after, `${fact.file}: octave text reads`).not.toBeNull();
        if (after === null) return;
        expect(after.notes.filter((note) => note.voice === "Ins")).toEqual(
          before.notes.filter((note) => note.voice === "Ins"),
        );
        expect(after.chords).toEqual(before.chords);
        expect(after.keys).toEqual(before.keys);
      } else {
        expect(octave.diagnostic.code).toBe("voice-octave-range");
      }

      const instrumental = applyScoreCommand(song2Dialect, text, { type: "instrumentalVersion" });
      if (!before.voices.includes("Ins")) {
        expect(instrumental.ok, `${fact.file}: instrumental version needs Ins`).toBe(false);
        if (instrumental.ok) return;
        expect(instrumental.diagnostic.code).toBe("instrumental-voice-missing");
        return;
      }
      expect(instrumental.ok, `${fact.file}: instrumental version`).toBe(true);
      if (!instrumental.ok) return;
      const after = song2Dialect.parse(instrumental.text).score;
      expect(after, `${fact.file}: instrumental text reads`).not.toBeNull();
      if (after === null) return;
      expect(after.chords).toEqual(before.chords);
      expect(after.notes.filter((note) => note.voice === "Vocal").every((note) => note.midi === null)).toBe(true);
      expect(after.voices).toContain("Ins");
    });
  }
});

describe("the tools in the session", () => {
  it("runs the instrumental version as one undo step and returns its report", () => {
    const session = sessionWith(twoVoices("C4D4E4F4|G16|", "Z|Z|"));
    const before = session.project.score;
    const result = session.runTool(tool("instrumental-version"));

    expect(result.ok).toBe(true);
    expect(result.reports?.[0]).toEqual({ kind: "instrumentalVersion", moved: 5, shortened: 0, dropped: 0 });
    expect(session.project.score).toBe(twoVoices("z16|z16|", "C4D4E4F4|G16|"));
    session.undo();
    expect(session.project.score).toBe(before);
  });
});
