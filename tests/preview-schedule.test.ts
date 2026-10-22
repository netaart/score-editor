// ABOUTME: Seam 1 for the synth preview's schedule: song2 scores are read with the real dialect and turned into timed events, through the package entry in Node.
// ABOUTME: Every expected time and pitch is worked out by hand from the score text and its tempo; none is computed with the scheduler's own formula.
import { song2Constraints, song2Dialect } from "@neta-art/score-dialect-song2";
import { type PreviewEvent, type Score, schedulePreview } from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

/**
 * A song2 score: the fixed header with the given meter and tempo, a `Vocal` voice, an optional `Ins` voice. Each string
 * of `vocal` and `ins` is one block: what follows a `V:` line, so it may start with an `M:` field line.
 */
function song(options: { meter?: string; bpm?: number; vocal: string[]; ins?: string[] }): string {
  const { meter = "4/4", bpm = 120, vocal, ins } = options;
  const header = [
    "X:1",
    "T:",
    `M:${meter}`,
    "L:1/16",
    `Q:1/4=${bpm}`,
    'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
    ...(ins ? ['V: Ins clef=treble name="Ins Melody" snm="Inst."'] : []),
    "K:C",
    "% a",
  ];
  const body = [...vocal.flatMap((block) => ["V: Vocal", block]), ...(ins ?? []).flatMap((block) => ["V: Ins", block])];
  return [...header, ...body, ""].join("\n");
}

function read(text: string): Score {
  const { score } = song2Dialect.parse(text);
  if (!score) throw new Error("the test score does not read");
  return score;
}

/** The chord events, as [name, midis, at, length] tuples, in time order. */
function chordsOf(events: ReadonlyArray<PreviewEvent>) {
  return events.flatMap((event) => (event.kind === "chord" ? [[event.name, event.midis, event.at, event.length]] : []));
}

/** The note events of one voice, as [midi, at, length] triples, in time order. */
function notesOf(events: ReadonlyArray<PreviewEvent>, voice: string) {
  return events.flatMap((event) => (event.kind === "note" && event.voice === voice ? [event] : []));
}

