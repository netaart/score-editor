// ABOUTME: A hand-written eight-bar tune in C major for the Vocal voice, used as the default score of the test page.
// ABOUTME: Original material; positions are in beats from the start, 4/4, and are converted to ticks (480 per beat).
const TICKS_PER_BEAT = 480;

// [MIDI pitch, start beat, length in beats]
const tune = [
  [64, 0, 1],
  [67, 1, 1],
  [72, 2, 2],
  [71, 4, 1.5],
  [69, 5.5, 0.5],
  [67, 6, 2],
  [65, 8, 1],
  [69, 9, 1],
  [74, 10, 2],
  [72, 12, 3],
  [64, 16, 1],
  [67, 17, 1],
  [76, 18, 1],
  [74, 19, 1],
  [72, 20, 1],
  [69, 21, 1],
  [67, 22, 2],
  [65, 24, 1],
  [67, 25, 1],
  [69, 26, 2],
  [72, 28, 4],
];

export function sampleScore() {
  return {
    bars: 8,
    notes: tune.map(([midi, beat, beats]) => ({
      voice: "Vocal",
      midi,
      start: beat * TICKS_PER_BEAT,
      duration: beats * TICKS_PER_BEAT,
    })),
  };
}
