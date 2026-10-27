// ABOUTME: The commands the built-in note tools are written against: each tool is one command that rewrites the notes it names on the grid.
// ABOUTME: They share one placement path, so every tool keeps one note at a time in a voice, writes bar-line ties, and fills rests.
import { commandRefusal } from "./command-refusal";
import type { ScoreCommandResult } from "./commands";
import {
  fillEnds,
  fillVoice,
  type Grid,
  gridAllowed,
  gridLabel,
  gridStepOf,
  type NoteSpan,
  piecesFor,
  placeChords,
  repairTies,
  snap,
  spansOf,
  splitAtKeyChanges,
} from "./commands-notes";
import { cutEditRefusal, effectiveKeyAt, endsAtX5Tail, noteAt, orderNotes } from "./commands-shared";
import { keyPitchClasses } from "./key-scale";
import type { Note, Score } from "./score";
import type { DialectConstraints } from "./types";

/** Split every named note at one tick, which the panel takes from the insertion point. */
export interface SplitNotesCommand {
  readonly type: "splitNotes";
  readonly noteIds: ReadonlyArray<string>;
  /** The tick to split at, or null when no insertion point is placed; null changes nothing. */
  readonly at: number | null;
  readonly grid: Grid;
}

/** Cut every named note at every grid line that crosses it. */
export interface ChopNotesCommand {
  readonly type: "chopNotes";
  readonly noteIds: ReadonlyArray<string>;
  readonly grid: Grid;
}

/** Merge the named notes that are adjacent and share a pitch into one longer note. */
export interface JoinNotesCommand {
  readonly type: "joinNotes";
  readonly noteIds: ReadonlyArray<string>;
  readonly grid: Grid;
}

/** Extend each named note to where the next note of its voice starts. */
export interface LegatoNotesCommand {
  readonly type: "legatoNotes";
  readonly noteIds: ReadonlyArray<string>;
  readonly grid: Grid;
}

/** Turn the named notes back to front in time, keeping each one's length and pitch. */
export interface ReverseNotesCommand {
  readonly type: "reverseNotes";
  readonly noteIds: ReadonlyArray<string>;
  readonly grid: Grid;
}

/** Mirror the named notes' pitches around the middle of the named range. */
export interface FlipNotesCommand {
  readonly type: "flipNotes";
  readonly noteIds: ReadonlyArray<string>;
  readonly grid: Grid;
}

/** Move each named note's pitch to the nearest pitch of the key in force where it starts. */
export interface SnapNotesToKeyCommand {
  readonly type: "snapNotesToKey";
  readonly noteIds: ReadonlyArray<string>;
  readonly grid: Grid;
}

/** Multiply every named note's length by two or a half. */
export interface ScaleNoteLengthsCommand {
  readonly type: "scaleNoteLengths";
  readonly noteIds: ReadonlyArray<string>;
  readonly factor: 2 | 0.5;
  readonly grid: Grid;
}

/** Give every named note the same length. */
export interface SetNoteLengthCommand {
  readonly type: "setNoteLength";
  readonly noteIds: ReadonlyArray<string>;
  /** The wanted length in ticks; it is rounded to the grid before it is written. */
  readonly lengthTicks: number;
  readonly grid: Grid;
}

/** Stretch or compress the named notes into one run of whole bars. */
export interface FitNotesToRangeCommand {
  readonly type: "fitNotesToRange";
  readonly noteIds: ReadonlyArray<string>;
  /** 0-based first and last bar of the range, both included. */
  readonly fromBar: number;
  readonly toBar: number;
  readonly grid: Grid;
}

/** Every command the built-in note tools build. */
export type NoteToolCommand =
  | SplitNotesCommand
  | ChopNotesCommand
  | JoinNotesCommand
  | LegatoNotesCommand
  | ReverseNotesCommand
  | FlipNotesCommand
  | SnapNotesToKeyCommand
  | ScaleNoteLengthsCommand
  | SetNoteLengthCommand
  | FitNotesToRangeCommand;