describe("the schedule of a synth preview", () => {
  it("turns a melody into notes at the seconds its tempo gives: a quarter note lasts half a second at 120", () => {
    // Bar 1: C D E F as quarter notes. Bar 2: a whole note G. At 120 beats a minute a quarter note is 0.5 s.
    const schedule = schedulePreview(read(song({ vocal: ["C4D4E4F4|G16|"] })));

    const played = notesOf(schedule.events, "Vocal").map(({ midi, at, length }) => [midi, at, length]);
    expect(played).toEqual([
      [60, 0, 0.5],
      [62, 0.5, 0.5],
      [64, 1, 0.5],
      [65, 1.5, 0.5],
      [67, 2, 2],
    ]);
    expect(schedule.length).toBe(4);
  });
  it("leaves a rest silent but counts its time, so the note after it starts on time", () => {
    // C, a quarter rest, E, F: the rest takes the second half-second.
    const schedule = schedulePreview(read(song({ vocal: ["C4z4E4F4|G16|"] })));

    expect(notesOf(schedule.events, "Vocal").map(({ midi, at }) => [midi, at])).toEqual([
      [60, 0],
      [64, 1],
      [65, 1.5],
      [67, 2],
    ]);
  });

  it("plays a tied chain as one note from its first note to the end of its last, across a bar line too", () => {
    // Bar 1: C and C tied (a half note), then D tied over the bar line to a whole-note D in bar 2 (six quarters).
    const schedule = schedulePreview(read(song({ vocal: ["C4-C4D8-|D16|"] })));

    expect(notesOf(schedule.events, "Vocal").map(({ midi, at, length }) => [midi, at, length])).toEqual([
      [60, 0, 1],
      [62, 1, 3],
    ]);
    expect(schedule.length).toBe(4);
  });

  it("keeps time by the tempo of the score: a quarter note is a second at 60 and a quarter of a second at 240", () => {
    const slow = schedulePreview(read(song({ bpm: 60, vocal: ["C4D4E4F4|"] })));
    const fast = schedulePreview(read(song({ bpm: 240, vocal: ["C4D4E4F4|"] })));

    expect(notesOf(slow.events, "Vocal").map(({ at, length }) => [at, length])).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
    expect(notesOf(fast.events, "Vocal").map(({ at, length }) => [at, length])).toEqual([
      [0, 0.25],
      [0.25, 0.25],
      [0.5, 0.25],
      [0.75, 0.25],
    ]);
  });

  it("places the bars after a meter change by their own meter: 4/4, then 3/4, 2/4 and 6/8", () => {
    // At 120 a quarter note is 0.5 s. The bars last 2 s, 1.5 s, 1 s and 1.5 s; 6/8 is three quarters of a second apiece.
    const schedule = schedulePreview(
      read(
        song({
          vocal: ["C4D4E4F4|", "M:3/4\nG4A4B4|", "M:2/4\nc4c4|", "M:6/8\nd6d6|"],
        }),
      ),
    );

    expect(notesOf(schedule.events, "Vocal").map(({ midi, at, length }) => [midi, at, length])).toEqual([
      [60, 0, 0.5],
      [62, 0.5, 0.5],
      [64, 1, 0.5],
      [65, 1.5, 0.5],
      [67, 2, 0.5],
      [69, 2.5, 0.5],
      [71, 3, 0.5],
      [72, 3.5, 0.5],
      [72, 4, 0.5],
      [74, 4.5, 0.75],
      [74, 5.25, 0.75],
    ]);
    expect(schedule.length).toBe(6);
  });

  it("sounds each chord from where the score writes it to the next chord, and the last until the music ends", () => {
    // C for two beats, G for two beats, then Am for the whole of bar 2. At 120 that is 1 s, 1 s and 2 s.
    const schedule = schedulePreview(read(song({ vocal: ['"C"C4D4"G"E4F4|"Am"G16|'] })));

    expect(chordsOf(schedule.events)).toEqual([
      ["C", [36, 48, 52, 55], 0, 1],
      ["G", [43, 55, 59, 62], 1, 1],
      ["Am", [45, 57, 60, 64], 2, 2],
    ]);
  });

  it("voices a chord as its root two octaves under middle C and the chord stacked above it, the slash note as the bass", () => {
    // Pitches by hand: the bass is MIDI 36 plus the pitch class of the root (or of the slash note), and the chord is built
    // from MIDI 48 plus the pitch class, in semitones above the root.
    const names = ["C", "Am", "G7", "C/E", "Bb", "F#m7b5", "Dbb", "A##", "E7sus4", "Cm(maj7)", "F#m7/C#"];
    const schedule = schedulePreview(read(song({ vocal: names.map((name) => `"${name}"C16|`) })));

    expect(chordsOf(schedule.events).map(([name, midis]) => [name, midis])).toEqual([
      ["C", [36, 48, 52, 55]],
      ["Am", [45, 57, 60, 64]],
      ["G7", [43, 55, 59, 62, 65]],
      ["C/E", [40, 48, 52, 55]],
      ["Bb", [46, 58, 62, 65]],
      ["F#m7b5", [42, 54, 57, 60, 64]],
      ["Dbb", [36, 48, 52, 55]],
      ["A##", [47, 59, 63, 66]],
      ["E7sus4", [40, 52, 57, 59, 62]],
      ["Cm(maj7)", [36, 48, 51, 55, 59]],
      ["F#m7/C#", [37, 54, 57, 61, 64]],
    ]);
  });

  it("gives every chord name the format accepts the notes of its quality: all roots, all fifteen qualities", () => {
    // The semitones above the root that each quality of the format stands for.
    const intervals: Record<string, number[]> = {
      "": [0, 4, 7],
      m: [0, 3, 7],
      dim: [0, 3, 6],
      aug: [0, 4, 8],
      "7": [0, 4, 7, 10],
      maj7: [0, 4, 7, 11],
      m7: [0, 3, 7, 10],
      dim7: [0, 3, 6, 9],
      m7b5: [0, 3, 6, 10],
      sus4: [0, 5, 7],
      sus2: [0, 2, 7],
      "6": [0, 4, 7, 9],
      m6: [0, 3, 7, 9],
      "7sus4": [0, 5, 7, 10],
      "m(maj7)": [0, 3, 7, 11],
    };
    const letters: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const shift: Record<string, number> = { bb: -2, b: -1, "": 0, "#": 1, "##": 2 };
    const names = song2Constraints.chords.roots.flatMap((root) =>
      song2Constraints.chords.qualities.map((quality) => `${root}${quality}`),
    );
    expect(names).toHaveLength(35 * 15);

    const schedule = schedulePreview(read(song({ vocal: names.map((name) => `"${name}"C16|`) })));

    const heard = chordsOf(schedule.events);
    expect(heard.map(([name]) => name)).toEqual(names);
    for (const [name, midis] of heard) {
      const [, letter = "", accidental = "", quality = ""] = /^([A-G])(bb|b|##|#)?(.*)$/.exec(String(name)) ?? [];
      const root = (letters[letter] ?? 0) + (shift[accidental] ?? 0);
      const expected = (intervals[quality] ?? []).map((step) => (((root + step) % 12) + 12) % 12);
      const classes = (midis as number[]).map((midi) => midi % 12);
      // The bass is the root; above it the quality's notes, each once.
      expect(classes[0], name as string).toBe(((root % 12) + 12) % 12);
      expect(classes.slice(1), name as string).toEqual(expected);
      expect((midis as number[]).slice(1).every((midi, at, upper) => at === 0 || midi > (upper[at - 1] ?? 0))).toBe(
        true,
      );
    }
  });

  it("plays Vocal and Ins together, each voice as it is written, in time order", () => {
    // Ins holds two half notes, c (72) and e (76), over a bar of Vocal quarter notes. At 120 a half note is a second.
    const schedule = schedulePreview(read(song({ vocal: ["C4D4E4F4|"], ins: ["c8e8|"] })));

    expect(notesOf(schedule.events, "Vocal").map(({ midi, at }) => [midi, at])).toEqual([
      [60, 0],
      [62, 0.5],
      [64, 1],
      [65, 1.5],
    ]);
    expect(notesOf(schedule.events, "Ins").map(({ midi, at, length }) => [midi, at, length])).toEqual([
      [72, 0, 1],
      [76, 1, 1],
    ]);
    const times = schedule.events.map((event) => event.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("ends a cut score where its music stops, not at the end of the bar the cut is in", () => {
    // The text stops after the A of bar 2, a bar that should last until 4 s. The G chord sounds until the A ends.
    const text = song({ vocal: ['"C"C4D4E4F4|"G"G4A4'] }).trimEnd();
    const score = read(text);
    expect(score.truncation).not.toBeNull();

    const schedule = schedulePreview(score);

    expect(notesOf(schedule.events, "Vocal").map(({ midi, at }) => [midi, at])).toEqual([
      [60, 0],
      [62, 0.5],
      [64, 1],
      [65, 1.5],
      [67, 2],
      [69, 2.5],
    ]);
    expect(chordsOf(schedule.events).map(([name, , at, length]) => [name, at, length])).toEqual([
      ["C", 0, 2],
      ["G", 2, 1],
    ]);
    expect(schedule.length).toBe(3);
  });

  it("has nothing to play for a score with no pitched note", () => {
    const schedule = schedulePreview(read(song({ vocal: ["z16|"] })));

    expect(schedule.events).toEqual([]);
    expect(schedule.length).toBe(0);
  });

  describe("starting from a tick", () => {
    // Bar 1: C D E F as quarter notes with C over the first two beats and G over the last two; bar 2: a whole-note G under
    // Am. Ticks: a quarter note is 256, so beat 3 of bar 1 is tick 512. At 120 a tick is 1/512 of a second.
    const melody = song({ vocal: ['"C"C4D4"G"E4F4|"Am"G16|'] });

    it("starts at the beat it is given: what is written from there is played, counted from there", () => {
      const schedule = schedulePreview(read(melody), 512);

      expect(notesOf(schedule.events, "Vocal").map(({ midi, at, length }) => [midi, at, length])).toEqual([
        [64, 0, 0.5],
        [65, 0.5, 0.5],
        [67, 1, 2],
      ]);
      expect(chordsOf(schedule.events).map(([name, , at, length]) => [name, at, length])).toEqual([
        ["G", 0, 1],
        ["Am", 1, 2],
      ]);
      expect(schedule.length).toBe(3);
    });

    it("starting in the middle of a note does not sound that note again, but the chord in force is heard to its end", () => {
      // Tick 384 is halfway through the D (256 to 512) and a quarter of a second before the G chord.
      const schedule = schedulePreview(read(melody), 384);

      expect(notesOf(schedule.events, "Vocal").map(({ midi, at }) => [midi, at])).toEqual([
        [64, 0.25],
        [65, 0.75],
        [67, 1.25],
      ]);
      expect(chordsOf(schedule.events).map(([name, , at, length]) => [name, at, length])).toEqual([
        ["C", 0, 0.25],
        ["G", 0.25, 1],
        ["Am", 1.25, 2],
      ]);
    });

    it("skips a tied chain that began before the start, and plays the one that begins after it", () => {
      // Bar 1: C tied to C (ticks 0 to 512), then D over the bar line into bar 2 (ticks 512 to 2048).
      const tied = song({ vocal: ["C4-C4D8-|D16|"] });
      const schedule = schedulePreview(read(tied), 256);

      expect(notesOf(schedule.events, "Vocal").map(({ midi, at, length }) => [midi, at, length])).toEqual([
        [62, 0.5, 3],
      ]);
    });

    it("has nothing to play from the end of the music, or past it", () => {
      for (const tick of [2048, 5000]) {
        const schedule = schedulePreview(read(melody), tick);
        expect(schedule.events).toEqual([]);
        expect(schedule.length).toBe(0);
      }
    });
  });
});
