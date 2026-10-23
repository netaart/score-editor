// ABOUTME: Seam 1 for selecting by filter: filterNotes over hand-written song2 scores, every condition alone and in combination.
// ABOUTME: Expected ids are worked out by hand from the score text and the tick grid (a quarter note is 256 ticks), never from the code under test.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { filterNotes, type NoteFilter, type Score } from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

function read(text: string): Score {
  const { score, diagnostics } = song2Dialect.parse(text);
  if (score === null) throw new Error(`the fixture does not read: ${JSON.stringify(diagnostics)}`);
  return score;
}

/** A Vocal-only score in the given key, one music line under one section. */
function vocal(music: string, key = "C"): Score {
  return read(`${HEADER}\nK:${key}\nV: Vocal\n${music}\n`);
}

/**
 * Four bars of 1024 ticks, one voice. The notes, with start (ticks), MIDI pitch and length (ticks):
 *   bar 1  C4 @0 60/256, D4 @256 62/256, E4 @512 64/256, F4 @768 65/256
 *   bar 2  G4 @1024 67/512, A4 @1536 69/256, a quarter rest @1792
 *   bar 3  C5 @2048 72/512, D5 @2560 74/512 tied over the bar line
 *   bar 4  D5 @3072 (the tied continuation, 512), E5 @3584 76/256, a quarter rest @3840
 * Counted as the filter counts them (a tie chain is one note), the pitched notes in order are
 * C4 D4 E4 F4 G4 A4 C5 D5(both segments, 1024 long) E5: nine notes, ten ids.
 */
const MELODY = vocal("C4D4E4F4|G8A4z4|c8d8-|d8e4z4|");

const ID = {
  C4: "Vocal:0",
  D4: "Vocal:256",
  E4: "Vocal:512",
  F4: "Vocal:768",
  G4: "Vocal:1024",
  A4: "Vocal:1536",
  restBar2: "Vocal:1792",
  C5: "Vocal:2048",
  D5: "Vocal:2560",
  D5tail: "Vocal:3072",
  E5: "Vocal:3584",
  restBar4: "Vocal:3840",
};
const EVERY_NOTE = [ID.C4, ID.D4, ID.E4, ID.F4, ID.G4, ID.A4, ID.C5, ID.D5, ID.D5tail, ID.E5];

describe("filterNotes without conditions", () => {
  it("takes every pitched note and no rest, with a tie chain as all its ids", () => {
    expect(filterNotes(MELODY, {})).toEqual(EVERY_NOTE);
  });

  it("takes nothing from a score with no pitched note", () => {
    expect(filterNotes(vocal("z16|z16|"), {})).toEqual([]);
  });
});

describe("the pitch condition", () => {
  it("takes the notes from the lowest to the highest pitch, both inclusive", () => {
    expect(filterNotes(MELODY, { pitch: { min: 64, max: 69 } })).toEqual([ID.E4, ID.F4, ID.G4, ID.A4]);
  });

  it("is open at an end that is not given", () => {
    expect(filterNotes(MELODY, { pitch: { min: 73 } })).toEqual([ID.D5, ID.D5tail, ID.E5]);
    expect(filterNotes(MELODY, { pitch: { max: 60 } })).toEqual([ID.C4]);
  });

  it("takes nothing when the lowest pitch is above the highest", () => {
    expect(filterNotes(MELODY, { pitch: { min: 70, max: 60 } })).toEqual([]);
  });
});

describe("the time condition", () => {
  it("takes the notes that start from the first tick up to, and not including, the last", () => {
    expect(filterNotes(MELODY, { time: { from: 1024, to: 2048 } })).toEqual([ID.G4, ID.A4]);
    expect(filterNotes(MELODY, { time: { to: 256 } })).toEqual([ID.C4]);
  });

  it("judges a tie chain by where it starts, and takes the whole chain", () => {
    expect(filterNotes(MELODY, { time: { from: 2560, to: 3072 } })).toEqual([ID.D5, ID.D5tail]);
  });

  it("does not take a chain that began before the range because a later segment starts inside it", () => {
    expect(filterNotes(MELODY, { time: { from: 3072 } })).toEqual([ID.E5]);
  });
});

describe("the duration condition", () => {
  it("takes the notes from the shortest to the longest length, both inclusive", () => {
    expect(filterNotes(MELODY, { duration: { min: 512, max: 512 } })).toEqual([ID.G4, ID.C5]);
    expect(filterNotes(MELODY, { duration: { max: 256 } })).toEqual([ID.C4, ID.D4, ID.E4, ID.F4, ID.A4, ID.E5]);
  });

  it("measures a tie chain as one note, the length of all its segments", () => {
    // D5 is two 512-tick segments joined over the bar line: one note of 1024, not two of 512.
    expect(filterNotes(MELODY, { duration: { min: 1024 } })).toEqual([ID.D5, ID.D5tail]);
    expect(filterNotes(MELODY, { duration: { min: 512, max: 768 } })).toEqual([ID.G4, ID.C5]);
  });
});

