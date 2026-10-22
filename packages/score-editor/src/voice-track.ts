// ABOUTME: The voice track view part: one voice's piano roll, with its head, its pitch column, its grid and a block for every note.
// ABOUTME: A voice the score does not have draws nothing; a cut voice ends in the hatched tail.
import {
  cutOf,
  gridRunsOf,
  gridTicks,
  lengthInBeats,
  notesByVoice,
  pitchName,
  pitchRangeOf,
  positionOf,
  tieJoins,
} from "./arrangement";
import { type BuiltAxis, type Grid, mountAxisPart } from "./axis-part";
import { create } from "./dom";
import type { EditingSession } from "./session";
import type { AxisPartOptions, ViewPart } from "./types";

export interface VoiceTrackOptions extends AxisPartOptions {
  /** The voice to draw, as the dialect names it, such as `Vocal`. */
  voice: string;
}

/**
 * Mounts one voice's track on `el`. It draws from the session's score and follows its zoom, scroll and language. A
 * track of its own scrolls in time with the session's scroll; the default editor scrolls its tracks together.
 */
export function mountVoiceTrack(el: HTMLElement, session: EditingSession, options: VoiceTrackOptions): ViewPart {
  const { voice } = options;
  return mountAxisPart(
    el,
    session,
    {
      kind: "voice-track",
      who: "mountVoiceTrack",
      region: () => voice,
      build(canvas, score, t): BuiltAxis | null {
        if (!score.voices.includes(voice)) return null;
        const doc = canvas.ownerDocument;
        const notes = notesByVoice(score).get(voice) ?? [];
        const range = pitchRangeOf(notes);
        const group = create(doc, "div", "sce-track-group", canvas);
        const head = create(doc, "div", "sce-track-head", group);
        create(doc, "span", "sce-track-name", head).textContent = voice;
        const track = create(doc, "div", "sce-track", group);
        const keys = create(doc, "div", "sce-keys", track);
        for (let octave = range.hi - 12; octave >= range.lo; octave -= 12) {
          create(doc, "div", "sce-octave", keys).textContent = pitchName(octave);
        }
        const lane = create(doc, "div", "sce-lane", track);
        const grids: Grid[] = [];
        for (const run of gridRunsOf(score)) {
          const element = create(doc, "div", "sce-grid", lane);
          element.setAttribute("aria-hidden", "true");
          element.style.cssText = `--t:${run.start};--d:${run.end - run.start}`;
          grids.push({ element, run });
        }
        lane.style.setProperty("--sce-rows", String(range.hi - range.lo));
        const cut = cutOf(score);
        if (cut && cut.voice === voice && gridTicks(score) > cut.missingFrom) {
          const tail = create(doc, "div", "sce-cut", lane);
          tail.setAttribute("aria-hidden", "true");
          tail.style.cssText = `--t:${cut.missingFrom};--d:${gridTicks(score) - cut.missingFrom}`;
        }
        const list = create(doc, "div", "sce-notes", lane);
        list.setAttribute("role", "list");
        list.setAttribute("aria-label", voice);

        const joins = tieJoins(notes);
        const blocks = doc.createDocumentFragment();
        for (const [index, note] of notes.entries()) {
          if (note.midi === null) continue;
          const block = create(doc, "div", "sce-note");
          block.setAttribute("role", "listitem");
          block.style.cssText = `--t:${note.start};--d:${note.duration};--r:${range.hi - 1 - note.midi}`;
          const tiedToNext = joins.has(note.id);
          if (tiedToNext) block.dataset.tieNext = "";
          if (index > 0 && joins.has(notes[index - 1]?.id ?? "")) block.dataset.tiePrev = "";
          const position = positionOf(score.bars, note.bar, note.start);
          block.setAttribute(
            "aria-label",
            t.noteLabel(pitchName(note.midi), position, lengthInBeats(note.duration, position.beatTicks), tiedToNext),
          );
          blocks.appendChild(block);
        }
        list.appendChild(blocks);
        return { axes: [lane], grids, corner: keys, timeline: lane, barCount: 0 };
      },
    },
    options,
  );
}
