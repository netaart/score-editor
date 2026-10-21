// ABOUTME: Deterministic synthetic song2 scores of realistic size, for the scale measurement and the ?big demo.
// ABOUTME: A seeded generator, so two runs measure the very same notes; every output is valid song2 text.

const ALLOWED = [1, 2, 3, 4, 6, 8, 12, 16];
const SECTION_NAMES = ["intro", "verse", "chorus", "verse", "chorus", "bridge", "outro"];
const BARS_PER_LINE = 4;
const BARS_PER_SECTION = 16;
const CHORDS = ["C", "F", "G", "Am", "Dm", "G7", "Em", "C/E"];

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Every ordered way to split one 4/4 bar (16 sixteenths) into `parts` allowed durations. */
const compositions = new Map();
function splitsOf(parts, total = 16) {
  const key = `${parts}:${total}`;
  const cached = compositions.get(key);
  if (cached) return cached;
  const result = [];
  if (parts === 1) {
    if (ALLOWED.includes(total)) result.push([total]);
  } else {
    for (const first of ALLOWED) {
      if (first >= total) continue;
      for (const rest of splitsOf(parts - 1, total - first)) result.push([first, ...rest]);
    }
  }
  compositions.set(key, result);
  return result;
}

/** Natural notes of C major from C3 as ABC pitch spellings, lowest first. */
const NATURALS = [..."CDEFGAB"]
  .flatMap((letter) => [`${letter},`])
  .concat(
    [..."CDEFGAB"],
    [..."cdefgab"],
    [..."cdefgab"].map((letter) => `${letter}'`),
  );

/**
 * A song2 score of `bars` bars of 4/4 and about `notes` pitched notes over `Vocal` and `Ins`, in sections of
 * 16 bars, with one chord per `Vocal` bar and at most four bars per music line.
 */
export function syntheticSong({ bars = 128, notes = 1500, voices = 2, seed = 7 } = {}) {
  const next = random(seed);
  const perBar = notes / (bars * voices);
  const lines = ["X:1", "T:", "M:4/4", "L:1/16", "Q:1/4=120", 'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"'];
  if (voices > 1) lines.push('V: Ins clef=treble name="Ins Melody" snm="Inst."');
  lines.push("K:C");

  const pitch = [14, 8];
  const bar = (voice, index) => {
    const target = Math.round(perBar * (index + 1)) - Math.round(perBar * index);
    const parts = Math.min(8, Math.max(2, target));
    const choices = splitsOf(parts);
    const durations = choices[Math.floor(next() * choices.length)];
    const low = voice === 0 ? 7 : 1;
    const high = voice === 0 ? 21 : 13;
    let text = voice === 0 ? `"${CHORDS[Math.floor(next() * CHORDS.length)]}"` : "";
    for (const duration of durations) {
      pitch[voice] = Math.min(high, Math.max(low, (pitch[voice] ?? low) + Math.round((next() - 0.5) * 4)));
      text += `${NATURALS[pitch[voice] ?? low]}${duration}`;
    }
    return text;
  };

  for (let first = 0; first < bars; first += BARS_PER_LINE) {
    if (first % BARS_PER_SECTION === 0) {
      lines.push(`% ${SECTION_NAMES[(first / BARS_PER_SECTION) % SECTION_NAMES.length]}`);
    }
    const count = Math.min(BARS_PER_LINE, bars - first);
    for (let voice = 0; voice < voices; voice++) {
      lines.push(voice === 0 ? "V: Vocal" : "V: Ins");
      const cells = [];
      for (let index = 0; index < count; index++) cells.push(bar(voice, first + index));
      lines.push(`${cells.join("|")}|`);
    }
  }
  return `${lines.join("\n")}\n`;
}