describe("the key condition", () => {
  /**
   * C major until tick 512, G major from there. Pitch classes by hand: C major is C D E F G A B, G major is G A B C D E F#.
   *   @0 C4 60 in C        @256 D#4 63 out of C   @512 F#4 66 in G (F in the G key signature)   @768 Bb4 70 out of G
   *   @1024 G4 67 in G     @1280 F#4 66 in G      @1536 F4 65 (natural sign) out of G          @1792 A4 69 in G
   */
  const CHANGING = vocal("C4^D4[K:G]F4_B4|G4F4=F4A4|");

  it("takes the notes whose pitch class is in the key that is in force where the note starts", () => {
    expect(filterNotes(CHANGING, { key: "in" })).toEqual([
      "Vocal:0",
      "Vocal:512",
      "Vocal:1024",
      "Vocal:1280",
      "Vocal:1792",
    ]);
  });

  it("takes the others when asked for the notes out of the key", () => {
    expect(filterNotes(CHANGING, { key: "out" })).toEqual(["Vocal:256", "Vocal:768", "Vocal:1536"]);
  });

  it("reads a minor key as its natural minor scale and a flat key by pitch class, not by spelling", () => {
    // A minor: A B C D E F G. @0 A4 69 in, @256 G#4 68 out, @512 F4 65 in, @768 F#4 66 out.
    const minor = vocal("A4^G4F4^F4|", "Am");
    expect(filterNotes(minor, { key: "in" })).toEqual(["Vocal:0", "Vocal:512"]);
    expect(filterNotes(minor, { key: "out" })).toEqual(["Vocal:256", "Vocal:768"]);
    // E flat major: Eb F G Ab Bb C D. @0 E4 (flat by the key) 63 in, @256 E natural 64 out, @512 B4 (flat by the key) 70 in,
    // @768 D#4 63 in: the same pitch as Eb.
    const flat = vocal("E4=E4B4^D4|", "Eb");
    expect(filterNotes(flat, { key: "in" })).toEqual(["Vocal:0", "Vocal:512", "Vocal:768"]);
    expect(filterNotes(flat, { key: "out" })).toEqual(["Vocal:256"]);
  });

  it("judges a tie chain by the key at its start", () => {
    // The G4 at 768 is tied over the bar line, and the key becomes D flat major at 1024, where a G is out of the key. The
    // chain starts in C major, where G is in, so both of its segments are in and none is out.
    const tied = vocal("C4D4E4G4-|[K:Db]G4z4z8|");
    expect(filterNotes(tied, { key: "in" })).toEqual(["Vocal:0", "Vocal:256", "Vocal:512", "Vocal:768", "Vocal:1024"]);
    expect(filterNotes(tied, { key: "out" })).toEqual([]);
  });
});

describe("the count condition", () => {
  // The nine notes of MELODY in order, numbered from 0: C4 D4 E4 F4 G4 A4 C5 D5 (a chain of two ids) E5.
  it("takes one note in every N, starting with the first", () => {
    expect(filterNotes(MELODY, { count: { every: 2 } })).toEqual([ID.C4, ID.E4, ID.G4, ID.C5, ID.E5]);
  });

  it("passes over the first notes named by skip before it starts counting", () => {
    expect(filterNotes(MELODY, { count: { every: 2, skip: 1 } })).toEqual([ID.D4, ID.F4, ID.A4, ID.D5, ID.D5tail]);
    expect(filterNotes(MELODY, { count: { every: 3, skip: 2 } })).toEqual([ID.E4, ID.A4, ID.E5]);
  });

  it("takes every note when N is 1, and nothing when skip is past the last note", () => {
    expect(filterNotes(MELODY, { count: { every: 1 } })).toEqual(EVERY_NOTE);
    expect(filterNotes(MELODY, { count: { every: 1, skip: 9 } })).toEqual([]);
  });

  it("counts a tie chain once, and takes all of its ids when it is the one", () => {
    // Note number 7 is D5, the chain of two segments; number 8 is E5, so skipping 7 of 9 and taking every 2nd leaves D5 alone.
    expect(filterNotes(MELODY, { count: { every: 2, skip: 7 } })).toEqual([ID.D5, ID.D5tail]);
  });

  it("counts among the notes the other conditions let through, not among all the notes", () => {
    // From F4 up the notes are F4 G4 A4 C5 D5 E5: every 2nd from the first is F4, A4, D5. Counted among all nine notes
    // and then narrowed to F4 and above, the even-numbered notes would give G4, C5 and E5.
    expect(filterNotes(MELODY, { pitch: { min: 65 }, count: { every: 2 } })).toEqual([ID.F4, ID.A4, ID.D5, ID.D5tail]);
  });

  it("counts each voice on its own", () => {
    const two = read(`${HEADER}
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% a
V: Vocal
C4D4E8|
V: Ins
G,4A,4B,8|
`);
    // Counted along Vocal and then Ins as one line, every 2nd would be Vocal:0, Vocal:512 and Ins:256. Each voice has its own count.
    expect(filterNotes(two, { count: { every: 2 } })).toEqual(["Vocal:0", "Vocal:512", "Ins:0", "Ins:512"]);
  });
});

