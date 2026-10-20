// ABOUTME: Deterministic synthetic scores of realistic size, for the scale measurement and nothing else.
// ABOUTME: A seeded generator, so two runs measure the very same notes.
const TICKS_PER_BEAT = 480;
const GRID = TICKS_PER_BEAT / 4;

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** `notes` notes spread over `bars` bars of 4/4 and the given voices, sixteenth-note aligned, one note per start. */
export function syntheticScore({ bars = 128, notes = 1500, voices = ["Vocal", "Ins"], seed = 7 } = {}) {
  const next = random(seed);
  const total = bars * 4 * TICKS_PER_BEAT;
  const perVoice = Math.floor(notes / voices.length);
  const result = [];
  voices.forEach((voice, index) => {
    const slot = Math.floor(total / perVoice / GRID) * GRID;
    let midi = index === 0 ? 67 : 48;
    for (let i = 0; i < perVoice; i++) {
      midi = Math.min(index === 0 ? 79 : 60, Math.max(index === 0 ? 55 : 36, midi + Math.round((next() - 0.5) * 6)));
      const duration = Math.max(GRID, Math.min(slot, (1 + Math.floor(next() * 4)) * GRID));
      result.push({ voice, midi, start: i * slot, duration });
    }
  });
  return { bars, notes: result };
}
