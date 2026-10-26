// ABOUTME: Seam 1 for editing chords below the UI: the session's constraints, the places a chord can go, and the names the picker offers.
// ABOUTME: Expected positions and names are worked out by hand from the bar grid and RULES.md C1 to C3, never from the code under test.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  type ChordSlot,
  chordChoices,
  chordSlots,
  createDialectRegistry,
  createEditingSession,
  type EditingSession,
  nearestChordSlot,
  type SongProject,
  splitChordName,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."`;

const dialects = createDialectRegistry([song2Dialect]);

const project: SongProject = {
  style: "",
  lyrics: "",
  score: "",
  scoreMode: "full",
  seed: null,
  modelId: "song2",
  sourceKey: "chord-edit-test",
};

/** Vocal: bar 1 is C D E F as quarter notes, bar 2 is a half rest then a half note. Ins: bar 1 is eight eighth notes. */
const TWO_VOICES = `${HEADER}
K:C
V: Vocal
C4D4E4F4|z8G8|
V: Ins
C2D2E2F2G2A2B2c2|C16|`;

function open(overrides: Partial<SongProject> = {}): EditingSession {
  return createEditingSession({ project: { ...project, score: TWO_VOICES, ...overrides }, dialects });
}

describe("the session's dialect constraints", () => {
  it("are those of the dialect that reads the project's model", () => {
    const constraints = open().dialect?.constraints;
    expect(constraints?.voices).toEqual([
      { name: "Vocal", required: true, allowsChords: true },
      { name: "Ins", required: false, allowsChords: false },
    ]);
    expect(constraints?.chords.slashBass).toBe(true);
  });

  it("are absent when the host imported no dialect for the model", () => {
    expect(open({ modelId: "other-model" }).dialect).toBeUndefined();
  });
});

/** The same Vocal with three chords: C and Am on notes, G on the half rest that starts bar 2. */
const CHORDED = `${HEADER}
K:C
V: Vocal
"C"C4D4"Am"E4F4|"G"z8G8|
V: Ins
C2D2E2F2G2A2B2c2|C16|`;

describe("the places a chord can go", () => {
  it("are the starts of the notes and rests of the voice that allows chords, with the chord there and the chord before", () => {
    const session = open({ score: CHORDED });
    const { reading } = session;
    const constraints = session.dialect?.constraints;
    if (reading.kind !== "score" || constraints === undefined) throw new Error("the fixture did not read");

    const slots = chordSlots(reading.score, constraints);

    expect(slots.map((slot) => [slot.noteId, slot.start, slot.duration, slot.chord, slot.before])).toEqual([
      ["Vocal:0", 0, 256, "C", null],
      ["Vocal:256", 256, 256, null, "C"],
      ["Vocal:512", 512, 256, "Am", "C"],
      ["Vocal:768", 768, 256, null, "Am"],
      ["Vocal:1024", 1024, 512, "G", "Am"],
      ["Vocal:1536", 1536, 512, null, "G"],
    ]);
    expect(slots.every((slot) => slot.voice === "Vocal")).toBe(true);
  });
});

describe("the places a chord can go in a dialect where two voices allow chords", () => {
  it("are the starts of both, and the voice listed first owns a start that both have", () => {
    const session = open();
    const { reading } = session;
    const constraints = session.dialect?.constraints;
    if (reading.kind !== "score" || constraints === undefined) throw new Error("the fixture did not read");
    const both = {
      ...constraints,
      voices: constraints.voices.map((voice) => ({ ...voice, allowsChords: true })),
    };

    const slots = chordSlots(reading.score, both);

    // Vocal starts at 0, 256, 512, 768, 1024 and 1536; Ins starts every 128 ticks in bar 1 and again at 1024.
    expect(slots.map((slot) => slot.start)).toEqual([0, 128, 256, 384, 512, 640, 768, 896, 1024, 1536]);
    expect(
      slots.filter((slot) => [0, 256, 512, 768, 1024, 1536].includes(slot.start)).map((slot) => slot.voice),
    ).toEqual(["Vocal", "Vocal", "Vocal", "Vocal", "Vocal", "Vocal"]);
    expect(slots.filter((slot) => slot.voice === "Ins").map((slot) => slot.noteId)).toEqual([
      "Ins:128",
      "Ins:384",
      "Ins:640",
      "Ins:896",
    ]);
  });

  it("are none when no voice allows chords", () => {
    const session = open();
    const { reading } = session;
    const constraints = session.dialect?.constraints;
    if (reading.kind !== "score" || constraints === undefined) throw new Error("the fixture did not read");
    const none = { ...constraints, voices: constraints.voices.map((voice) => ({ ...voice, allowsChords: false })) };

    expect(chordSlots(reading.score, none)).toEqual([]);
  });
});