/** One note the command is rewriting, with its whole tie chain as one span. */
interface Target {
  readonly span: NoteSpan;
  /** The id the command named, for a diagnostic that points at the note the person chose. */
  readonly namedId: string;
  readonly order: number;
}

function spanKeyOf(span: NoteSpan): string {
  return `${span.voice}:${span.start}:${span.end}:${String(span.midi)}`;
}

interface Placement {
  readonly voice: string;
  readonly start: number;
  readonly end: number;
  readonly midi: number;
  readonly order: number;
}

interface GridStep {
  readonly step: number;
  readonly unitTicks: number;
  readonly end: number;
}

function scoreEnd(score: Score): number {
  const last = score.bars[score.bars.length - 1];
  return last === undefined ? 0 : last.start + last.length;
}

/** The named notes as their whole tie chains, in the order they were named; a repeated chain counts once. */
function targetsOf(
  score: Score,
  noteIds: ReadonlyArray<string>,
): { ok: true; targets: Target[] } | { ok: false; result: ScoreCommandResult } {
  const byVoice = new Map<string, NoteSpan[]>();
  const spans = (voice: string): NoteSpan[] => {
    let found = byVoice.get(voice);
    if (found === undefined) {
      found = spansOf(score, voice);
      byVoice.set(voice, found);
    }
    return found;
  };
  const seen = new Set<NoteSpan>();
  const targets: Target[] = [];
  for (let order = 0; order < noteIds.length; order += 1) {
    const namedId = noteIds[order] as string;
    const note = score.notes.find((candidate) => candidate.id === namedId);
    if (note === undefined) {
      return { ok: false, result: commandRefusal("note-not-found", { noteId: namedId }, { noteId: namedId }) };
    }
    if (note.midi === null) {
      return { ok: false, result: commandRefusal("not-a-note", { noteId: namedId }, noteAt(score, namedId)) };
    }
    const span = spans(note.voice).find((candidate) => candidate.notes?.some((member) => member.id === namedId));
    if (span === undefined || seen.has(span)) continue;
    seen.add(span);
    targets.push({ span, namedId, order });
  }
  return { ok: true, targets };
}

function gridOf(
  score: Score,
  command: NoteToolCommand,
  constraints: DialectConstraints,
): { ok: true; grid: GridStep } | { ok: false; result: ScoreCommandResult } {
  const first = command.noteIds[0];
  const at = first === undefined ? {} : noteAt(score, first);
  if (score.unitTicks === undefined) return { ok: false, result: commandRefusal("unit-unknown", {}, at) };
  const step = gridStepOf(command.grid);
  if (step === null || !gridAllowed(score, step, constraints)) {
    return {
      ok: false,
      result: commandRefusal(
        "grid-not-allowed",
        { grid: gridLabel(command.grid), dotted: command.grid.dotted === true },
        at,
      ),
    };
  }
  return { ok: true, grid: { step, unitTicks: score.unitTicks, end: scoreEnd(score) } };
}

/** A start and length on the grid, kept inside the score (or the range a command names). Null when not one step fits. */
function fitted(
  rawStart: number,
  rawLength: number,
  grid: GridStep,
  limit = grid.end,
): { start: number; end: number } | null {
  const start = Math.min(limit, Math.max(0, snap(rawStart, grid.step)));
  let length = Math.max(grid.step, snap(rawLength, grid.step));
  if (start + length > limit) length = Math.floor((limit - start) / grid.step) * grid.step;
  if (length < grid.step) return null;
  return { start, end: start + length };
}

/** A span put on the grid: the same place it was in when it already sat on the grid, and rounded when it did not. */
function fittedSpan(span: NoteSpan, grid: GridStep, limit = grid.end): { start: number; end: number } | null {
  return fitted(span.start, span.end - span.start, grid, limit);
}

