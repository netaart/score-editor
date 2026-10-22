// ABOUTME: Score commands that change the bar grid: insert a bar, delete bars, and redraw one section's meter.
// ABOUTME: The truncation commands fill or delete an incomplete bar; this file decides the model, the dialect decides the bytes.
import type { ScoreCommandResult } from "./commands";
import type { CommandDiagnosticCode, DiagnosticAt, DiagnosticParams } from "./diagnostics";
import {
  type Bar,
  type Chord,
  type KeyChange,
  type Meter,
  type Note,
  noteId,
  type Score,
  TICKS_PER_QUARTER,
  type Truncation,
} from "./score";
import type { DialectConstraints, DurationSet, MeterRule } from "./types";

const VOICE_NOTE_ID = /^([^:]+):(-?[0-9]+)$/;

function fail(code: CommandDiagnosticCode, params: DiagnosticParams, at: DiagnosticAt): ScoreCommandResult {
  return { ok: false, diagnostic: { code, params, at } };
}

function barTicks(meter: Meter): number {
  return (4 * meter.numerator * TICKS_PER_QUARTER) / meter.denominator;
}

function isIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function effectiveKeyAt(score: Score, at: number): string {
  let key = score.keys[0]?.key ?? "C";
  for (const change of score.keys) {
    if (change.at <= at) key = change.key;
    else break;
  }
  return key;
}

function keyInForceBefore(score: Score, at: number): string {
  let key = score.keys[0]?.key ?? "C";
  for (const change of score.keys) {
    if (change.at < at) key = change.key;
    else break;
  }
  return key;
}

function keyChangesInside(keys: ReadonlyArray<KeyChange>, start: number, length: number): KeyChange[] {
  return keys.filter((change) => change.at > start && change.at < start + length).map((change) => ({ ...change }));
}

/** Rebuilds sections from their markers. An unnamed section is added when music comes before the first marker. */
function sectionsFrom(
  score: Score,
  markers: ReadonlyArray<{ name: string | null; firstBar: number }>,
): Score["sections"] {
  const ordered = [...markers].sort((left, right) => left.firstBar - right.firstBar);
  const withUnnamed =
    ordered.length === 0 || (ordered[0] as { firstBar: number }).firstBar > 0
      ? [{ name: null, firstBar: 0 }, ...ordered]
      : ordered;
  return withUnnamed.map((section, index) => {
    const next = withUnnamed[index + 1]?.firstBar ?? score.bars.length;
    return {
      name: section.name,
      firstBar: Math.max(0, section.firstBar),
      barCount: Math.max(0, next - section.firstBar),
    };
  });
}

function orderNotes(score: Score, notes: ReadonlyArray<Note>): Note[] {
  const order = new Map<string, number>();
  for (let index = 0; index < score.voices.length; index += 1) order.set(score.voices[index] as string, index);
  return [...notes].sort((left, right) => {
    const voice = (order.get(left.voice) ?? 0) - (order.get(right.voice) ?? 0);
    return voice !== 0 ? voice : left.start - right.start;
  });
}

function shiftNote(note: Note, barShift: number, startShift: number): Note {
  const start = note.start + startShift;
  return { ...note, id: noteId(note.voice, start), bar: note.bar + barShift, start };
}

function tiesCross(score: Score, at: number): string | null {
  for (const voice of score.voices) {
    const notes = score.notes.filter((note) => note.voice === voice).sort((left, right) => left.start - right.start);
    for (let index = 0; index < notes.length; index += 1) {
      const note = notes[index] as Note;
      if (!note.tie) continue;
      const next = notes[index + 1];
      if (next === undefined) {
        if (note.start < at) return voice;
        continue;
      }
      if (note.start < at && next.start >= at) return voice;
      if (note.start < at && note.start + note.duration > at) return voice;
    }
  }
  return null;
}

function coverageEnd(score: Score, voice: string): number {
  let end = 0;
  for (const note of score.notes) {
    if (note.voice === voice && note.bar + 1 > end) end = note.bar + 1;
  }
  return end;
}

