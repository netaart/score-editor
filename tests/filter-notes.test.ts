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