/** Turns targets plus the spans they become into one score, the way the note commands write a placement. */
function placeSpans(
  score: Score,
  placements: ReadonlyArray<Placement>,
  grid: GridStep,
  constraints: DialectConstraints,
  removed: ReadonlyArray<NoteSpan>,
): ScoreCommandResult {
  if (placements.length === 0) return { ok: true, score };
  const first = removed[0]?.notes?.[0];
  const cut = cutEditRefusal(score, removed, placements, first === undefined ? {} : noteAt(score, first.id));
  if (cut !== null) return cut;
  const removedKeys = new Set(removed.map(spanKeyOf));
  const affected = new Set<string>();
  for (const span of removed) for (const member of span.notes ?? []) affected.add(member.id);

  const byVoice = new Map<string, NoteSpan[]>();
  for (const voice of score.voices) {
    const kept = spansOf(score, voice).filter((span) => !removedKeys.has(spanKeyOf(span)));
    const placed = placements
      .filter((placement) => placement.voice === voice)
      .sort((left, right) => left.start - right.start || left.order - right.order);
    // Among the placements, the one that starts later wins: it trims the one it starts inside and replaces one that
    // starts with it, as the note commands' placement rule says.
    const wins: NoteSpan[] = [];
    for (const placement of placed) {
      const source = removed.find(
        (span) =>
          span.voice === voice &&
          span.end === placement.end &&
          span.notes !== null &&
          span.notes[span.notes.length - 1]?.tie === true,
      );
      const tie = source !== undefined && endsAtX5Tail(score, voice, placement.end);
      const span: NoteSpan = {
        voice,
        start: placement.start,
        end: placement.end,
        midi: placement.midi,
        notes: null,
        tie,
      };
      for (;;) {
        const previous = wins[wins.length - 1];
        if (previous === undefined || previous.end <= span.start) break;
        if (previous.start >= span.start) {
          wins.pop();
          continue;
        }
        wins[wins.length - 1] = { ...previous, end: span.start };
        break;
      }
      wins.push(span);
    }
    // A placement also wins over the notes already in the voice: one that starts inside a note removes the rest of it,
    // one that starts before it cuts it short, and the rest of the voice stays as it was.
    const merged: NoteSpan[] = [];
    let at = 0;
    for (const span of kept) {
      while (at < wins.length && (wins[at] as NoteSpan).end <= span.start) at += 1;
      const win = wins[at];
      if (win === undefined || win.start >= span.end) {
        merged.push(span);
        continue;
      }
      for (const member of span.notes ?? []) affected.add(member.id);
      if (win.start >= span.start) continue;
      merged.push({ ...span, end: win.start, notes: null });
    }
    merged.push(...wins);
    merged.sort((left, right) => left.start - right.start);
    byVoice.set(voice, merged);
  }

  const ends = fillEnds(score);
  const notes: Note[] = [];
  for (const voice of score.voices) {
    const voiceNotes: Note[] = [];
    for (const span of byVoice.get(voice) ?? []) {
      if (span.notes !== null) voiceNotes.push(...span.notes);
      else voiceNotes.push(...piecesFor(score, span, grid.unitTicks, constraints.durations));
    }
    notes.push(...fillVoice(score, voice, voiceNotes, ends, grid.unitTicks, constraints));
  }

  const split = splitAtKeyChanges(score, notes, grid.unitTicks, constraints.durations);
  const repaired = repairTies(score, split, affected);
  const placedChords = placeChords(score, repaired, grid.unitTicks, constraints.durations);
  return { ok: true, score: { ...score, notes: orderNotes(score, placedChords.notes), chords: placedChords.chords } };
}

/** A group of targets by voice, in start order, so a command that acts per voice reads them as its timeline. */
function byVoiceOf(targets: ReadonlyArray<Target>): Map<string, Target[]> {
  const groups = new Map<string, Target[]>();
  for (const target of [...targets].sort(
    (left, right) => left.span.start - right.span.start || left.order - right.order,
  )) {
    const found = groups.get(target.span.voice) ?? [];
    found.push(target);
    groups.set(target.span.voice, found);
  }
  return groups;
}

function refusalFor(score: Score, target: Target, code: "note-past-end" | "note-too-short", params = {}) {
  return commandRefusal(code, params, noteAt(score, target.namedId));
}