describe("the nearest place for a chord", () => {
  function slotsOf(text: string): ReadonlyArray<ChordSlot> {
    const session = open({ score: text });
    const { reading } = session;
    const constraints = session.dialect?.constraints;
    if (reading.kind !== "score" || constraints === undefined) throw new Error("the fixture did not read");
    return chordSlots(reading.score, constraints);
  }
  // Starts at 0, 256, 512, 768, 1024 and 1536.
  const near = (tick: number) => nearestChordSlot(slotsOf(CHORDED), tick)?.noteId;

  it("is the start closest to the tick", () => {
    expect(near(100)).toBe("Vocal:0");
    expect(near(130)).toBe("Vocal:256");
    expect(near(850)).toBe("Vocal:768");
    expect(near(900)).toBe("Vocal:1024");
    expect(near(1250)).toBe("Vocal:1024");
    expect(near(1300)).toBe("Vocal:1536");
    expect(near(1400)).toBe("Vocal:1536");
  });

  it("is the earlier start when the tick is halfway between two", () => {
    expect(near(128)).toBe("Vocal:0");
    expect(near(1280)).toBe("Vocal:1024");
  });

  it("is a rest's start as well as a note's", () => {
    expect(near(1030)).toBe("Vocal:1024");
  });

  it("is the first start before the score and the last past its end", () => {
    expect(near(-40)).toBe("Vocal:0");
    expect(near(99999)).toBe("Vocal:1536");
  });

  it("is never an Ins start, even when one is closer", () => {
    // Ins has a note at 384, 128 ticks from Vocal's 256 and 512.
    expect(near(380)).toBe("Vocal:256");
  });

  it("is nothing where there is no place", () => {
    expect(nearestChordSlot([], 10)).toBeNull();
  });
});

describe("the names a chord picker offers", () => {
  // RULES.md C1 and C2: a letter and its five spellings, then fifteen qualities, then an optional slash bass.
  const QUALITIES = [
    "",
    "m",
    "dim",
    "aug",
    "7",
    "maj7",
    "m7",
    "dim7",
    "m7b5",
    "sus4",
    "sus2",
    "6",
    "m6",
    "7sus4",
    "m(maj7)",
  ];

  it("are the letters of the dialect's roots in the order C D E F G A B, with the spellings flat to sharp", () => {
    const choices = chordChoices(song2Dialect.constraints.chords);

    expect(choices.letters.map((found) => found.letter)).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
    expect(choices.letters.find((found) => found.letter === "F")?.roots).toEqual(["Fbb", "Fb", "F", "F#", "F##"]);
    expect(choices.letters.find((found) => found.letter === "B")?.roots).toEqual(["Bbb", "Bb", "B", "B#", "B##"]);
    expect(choices.qualities).toEqual(QUALITIES);
    expect(choices.slashBass).toBe(true);
  });

  it("are only what a narrower vocabulary has", () => {
    const choices = chordChoices({ roots: ["Bb", "C", "F#", "Eb", "Bbb"], qualities: ["", "7"], slashBass: false });

    expect(choices.letters).toEqual([
      { letter: "C", roots: ["C"] },
      { letter: "E", roots: ["Eb"] },
      { letter: "F", roots: ["F#"] },
      { letter: "B", roots: ["Bbb", "Bb"] },
    ]);
    expect(choices.qualities).toEqual(["", "7"]);
    expect(choices.slashBass).toBe(false);
  });

  it("leave out a root that is not a letter with the spellings the vocabulary documents", () => {
    const choices = chordChoices({ roots: ["C", "H", "Cx", "c", "C###"], qualities: [""], slashBass: false });

    expect(choices.letters).toEqual([{ letter: "C", roots: ["C"] }]);
  });

  it("build only names the command accepts: every root with every quality and bass, for song2 and a vocabulary with a slash quality", () => {
    const session = open({ score: CHORDED });
    const choices = chordChoices(song2Dialect.constraints.chords);
    const roots = choices.letters.flatMap((found) => found.roots);
    const names = [
      ...roots.flatMap((root) => choices.qualities.map((quality) => `${root}${quality}`)),
      ...roots.flatMap((bass) => choices.qualities.map((quality) => `C${quality}/${bass}`)),
    ];

    const refused = names.filter((name) => !session.dispatch({ type: "setChord", noteId: "Vocal:256", name }).ok);

    expect(names).toHaveLength(35 * 15 * 2);
    expect(refused).toEqual([]);

    const constraints = {
      ...song2Dialect.constraints,
      chords: { roots: ["C", "C#"], qualities: ["", "6/9"], slashBass: true },
    };
    const slashSession = createEditingSession({
      project: { ...project, score: CHORDED },
      dialects: createDialectRegistry([{ ...song2Dialect, constraints }]),
    });
    const slashChoices = chordChoices(constraints.chords);
    const slashRoots = slashChoices.letters.flatMap((found) => found.roots);
    const slashNames = [
      ...slashRoots.flatMap((root) => slashChoices.qualities.map((quality) => `${root}${quality}`)),
      ...slashRoots.flatMap((bass) => slashChoices.qualities.map((quality) => `C${quality}/${bass}`)),
    ];

    expect(slashChoices.qualities).toEqual([""]);
    expect(slashNames).not.toContain("C6/9");
    const slashRefused = slashNames.filter(
      (name) => !slashSession.dispatch({ type: "setChord", noteId: "Vocal:256", name }).ok,
    );
    expect(slashRefused).toEqual([]);
  });

  it("offer only the qualities the grammar can write for every offered root", () => {
    const vocabulary = { roots: ["C", "C#"], qualities: ["", "6/9"], slashBass: true };
    const choices = chordChoices(vocabulary);
    const roots = choices.letters.flatMap((found) => found.roots);
    const basses: Array<string | null> = [null, ...roots];

    expect(choices.qualities).toEqual([""]);
    for (const root of roots) {
      for (const quality of choices.qualities) {
        for (const bass of basses) {
          const name = `${root}${quality}${bass === null ? "" : `/${bass}`}`;
          expect(splitChordName(name, vocabulary), name).toEqual({ root, quality, bass });
        }
      }
    }
  });
});