/** The cut the text would have after a truncation command: the first voice whose bars stop before the score does. */
function truncationFromCoverage(score: Score): Truncation | null {
  for (const voice of score.voices) {
    const end = coverageEnd(score, voice);
    if (end < score.bars.length) return { voice, bar: end, short: false };
  }
  return null;
}

function gcd(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

function fillBar(
  score: Score,
  barIndex: number,
  voice: string,
  durations: DurationSet,
): { notes: Note[]; clearedTies: Set<string> } {
  const bar = score.bars[barIndex] as Bar;
  const voiceNotes = score.notes
    .filter((note) => note.voice === voice && note.bar === barIndex)
    .sort((left, right) => left.start - right.start);
  let end = bar.start;
  for (const note of voiceNotes) end = Math.max(end, note.start + note.duration);
  const gap = bar.start + bar.length - end;
  const notes = [...score.notes];
  const clearedTies = new Set<string>();
  if (gap > 0) {
    let step = bar.length;
    for (const note of score.notes.filter((item) => item.bar === barIndex)) step = gcd(step, note.duration);
    step = Math.max(1, step);
    const whole = gap / step;
    const pieces: number[] =
      Number.isInteger(whole) && durations.includes(whole)
        ? [gap]
        : Array.from({ length: Math.ceil(whole) }, () => step);
    let at = end;
    for (const duration of pieces) {
      if (duration <= 0) continue;
      notes.push({ id: noteId(voice, at), voice, bar: barIndex, start: at, duration, midi: null, tie: false });
      at += duration;
    }
    const before = [...notes]
      .filter((note) => note.voice === voice && note.start < end)
      .sort((left, right) => left.start - right.start);
    const previous = before[before.length - 1];
    if (previous?.tie) clearedTies.add(previous.id);
  }
  return {
    notes: notes.map((note) => (clearedTies.has(note.id) ? { ...note, tie: false } : note)),
    clearedTies,
  };
}

function insertBar(score: Score, at: number): ScoreCommandResult {
  if (!isIndex(at) || at > score.bars.length || score.bars.length === 0) {
    return fail("bar-out-of-range", { bar: at + 1, bars: score.bars.length }, { bar: at + 1 });
  }
  if (score.truncation !== null && at > score.truncation.bar) {
    return fail("truncated-tail", { bar: at + 1 }, { bar: at + 1 });
  }
  const crossing = tiesCross(score, at < score.bars.length ? (score.bars[at] as Bar).start : barEnd(score));
  if (crossing !== null) return fail("tie-across-bar", { voice: crossing }, { voice: crossing, bar: at + 1 });

  const next = at < score.bars.length ? (score.bars[at] as Bar) : null;
  const previous = at > 0 ? (score.bars[at - 1] as Bar) : null;
  const start = next !== null ? next.start : barEnd(score);
  const meter = previous !== null ? previous.meter : (next as Bar).meter;
  const length = barTicks(meter);
  const key =
    at === 0
      ? (score.keys[0]?.key ?? (next as Bar).key)
      : at < score.bars.length
        ? keyInForceBefore(score, start)
        : effectiveKeyAt(score, start);

  const bars: Bar[] = score.bars.map((bar, index) =>
    index < at
      ? bar
      : {
          ...bar,
          index: bar.index + 1,
          start: bar.start + length,
          keyChanges: bar.keyChanges.map((change) => ({ ...change, at: change.at + length })),
        },
  );
  bars.splice(at, 0, {
    index: at,
    start,
    length,
    meter,
    key,
    keyChanges: [],
    incomplete: false,
  });

  const keys = score.keys.map((change, index) =>
    index === 0 || change.at < start ? change : { ...change, at: change.at + length },
  );
  const notes: Note[] = score.notes.map((note) => (note.start < start ? note : shiftNote(note, 1, length)));
  for (const voice of score.voices) {
    notes.push({ id: noteId(voice, start), voice, bar: at, start, duration: length, midi: null, tie: false });
  }

  const moved = (_voice: string, noteStart: number): number => (noteStart < start ? noteStart : noteStart + length);
  const chords = score.chords.map((chord) =>
    chord.start < start
      ? { ...chord, noteId: chord.noteId === null ? null : movedChordId(chord.noteId, moved) }
      : {
          ...chord,
          start: chord.start + length,
          noteId: chord.noteId === null ? null : movedChordId(chord.noteId, moved),
        },
  );

  let owner = -1;
  for (let index = 0; index < score.sections.length; index += 1) {
    const section = score.sections[index] as Score["sections"][number];
    if (section.firstBar < at) owner = index;
  }
  if (owner < 0) owner = 0;
  const markers = score.sections.map((section, index) => ({
    name: section.name,
    firstBar: index > owner ? section.firstBar + 1 : section.firstBar,
  }));

  const truncation =
    score.truncation === null || score.truncation.bar < at
      ? score.truncation
      : { ...score.truncation, bar: score.truncation.bar + 1 };

  return {
    ok: true,
    score: {
      ...score,
      bars,
      keys,
      notes: orderNotes(score, notes),
      chords,
      sections: sectionsFrom({ ...score, bars }, markers),
      truncation,
    },
  };
}

function barEnd(score: Score): number {
  const last = score.bars[score.bars.length - 1] as Bar;
  return last.start + last.length;
}

function movedChordId(id: string, moved: (voice: string, start: number) => number): string {
  const match = VOICE_NOTE_ID.exec(id);
  if (match === null) return id;
  return noteId(match[1] as string, moved(match[1] as string, Number(match[2])));
}

function deleteBars(score: Score, from: number, count: number): ScoreCommandResult {
  if (!isIndex(from) || !isIndex(count) || count < 1 || from + count > score.bars.length) {
    return fail("bar-out-of-range", { from: from + 1, count, bars: score.bars.length }, { bar: from + 1 });
  }
  const to = from + count - 1;
  if (score.truncation !== null && to >= score.truncation.bar) {
    return fail("truncated-tail", { bar: score.truncation.bar + 1 }, { bar: score.truncation.bar + 1 });
  }
  const first = score.bars[from] as Bar;
  const last = score.bars[to] as Bar;
  const rangeStart = first.start;
  const rangeEnd = last.start + last.length;
  const length = rangeEnd - rangeStart;

  const bars: Bar[] = [];
  for (const bar of score.bars) {
    if (bar.index >= from && bar.index <= to) continue;
    if (bar.index < from) {
      bars.push(bar);
      continue;
    }
    bars.push({
      ...bar,
      index: bar.index - count,
      start: bar.start - length,
      keyChanges: bar.keyChanges.map((change) => ({
        ...change,
        at: change.at >= rangeEnd ? change.at - length : change.at,
      })),
    });
  }

  const keys: KeyChange[] = [];
  for (let index = 0; index < score.keys.length; index += 1) {
    const change = score.keys[index] as KeyChange;
    if (index === 0) keys.push(change);
    else if (change.at < rangeStart) keys.push(change);
    else if (change.at >= rangeEnd) keys.push({ ...change, at: change.at - length });
  }
  const nextBar = score.bars[to + 1];
  if (nextBar !== undefined) {
    const before = keys.filter((change) => change.at < rangeStart);
    const keyBefore = before[before.length - 1]?.key ?? score.keys[0]?.key ?? "C";
    const already = keys.some((change, changeIndex) => changeIndex > 0 && change.at === rangeStart);
    if (!already && nextBar.key !== keyBefore) keys.push({ at: rangeStart, key: nextBar.key });
    keys.sort((left, right) => left.at - right.at);
  }

  const oldByVoice = new Map<string, Note[]>();
  for (const note of score.notes) {
    const list = oldByVoice.get(note.voice) ?? [];
    list.push(note);
    oldByVoice.set(note.voice, list);
  }
  for (const list of oldByVoice.values()) list.sort((left, right) => left.start - right.start);
  const oldNext = new Map<string, string>();
  for (const list of oldByVoice.values()) {
    for (let index = 0; index + 1 < list.length; index += 1) {
      oldNext.set((list[index] as Note).id, (list[index + 1] as Note).id);
    }
  }
  const oldById = new Map(score.notes.map((note) => [note.id, note]));

  const notes: Note[] = [];
  const survivingIds = new Map<string, string>();
  const newToOld = new Map<string, string>();
  for (const note of score.notes) {
    if (note.bar >= from && note.bar <= to) continue;
    if (note.bar > to) {
      const shifted = shiftNote(note, -count, -length);
      survivingIds.set(note.id, shifted.id);
      newToOld.set(shifted.id, note.id);
      notes.push(shifted);
    } else {
      survivingIds.set(note.id, note.id);
      newToOld.set(note.id, note.id);
      notes.push(note);
    }
  }

  const chords: Chord[] = [];
  for (const chord of score.chords) {
    if (chord.start >= rangeStart && chord.start < rangeEnd) continue;
    const start = chord.start >= rangeEnd ? chord.start - length : chord.start;
    const noteIdValue = chord.noteId === null ? null : (survivingIds.get(chord.noteId) ?? chord.noteId);
    chords.push({ ...chord, start, noteId: noteIdValue });
  }

  const voiceNotes = new Map<string, Note[]>();
  for (const note of notes) {
    const list = voiceNotes.get(note.voice) ?? [];
    list.push(note);
    voiceNotes.set(note.voice, list);
  }
  for (const list of voiceNotes.values()) list.sort((left, right) => left.start - right.start);
  const cutTies = new Set<string>();
  for (const list of voiceNotes.values()) {
    for (let index = 0; index < list.length; index += 1) {
      const note = list[index] as Note;
      if (!note.tie) continue;
      const oldId = newToOld.get(note.id) ?? note.id;
      const oldNextId = oldNext.get(oldId);
      const removed = oldNextId === undefined ? undefined : oldById.get(oldNextId);
      if (removed !== undefined && removed.bar >= from && removed.bar <= to) {
        cutTies.add(note.id);
        continue;
      }
      const next = list[index + 1];
      if (next === undefined || next.start !== note.start + note.duration) cutTies.add(note.id);
    }
  }
  const finalNotes = notes.map((note) => (cutTies.has(note.id) ? { ...note, tie: false } : note));

  const removedBefore = (at: number): number => Math.min(Math.max(at - from, 0), count);
  const markers = score.sections
    .filter((section) => !(section.firstBar >= from && section.firstBar <= to))
    .map((section) => ({ name: section.name, firstBar: section.firstBar - removedBefore(section.firstBar) }));

  const truncation = score.truncation === null ? null : { ...score.truncation, bar: score.truncation.bar - count };

  return {
    ok: true,
    score: {
      ...score,
      bars: bars.map((bar, index) => ({ ...bar, index })),
      keys,
      notes: orderNotes(score, finalNotes),
      chords,
      sections: sectionsFrom({ ...score, bars }, markers),
      truncation,
      hasChords: score.hasChords && (chords.length > 0 || score.truncation?.short === true),
    },
  };
}

function meterAllowed(meter: Meter, rule: MeterRule): boolean {
  if (!Number.isInteger(meter.numerator) || !Number.isInteger(meter.denominator)) return false;
  if (meter.numerator < rule.numerator.min || meter.numerator > rule.numerator.max) return false;
  if (meter.denominator < rule.denominator.min || meter.denominator > rule.denominator.max) return false;
  if (rule.denominator.powerOfTwo && (meter.denominator & (meter.denominator - 1)) !== 0) return false;
  return true;
}

function splitNoteAt(note: Note, boundaries: ReadonlyArray<number>): Note[] {
  const points = boundaries.filter((at) => at > note.start && at < note.start + note.duration);
  if (points.length === 0) return [note];
  const starts = [note.start, ...points];
  const ends = [...points, note.start + note.duration];
  return starts.map((start, index) => {
    const last = index === starts.length - 1;
    return {
      ...note,
      id: noteId(note.voice, start),
      start,
      duration: (ends[index] as number) - start,
      tie: note.midi !== null && (last ? note.tie : true),
    };
  });
}

function setSectionMeter(score: Score, sectionIndex: number, meter: Meter, rule: MeterRule): ScoreCommandResult {
  if (!isIndex(sectionIndex) || sectionIndex >= score.sections.length) {
    return fail("section-out-of-range", { section: sectionIndex + 1, sections: score.sections.length }, { bar: 1 });
  }
  if (!meterAllowed(meter, rule)) {
    return fail("meter-not-allowed", { numerator: meter.numerator, denominator: meter.denominator }, { bar: 1 });
  }
  const section = score.sections[sectionIndex] as Score["sections"][number];
  if (section.barCount === 0) return { ok: true, score };
  const first = score.bars[section.firstBar] as Bar;
  const lastIndex = section.firstBar + section.barCount - 1;
  const last = score.bars[lastIndex] as Bar;
  if (score.truncation !== null && score.truncation.bar <= lastIndex) {
    return fail("truncated-tail", { bar: score.truncation.bar + 1 }, { bar: score.truncation.bar + 1 });
  }
  if (score.bars.slice(section.firstBar, lastIndex + 1).some((bar) => bar.incomplete)) {
    return fail("truncated-tail", { bar: section.firstBar + 1 }, { bar: section.firstBar + 1 });
  }

  const start = first.start;
  const sectionLength = last.start + last.length - start;
  const length = barTicks(meter);
  const full = Math.floor(sectionLength / length);
  const remainder = sectionLength - full * length;
  const isLastSection = lastIndex === score.bars.length - 1;
  if (remainder !== 0 && !isLastSection) {
    return fail(
      "meter-does-not-fit",
      { section: sectionIndex + 1, numerator: meter.numerator, denominator: meter.denominator },
      { bar: section.firstBar + 1 },
    );
  }
  if (remainder !== 0 && score.truncation !== null) {
    return fail(
      "meter-does-not-fit",
      { section: sectionIndex + 1, numerator: meter.numerator, denominator: meter.denominator },
      { bar: section.firstBar + 1 },
    );
  }
  const newCount = full + (remainder === 0 ? 0 : 1);
  const delta = newCount - section.barCount;

  const bars: Bar[] = score.bars.slice(0, section.firstBar).map((bar) => ({ ...bar }));
  for (let offset = 0; offset < newCount; offset += 1) {
    const barStart = start + offset * length;
    bars.push({
      index: section.firstBar + offset,
      start: barStart,
      length,
      meter,
      key: effectiveKeyAt(score, barStart),
      keyChanges: keyChangesInside(score.keys, barStart, length),
      incomplete: false,
    });
  }
  for (const bar of score.bars.slice(lastIndex + 1)) {
    bars.push({
      ...bar,
      index: bar.index + delta,
      keyChanges: bar.keyChanges.map((change) => ({ ...change })),
    });
  }

  const sectionEnd = start + sectionLength;
  const boundaries: number[] = [];
  for (let offset = 1; offset < newCount; offset += 1) boundaries.push(start + offset * length);
  const notes: Note[] = [];
  for (const note of score.notes) {
    if (note.start < start || note.start >= sectionEnd) {
      notes.push(note.bar >= lastIndex + 1 ? { ...note, bar: note.bar + delta } : note);
      continue;
    }
    for (const piece of splitNoteAt(note, boundaries)) {
      const barOffset = Math.min(Math.floor((piece.start - start) / length), newCount - 1);
      notes.push({ ...piece, bar: section.firstBar + barOffset });
    }
  }
  const chords = score.chords.map((chord) => ({ ...chord }));

  if (remainder !== 0) {
    const barIndex = section.firstBar + newCount - 1;
    const barStart = start + (newCount - 1) * length;
    for (const voice of score.voices) {
      const voiceNotes = notes
        .filter((note) => note.voice === voice && note.bar === barIndex)
        .sort((left, right) => left.start - right.start);
      let end = barStart;
      for (const note of voiceNotes) end = Math.max(end, note.start + note.duration);
      if (end < barStart + length) {
        notes.push({
          id: noteId(voice, end),
          voice,
          bar: barIndex,
          start: end,
          duration: barStart + length - end,
          midi: null,
          tie: false,
        });
      }
    }
  }

  const markers = score.sections.map((item, index) => ({
    name: item.name,
    firstBar: index > sectionIndex ? item.firstBar + delta : item.firstBar,
  }));
  const truncation =
    score.truncation === null || score.truncation.bar <= lastIndex
      ? score.truncation
      : { ...score.truncation, bar: score.truncation.bar + delta };

  return {
    ok: true,
    score: {
      ...score,
      bars,
      notes: orderNotes(score, notes),
      chords,
      sections: sectionsFrom({ ...score, bars }, markers),
      truncation,
    },
  };
}

function fillTruncatedBar(score: Score, durations: DurationSet): ScoreCommandResult {
  if (score.truncation === null) return fail("no-truncation", {}, {});
  if (!score.truncation.short) {
    return fail("no-incomplete-bar", { bar: score.truncation.bar + 1 }, { bar: score.truncation.bar + 1 });
  }
  const index = score.truncation.bar;
  const bar = score.bars[index];
  if (bar === undefined) return fail("no-incomplete-bar", { bar: index + 1 }, { bar: index + 1 });
  const filled = fillBar(score, index, score.truncation.voice, durations);
  const bars = bar.incomplete
    ? score.bars.map((item) => (item.index === index ? { ...item, incomplete: false } : item))
    : score.bars;
  const nextScore: Score = {
    ...score,
    bars,
    notes: orderNotes(score, filled.notes),
    hasChords: score.chords.length > 0,
  };
  return { ok: true, score: { ...nextScore, truncation: truncationFromCoverage(nextScore) } };
}

function deleteTruncatedBar(score: Score): ScoreCommandResult {
  if (score.truncation === null) return fail("no-truncation", {}, {});
  if (!score.truncation.short) {
    return fail("no-incomplete-bar", { bar: score.truncation.bar + 1 }, { bar: score.truncation.bar + 1 });
  }
  const index = score.truncation.bar;
  const voice = score.truncation.voice;
  const bar = score.bars[index];
  if (bar === undefined) return fail("no-incomplete-bar", { bar: index + 1 }, { bar: index + 1 });
  const removeBar = bar.incomplete && index === score.bars.length - 1;
  if (removeBar && score.bars.length === 1) {
    return fail("last-bar", { bar: index + 1 }, { bar: index + 1 });
  }
  const bars = removeBar ? score.bars.filter((item) => item.index !== index) : score.bars;
  const notes = score.notes.filter((note) =>
    removeBar ? note.bar !== index : !(note.voice === voice && note.bar === index),
  );
  const chords =
    voice === "Vocal"
      ? score.chords.filter((chord) => !(chord.start >= bar.start && chord.start < bar.start + bar.length))
      : [...score.chords];
  const keys = removeBar
    ? score.keys.filter((change, changeIndex) => changeIndex === 0 || change.at < bar.start)
    : [...score.keys];
  const markers = score.sections
    .filter((section) => !(removeBar && section.firstBar === index))
    .map((section) => ({
      name: section.name,
      firstBar: removeBar && section.firstBar > index ? section.firstBar - 1 : section.firstBar,
    }));
  const nextScore: Score = {
    ...score,
    bars: bars.map((item, itemIndex) => ({ ...item, index: itemIndex })),
    notes: orderNotes(score, notes),
    chords,
    keys,
    hasChords: chords.length > 0,
    sections: sectionsFrom({ ...score, bars }, markers),
  };
  return { ok: true, score: { ...nextScore, truncation: truncationFromCoverage(nextScore) } };
}

/** Applies the bar, meter and truncation commands. Each returns the score it changed or one diagnostic. */
export function runBarsCommand(
  score: Score,
  command:
    | { readonly type: "insertBar"; readonly bar: number }
    | { readonly type: "deleteBars"; readonly from: number; readonly count: number }
    | { readonly type: "setSectionMeter"; readonly section: number; readonly meter: Meter }
    | { readonly type: "fillTruncatedBar" }
    | { readonly type: "deleteTruncatedBar" },
  constraints: DialectConstraints,
): ScoreCommandResult {
  switch (command.type) {
    case "insertBar":
      return insertBar(score, command.bar);
    case "deleteBars":
      return deleteBars(score, command.from, command.count);
    case "setSectionMeter":
      return setSectionMeter(score, command.section, command.meter, constraints.meter);
    case "fillTruncatedBar":
      return fillTruncatedBar(score, constraints.durations);
    case "deleteTruncatedBar":
      return deleteTruncatedBar(score);
  }
}