function reverse(score: Score, targets: Target[], grid: GridStep, constraints: DialectConstraints): ScoreCommandResult {
  const placements: Placement[] = [];
  for (const group of byVoiceOf(targets).values()) {
    const low = Math.min(...group.map((target) => target.span.start));
    const high = Math.max(...group.map((target) => target.span.end));
    for (const target of group) {
      const { span } = target;
      const length = span.end - span.start;
      const place = fitted(low + high - span.end, length, grid);
      if (place === null) return refusalFor(score, target, "note-past-end");
      placements.push({ voice: span.voice, ...place, midi: span.midi as number, order: target.order });
    }
  }
  return placeSpans(
    score,
    placements,
    grid,
    constraints,
    targets.map((target) => target.span),
  );
}

function chop(score: Score, targets: Target[], grid: GridStep, constraints: DialectConstraints): ScoreCommandResult {
  const placements: Placement[] = [];
  const removed: NoteSpan[] = [];
  for (const target of targets) {
    const { span } = target;
    const whole = fittedSpan(span, grid);
    if (whole === null) return refusalFor(score, target, "note-too-short");
    let at = whole.start;
    const pieces: Array<{ start: number; end: number }> = [];
    for (let cut = Math.ceil(whole.start / grid.step) * grid.step; cut < whole.end; cut += grid.step) {
      if (cut <= at) continue;
      pieces.push({ start: at, end: cut });
      at = cut;
    }
    if (pieces.length === 0) continue;
    pieces.push({ start: at, end: whole.end });
    for (const piece of pieces) {
      placements.push({ voice: span.voice, ...piece, midi: span.midi as number, order: target.order });
    }
    removed.push(span);
  }
  return placeSpans(score, placements, grid, constraints, removed);
}

function join(score: Score, targets: Target[], grid: GridStep, constraints: DialectConstraints): ScoreCommandResult {
  const placements: Placement[] = [];
  const removed: NoteSpan[] = [];
  for (const group of byVoiceOf(targets).values()) {
    let run: Target[] = [];
    const flush = (): ScoreCommandResult | null => {
      if (run.length < 2) {
        run = [];
        return null;
      }
      const start = run[0]?.span.start as number;
      const end = run[run.length - 1]?.span.end as number;
      const place = fitted(start, end - start, grid);
      if (place === null) return refusalFor(score, run[0] as Target, "note-past-end");
      placements.push({
        voice: (run[0] as Target).span.voice,
        ...place,
        midi: (run[0] as Target).span.midi as number,
        order: (run[0] as Target).order,
      });
      for (const member of run) removed.push(member.span);
      run = [];
      return null;
    };
    for (const target of group) {
      const previous = run[run.length - 1];
      if (
        previous !== undefined &&
        previous.span.midi === target.span.midi &&
        previous.span.end === target.span.start
      ) {
        run.push(target);
        continue;
      }
      const problem = flush();
      if (problem !== null) return problem;
      run = [target];
    }
    const problem = flush();
    if (problem !== null) return problem;
  }
  return placeSpans(score, placements, grid, constraints, removed);
}

function legato(score: Score, targets: Target[], grid: GridStep, constraints: DialectConstraints): ScoreCommandResult {
  const placements: Placement[] = [];
  const removed: NoteSpan[] = [];
  const startsByVoice = new Map<string, number[]>();
  for (const voice of score.voices) {
    startsByVoice.set(
      voice,
      spansOf(score, voice)
        .filter((span) => span.midi !== null)
        .map((span) => span.start)
        .sort((left, right) => left - right),
    );
  }
  const nextStart = (voice: string, after: number): number | null => {
    const starts = startsByVoice.get(voice) ?? [];
    for (const start of starts) if (start > after) return start;
    return null;
  };
  for (const target of targets) {
    const { span } = target;
    const next = nextStart(span.voice, span.start);
    if (next === null) continue;
    let end = snap(next, grid.step);
    if (end > next) end -= grid.step;
    const place = fitted(span.start, end - span.start, grid);
    if (place === null || place.end <= span.start || place.end === span.end) continue;
    if (place.end > next) continue;
    placements.push({ voice: span.voice, ...place, midi: span.midi as number, order: target.order });
    removed.push(span);
  }
  return placeSpans(score, placements, grid, constraints, removed);
}

