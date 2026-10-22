// ABOUTME: Pins the two closed diagnostic code sets and the zh/en text that turns a diagnostic into a sentence.
// ABOUTME: Text is read through the package entry, where a host gets it, and bar numbers are the 1-based ones people see.

import {
  COMMAND_DIAGNOSTIC_CODES,
  type CommandDiagnosticCode,
  formatDiagnostic,
  NOTICE_DIAGNOSTIC_CODES,
  type NoticeDiagnosticCode,
  READING_DIAGNOSTIC_CODES,
  type ReadingDiagnosticCode,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

const READING_CODES: ReadingDiagnosticCode[] = [
  "header",
  "voice-order",
  "token",
  "duration",
  "bar-length",
  "bar-count",
  "tie",
  "chord",
  "pitch-range",
  "comment-position",
  "empty-line",
];

const COMMAND_CODES: CommandDiagnosticCode[] = [
  "note-not-found",
  "not-a-note",
  "write-mismatch",
  "no-dialect",
  "tool-parameter",
  "chord-voice",
  "chord-vocabulary",
  "bar-out-of-range",
  "section-out-of-range",
  "meter-not-allowed",
  "no-truncation",
  "no-incomplete-bar",
  "tie-across-bar",
  "truncated-tail",
  "meter-does-not-fit",
  "last-bar",
  "cut-in-complete-bar",
  "pitch-out-of-range",
  "semitones-not-integer",
  "key-not-allowed",
  "key-change-not-found",
  "key-unavailable",
  "chord-invalid",
  "tempo-out-of-range",
  "seed-not-integer",
  "style-invalid",
  "score-mode-invalid",
  "not-a-score-command",
  "section-unnamed",
  "section-move-start",
  "section-move-end",
  "section-before-unnamed",
  "section-name-empty",
  "section-name-blank",
  "section-name-line-break",
  "section-name-trailing-space",
];

const NOTICE_CODES: NoticeDiagnosticCode[] = [
  "style-no-bpm",
  "melody-with-chords",
  "lyrics-unaligned",
  "lyrics-too-long",
];

describe("diagnostics", () => {
  it("has exactly the reading codes RULES.md lists, the command codes and the notice codes", () => {
    expect([...READING_DIAGNOSTIC_CODES]).toEqual(READING_CODES);
    expect([...COMMAND_DIAGNOSTIC_CODES]).toEqual(COMMAND_CODES);
    expect([...NOTICE_DIAGNOSTIC_CODES]).toEqual(NOTICE_CODES);
  });

  it("has non-empty zh and en text for every reading, command and notice code", () => {
    for (const code of [...READING_DIAGNOSTIC_CODES, ...COMMAND_DIAGNOSTIC_CODES, ...NOTICE_DIAGNOSTIC_CODES]) {
      for (const language of ["zh", "en"] as const) {
        const text = formatDiagnostic({ code, params: {}, at: {} }, language);
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });

  it("fills the facts of a refused transpose, key or tempo in both languages", () => {
    const cases = [
      { code: "pitch-out-of-range", params: { midi: 130, noteId: "Vocal:0" }, values: ["130"] },
      { code: "key-not-allowed", params: { key: "D#" }, values: ["D#"] },
      { code: "tempo-out-of-range", params: { bpm: 401, min: 20, max: 400 }, values: ["401", "20", "400"] },
      { code: "seed-not-integer", params: { seed: "1.5" }, values: ["1.5"] },
    ] as const;

    for (const { code, params, values } of cases) {
      for (const language of ["zh", "en"] as const) {
        const text = formatDiagnostic({ code, params, at: {} }, language);
        for (const value of values) expect(text).toContain(value);
        expect(text).not.toContain("undefined");
      }
    }
  });

  it("tells the user which note is missing or is a rest", () => {
    for (const language of ["zh", "en"] as const) {
      const missing = formatDiagnostic(
        { code: "note-not-found", params: { noteId: "Vocal:0" }, at: { noteId: "Vocal:0" } },
        language,
      );
      const rest = formatDiagnostic(
        { code: "not-a-note", params: { noteId: "Vocal:0" }, at: { noteId: "Vocal:0" } },
        language,
      );
      expect(missing).toContain("Vocal:0");
      expect(rest).toContain("Vocal:0");
    }
  });

  it("names the voice that cannot take a chord and the name outside the vocabulary", () => {
    for (const language of ["zh", "en"] as const) {
      const voice = formatDiagnostic(
        { code: "chord-voice", params: { voice: "Ins" }, at: { voice: "Ins", noteId: "Ins:0" } },
        language,
      );
      expect(voice).toContain("Ins");
      const vocabulary = formatDiagnostic(
        { code: "chord-vocabulary", params: { name: "C13" }, at: { noteId: "Vocal:0" } },
        language,
      );
      expect(vocabulary).toContain("C13");
    }
  });

  it("uses the same vocabulary wording for a reading chord and a refused chord", () => {
    for (const language of ["zh", "en"] as const) {
      const reading = formatDiagnostic({ code: "chord", params: { name: "C13" }, at: {} }, language);
      const refused = formatDiagnostic(
        { code: "chord-vocabulary", params: { name: "C13" }, at: { noteId: "Vocal:0" } },
        language,
      );
      expect(reading).toBe(refused);
    }
  });

  it("tells the user which model has no score format in this editor", () => {
    for (const language of ["zh", "en"] as const) {
      const text = formatDiagnostic({ code: "no-dialect", params: { modelId: "other-model" }, at: {} }, language);
      expect(text).toContain("other-model");
    }
  });

  it("tells a creator a change could not be written, without naming a field of the score model", () => {
    const fields = ["bars", "notes", "tempo", "voices", "keys", "sections", "chords", "truncation", "hasChords"];
    for (const language of ["zh", "en"] as const) {
      const plain = formatDiagnostic({ code: "write-mismatch", params: {}, at: {} }, language);
      for (const field of fields) {
        const text = formatDiagnostic({ code: "write-mismatch", params: { field }, at: {} }, language);
        expect(text, `${language} ${field}`).toBe(plain);
        expect(text).not.toContain(field);
      }
    }
    expect(formatDiagnostic({ code: "write-mismatch", params: { field: "bars" }, at: {} }, "en")).toBe(
      "This change can't be written into the score safely, so the score was left as it was.",
    );
    expect(formatDiagnostic({ code: "write-mismatch", params: { field: "bars" }, at: {} }, "zh")).toBe(
      "这个改动没法安全地写进乐谱，乐谱保持原样。",
    );
  });

  it("fills parameters and puts the 1-based bar in both languages", () => {
    const diagnostic = {
      code: "bar-length",
      params: { bar: 3, meter: "4/4", actual: 768, expected: 1024, reason: "short" },
      at: { voice: "Vocal", bar: 3 },
    } as const;

    const en = formatDiagnostic(diagnostic, "en");
    const zh = formatDiagnostic(diagnostic, "zh");

    expect(en).toContain("bar 3");
    expect(en).toContain("4/4");
    expect(zh).toContain("第 3 小节");
    expect(zh).toContain("4/4");
  });

  it("puts the 1-based beat after the bar in both languages, and the line after both", () => {
    const at = { voice: "Vocal", bar: 3, beat: 2.5, noteId: "Vocal:2560" };
    const refused = { code: "write-mismatch", params: {}, at } as const;
    expect(formatDiagnostic(refused, "en")).toBe(
      "This change can't be written into the score safely, so the score was left as it was. (bar 3, beat 2.5)",
    );
    expect(formatDiagnostic(refused, "zh")).toBe("这个改动没法安全地写进乐谱，乐谱保持原样。（第 3 小节，第 2.5 拍）");
    expect(formatDiagnostic({ ...refused, at: { bar: 3, beat: 1, line: 9 } }, "en")).toContain(
      "(bar 3, beat 1, line 9)",
    );
    expect(formatDiagnostic({ ...refused, at: { bar: 3 } }, "en")).toContain("(bar 3)");
  });

  it("uses a diagnostic's field and expected line parameters", () => {
    expect(formatDiagnostic({ code: "header", params: { field: "K" }, at: { line: 8 } }, "en")).toContain("K");
    expect(formatDiagnostic({ code: "voice-order", params: { expected: "V: Ins" }, at: { line: 9 } }, "zh")).toContain(
      "V: Ins",
    );
  });
});

describe("tool parameter diagnostics", () => {
  const base = { code: "tool-parameter", at: {} } as const;

  it("names the tool and the parameter in both languages", () => {
    for (const language of ["zh", "en"] as const) {
      const text = formatDiagnostic(
        { ...base, params: { toolId: "rest-every", parameter: "every", reason: "range", min: 1, max: 8, value: 9 } },
        language,
      );
      expect(text).toContain("rest-every");
      expect(text).toContain("every");
      expect(text).not.toContain("undefined");
    }
  });

  it("builds the type sentence from structured facts, with no English in the Chinese text", () => {
    const cases = [
      { type: "number", en: "number", zh: "数字" },
      { type: "boolean", en: "true or false", zh: "真或假" },
      { type: "text", en: "text", zh: "文本" },
    ];

    for (const { type, en, zh } of cases) {
      const params = { toolId: "t", parameter: "p", reason: "type", type };
      const english = formatDiagnostic({ ...base, params }, "en");
      const chinese = formatDiagnostic({ ...base, params }, "zh");
      expect(english).toContain(en);
      expect(chinese).toContain(zh);
      expect(chinese).not.toMatch(/number|true or false|text/);
    }
  });

  it("writes a both-sided, a min-only and a max-only range in each language", () => {
    const cases = [
      { params: { min: 1, max: 8 }, en: "between 1 and 8", zh: "1 到 8 之间" },
      { params: { min: 1 }, en: "at least 1", zh: "不小于 1" },
      { params: { max: 8 }, en: "at most 8", zh: "不大于 8" },
    ];

    for (const { params, en, zh } of cases) {
      const diagnostic = {
        ...base,
        params: { toolId: "t", parameter: "p", reason: "range", ...params },
      };
      expect(formatDiagnostic(diagnostic, "en")).toContain(en);
      expect(formatDiagnostic(diagnostic, "zh")).toContain(zh);
    }
  });

  it("says which allowed values a choice takes and uses the type sentence for an unknown reason", () => {
    const choice = formatDiagnostic(
      { ...base, params: { toolId: "t", parameter: "mode", reason: "value", values: "up, down" } },
      "en",
    );
    expect(choice).toContain("up, down");

    const unknownReason = formatDiagnostic(
      { ...base, params: { toolId: "t", parameter: "p", reason: "something-else", type: "text" } },
      "en",
    );
    expect(unknownReason).toContain("text");
  });

  it("says a malformed tool has no commands builder", () => {
    for (const language of ["zh", "en"] as const) {
      const text = formatDiagnostic({ ...base, params: { toolId: "t", reason: "commands" } }, language);
      expect(text).toContain("t");
      expect(text).not.toContain("undefined");
    }
  });
});