describe("splitting a chord name by a vocabulary", () => {
  const song2 = song2Dialect.constraints.chords;

  it("gives the root, the quality and the bass of a name the vocabulary has", () => {
    expect(splitChordName("Am", song2)).toEqual({ root: "A", quality: "m", bass: null });
    expect(splitChordName("Bb", song2)).toEqual({ root: "Bb", quality: "", bass: null });
    expect(splitChordName("Cdim7", song2)).toEqual({ root: "C", quality: "dim7", bass: null });
    expect(splitChordName("Bbm7b5", song2)).toEqual({ root: "Bb", quality: "m7b5", bass: null });
    expect(splitChordName("F#m7/C#", song2)).toEqual({ root: "F#", quality: "m7", bass: "C#" });
    expect(splitChordName("Dbb/Ab", song2)).toEqual({ root: "Dbb", quality: "", bass: "Ab" });
  });

  it("gives nothing for a name the vocabulary does not have", () => {
    for (const name of ["", "c", "Cmaj", "CM7", "C13", "H", "C/", "C/E/G", "C/3", "C /E", "/E", "C#/", "Am7b"]) {
      expect(splitChordName(name, song2), name).toBeNull();
    }
  });

  it("gives nothing for a name with a bass where the vocabulary has no slash bass", () => {
    const flat = { ...song2, slashBass: false };
    expect(splitChordName("C/E", flat)).toBeNull();
    expect(splitChordName("C", flat)).toEqual({ root: "C", quality: "", bass: null });
  });

  it("follows a narrower vocabulary", () => {
    const narrow = { roots: ["C", "Bb"], qualities: ["", "7"], slashBass: true };
    expect(splitChordName("Bb7/C", narrow)).toEqual({ root: "Bb", quality: "7", bass: "C" });
    expect(splitChordName("Cm", narrow)).toBeNull();
    expect(splitChordName("D", narrow)).toBeNull();
    expect(splitChordName("C/D", narrow)).toBeNull();
  });

  it("gives nothing for a root or a bass root the ChordVocabulary contract does not allow", () => {
    const roots = { roots: ["C", "C###"], qualities: [""], slashBass: false };
    const bass = { ...roots, slashBass: true };

    expect(splitChordName("C###", roots)).toBeNull();
    expect(splitChordName("C/C###", bass)).toBeNull();
    expect(chordChoices(roots)).toEqual({
      letters: [{ letter: "C", roots: ["C"] }],
      qualities: [""],
      slashBass: false,
    });
  });
});