function flip(score: Score, targets: Target[], grid: GridStep, constraints: DialectConstraints): ScoreCommandResult {
  const placements: Placement[] = [];
  const removed: NoteSpan[] = [];
  for (const group of byVoiceOf(targets).values()) {
    const pitches = group.map((target) => target.span.midi as number);
    const low = Math.min(...pitches);
    const high = Math.max(...pitches);
    for (const target of group) {
      const midi = low + high - (target.span.midi as number);
      if (midi < 0 || midi > 127) return refusalFor(score, target, "note-past-end", { midi });
      if (midi === target.span.midi) continue;
      const place = fittedSpan(target.span, grid);
      if (place === null) return refusalFor(score, target, "note-past-end");
      placements.push({ voice: target.span.voice, ...place, midi, order: target.order });
      removed.push(target.span);
    }
  }
  return placeSpans(score, placements, grid, constraints, removed);
}

function snapToKey(
  score: Score,
  targets: Target[],
  grid: GridStep,
  constraints: DialectConstraints,
): ScoreCommandResult {
  const placements: Placement[] = [];
  const removed: NoteSpan[] = [];
  for (const target of targets) {
    const { span } = target;
    const classes = keyPitchClasses(effectiveKeyAt(score, span.start));
    if (classes === null) continue;
    const from = span.midi as number;
    let midi: number | null = null;
    for (let distance = 0; distance <= 6 && midi === null; distance += 1) {
      for (const candidate of distance === 0 ? [from] : [from + distance, from - distance]) {
        if (candidate < 0 || candidate > 127) continue;
        if (classes.has(((candidate % 12) + 12) % 12)) {
          midi = candidate;
          break;
        }
      }
    }
    if (midi === null || midi === from) continue;
    const place = fittedSpan(span, grid);
    if (place === null) return refusalFor(score, target, "note-past-end");
    placements.push({ voice: span.voice, ...place, midi, order: target.order });
    removed.push(span);
  }
  return placeSpans(score, placements, grid, constraints, removed);
}

function scaleLengths(
  score: Score,
  command: ScaleNoteLengthsCommand,
  targets: Target[],
  grid: GridStep,
  constraints: DialectConstraints,
): ScoreCommandResult {
  if (command.factor !== 2 && command.factor !== 0.5) {
    const at = command.noteIds[0];
    return commandRefusal("offset-not-integer", { field: "factor" }, at === undefined ? {} : noteAt(score, at));
  }
  const placements: Placement[] = [];
  for (const target of targets) {
    const { span } = target;
    const place = fitted(span.start, (span.end - span.start) * command.factor, grid);
    if (place === null) return refusalFor(score, target, "note-too-short");
    placements.push({ voice: span.voice, ...place, midi: span.midi as number, order: target.order });
  }
  return placeSpans(
    score,
    placements,
    grid,
    constraints,
    targets.map((target) => target.span),
  );
}

function setLength(
  score: Score,
  command: SetNoteLengthCommand,
  targets: Target[],
  grid: GridStep,
  constraints: DialectConstraints,
): ScoreCommandResult {
  const at = command.noteIds[0];
  if (!Number.isInteger(command.lengthTicks) || command.lengthTicks <= 0) {
    return commandRefusal("offset-not-integer", { field: "length" }, at === undefined ? {} : noteAt(score, at));
  }
  const placements: Placement[] = [];
  for (const target of targets) {
    const place = fitted(target.span.start, command.lengthTicks, grid);
    if (place === null) return refusalFor(score, target, "note-too-short");
    placements.push({ voice: target.span.voice, ...place, midi: target.span.midi as number, order: target.order });
  }
  return placeSpans(
    score,
    placements,
    grid,
    constraints,
    targets.map((target) => target.span),
  );
}