describe("a count that cannot be made", () => {
  // No condition is refused and none throws: numbers that mean no place in the line take nothing, as an empty range does.
  it("takes nothing when N is not a whole number of 1 or more, or skip is not a whole number of 0 or more", () => {
    for (const count of [
      { every: 0 },
      { every: -2 },
      { every: 1.5 },
      { every: 2, skip: -1 },
      { every: 2, skip: 0.5 },
    ]) {
      expect(filterNotes(MELODY, { count }), JSON.stringify(count)).toEqual([]);
    }
  });
});

describe("invert", () => {
  it("takes the pitched notes that the conditions do not take, and no rest", () => {
    expect(filterNotes(MELODY, { pitch: { min: 64, max: 69 }, invert: true })).toEqual([
      ID.C4,
      ID.D4,
      ID.C5,
      ID.D5,
      ID.D5tail,
      ID.E5,
    ]);
  });

  it("inverts the result of every condition together, the count included", () => {
    // The even-numbered notes are C4 E4 G4 C5 E5, so the others are D4 F4 A4 and the two ids of D5.
    expect(filterNotes(MELODY, { count: { every: 2 }, invert: true })).toEqual([ID.D4, ID.F4, ID.A4, ID.D5, ID.D5tail]);
  });

  it("takes nothing when there is no condition to invert, and everything when the conditions take nothing", () => {
    expect(filterNotes(MELODY, { invert: true })).toEqual([]);
    expect(filterNotes(MELODY, { pitch: { min: 70, max: 60 }, invert: true })).toEqual(EVERY_NOTE);
  });

  it("is off when it is false", () => {
    expect(filterNotes(MELODY, { pitch: { max: 60 }, invert: false })).toEqual([ID.C4]);
  });
});

describe("conditions together", () => {
  it("take only the notes that satisfy all of them", () => {
    // F4 or higher, and a quarter note: F4, A4 and E5. G4 and C5 are half notes and D5 is a whole note.
    expect(filterNotes(MELODY, { pitch: { min: 65 }, duration: { max: 256 } })).toEqual([ID.F4, ID.A4, ID.E5]);
  });

  it("combine pitch, time and length", () => {
    // Up to A4, starting from tick 512 and before 3072, and exactly a quarter note: E4, F4 and A4.
    expect(
      filterNotes(MELODY, { pitch: { max: 69 }, time: { from: 512, to: 3072 }, duration: { min: 256, max: 256 } }),
    ).toEqual([ID.E4, ID.F4, ID.A4]);
  });

  it("combine the key with a pitch range", () => {
    const changing = vocal("C4^D4[K:G]F4_B4|G4F4=F4A4|");
    // Out of the key and D#4 (63) or higher: D#4, Bb4 and F4 natural, which are all of the notes out of the key.
    expect(filterNotes(changing, { key: "out", pitch: { min: 63 } })).toEqual(["Vocal:256", "Vocal:768", "Vocal:1536"]);
    // In the key and G4 (67) or higher: G4 and A4. The two F#4 at 66 are below.
    expect(filterNotes(changing, { key: "in", pitch: { min: 67 } })).toEqual(["Vocal:1024", "Vocal:1792"]);
  });

  it("take the notes of both voices, in the order of the score", () => {
    const two = read(`${HEADER}
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% a
V: Vocal
C4D4E8|
V: Ins
G,4A,4B,8|
`);
    // From A3 (57) up: all of Vocal, and A3 and B3 of Ins; the G3 (55) of Ins is below. Vocal comes first, then Ins.
    expect(filterNotes(two, { pitch: { min: 57 } })).toEqual([
      "Vocal:0",
      "Vocal:256",
      "Vocal:512",
      "Ins:256",
      "Ins:512",
    ]);
  });
});