function fitRange(
  score: Score,
  command: FitNotesToRangeCommand,
  targets: Target[],
  grid: GridStep,
  constraints: DialectConstraints,
): ScoreCommandResult {
  const first = score.bars[command.fromBar];
  const last = score.bars[command.toBar];
  if (
    !Number.isInteger(command.fromBar) ||
    !Number.isInteger(command.toBar) ||
    first === undefined ||
    last === undefined ||
    command.toBar < command.fromBar
  ) {
    return commandRefusal("bar-out-of-range", { from: command.fromBar + 1, bar: command.fromBar + 1 }, {});
  }
  const rangeStart = first.start;
  const rangeEnd = last.start + last.length;
  const placements: Placement[] = [];
  for (const group of byVoiceOf(targets).values()) {
    const low = Math.min(...group.map((target) => target.span.start));
    const high = Math.max(...group.map((target) => target.span.end));
    if (high <= low) continue;
    const factor = (rangeEnd - rangeStart) / (high - low);
    for (const target of group) {
      const { span } = target;
      const rawStart = rangeStart + (span.start - low) * factor;
      const rawLength = (span.end - span.start) * factor;
      const place = fitted(rawStart, rawLength, grid, rangeEnd);
      if (place === null) return refusalFor(score, target, "note-too-short");
      placements.push({ voice: span.voice, ...place, midi: span.midi as number, order: target.order });
    }
  }
  return placeSpans(
    score,
    placements,
    grid,
    constraints,
    targets.map((target) => target.span),
  );
}

function applyTool(
  score: Score,
  command: NoteToolCommand,
  targets: Target[],
  grid: GridStep,
  constraints: DialectConstraints,
): ScoreCommandResult {
  switch (command.type) {
    case "splitNotes": {
      if (command.at === null) return { ok: true, score };
      if (!Number.isInteger(command.at)) {
        const first = command.noteIds[0];
        return commandRefusal("offset-not-integer", { field: "time" }, first === undefined ? {} : noteAt(score, first));
      }
      const cut = snap(command.at, grid.step);
      const placements: Placement[] = [];
      const removed: NoteSpan[] = [];
      for (const target of targets) {
        const whole = fittedSpan(target.span, grid);
        if (whole === null) return refusalFor(score, target, "note-too-short");
        if (cut <= whole.start || cut >= whole.end) continue;
        placements.push(
          {
            voice: target.span.voice,
            start: whole.start,
            end: cut,
            midi: target.span.midi as number,
            order: target.order,
          },
          {
            voice: target.span.voice,
            start: cut,
            end: whole.end,
            midi: target.span.midi as number,
            order: target.order,
          },
        );
        removed.push(target.span);
      }
      return placeSpans(score, placements, grid, constraints, removed);
    }
    case "chopNotes":
      return chop(score, targets, grid, constraints);
    case "joinNotes":
      return join(score, targets, grid, constraints);
    case "legatoNotes":
      return legato(score, targets, grid, constraints);
    case "reverseNotes":
      return reverse(score, targets, grid, constraints);
    case "flipNotes":
      return flip(score, targets, grid, constraints);
    case "snapNotesToKey":
      return snapToKey(score, targets, grid, constraints);
    case "scaleNoteLengths":
      return scaleLengths(score, command, targets, grid, constraints);
    case "setNoteLength":
      return setLength(score, command, targets, grid, constraints);
    case "fitNotesToRange":
      return fitRange(score, command, targets, grid, constraints);
  }
}

/** Applies one note tool command to a model. Every result is on the command's grid and has one note at a time in each voice. */
export function runNoteToolCommand(
  score: Score,
  command: NoteToolCommand,
  constraints: DialectConstraints,
): ScoreCommandResult {
  const grid = gridOf(score, command, constraints);
  if (!grid.ok) return grid.result;
  const targets = targetsOf(score, command.noteIds);
  if (!targets.ok) return targets.result;
  if (targets.targets.length === 0) return { ok: true, score };

  const result = applyTool(score, command, targets.targets, grid.grid, constraints);
  if (!result.ok) return result;
  const first = targets.targets[0];
  const cut = cutEditRefusal(
    score,
    targets.targets.map((target) => target.span),
    [],
    first === undefined ? {} : noteAt(score, first.namedId),
  );
  return cut ?? result;
}
