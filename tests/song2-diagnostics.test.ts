// ABOUTME: Pins the two closed diagnostic code sets and the zh/en text that turns a diagnostic into a sentence.
// ABOUTME: Text is read through the package entry, where a host gets it, and bar numbers are the 1-based ones people see.

import {
  COMMAND_DIAGNOSTIC_CODES,
  type CommandDiagnosticCode,
  formatDiagnostic,
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
];

describe("diagnostics", () => {
  it("has exactly the reading codes RULES.md lists and the command codes of the edit layer", () => {
    expect([...READING_DIAGNOSTIC_CODES]).toEqual(READING_CODES);
    expect([...COMMAND_DIAGNOSTIC_CODES]).toEqual(COMMAND_CODES);
  });

  it("has non-empty zh and en text for every reading and command code", () => {
    for (const code of [...READING_DIAGNOSTIC_CODES, ...COMMAND_DIAGNOSTIC_CODES]) {
      for (const language of ["zh", "en"] as const) {
        const text = formatDiagnostic({ code, params: {}, at: {} }, language);
        expect(text.length).toBeGreaterThan(0);
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

  it("tells the user which model has no score format in this editor", () => {
    for (const language of ["zh", "en"] as const) {
      const text = formatDiagnostic({ code: "no-dialect", params: { modelId: "other-model" }, at: {} }, language);
      expect(text).toContain("other-model");
    }
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

  it("uses a diagnostic's field and expected line parameters", () => {
    expect(formatDiagnostic({ code: "header", params: { field: "K" }, at: { line: 8 } }, "en")).toContain("K");
    expect(formatDiagnostic({ code: "voice-order", params: { expected: "V: Ins" }, at: { line: 9 } }, "zh")).toContain(
      "V: Ins",
    );
  });
});

describe("tool parameter diagnostics", () => {
  const diagnostic = {
    code: "tool-parameter",
    params: { toolId: "rest-every", parameter: "every", reason: "range", min: 1, max: 8, value: 9 },
    at: {},
  } as const;

  it("names the tool and the parameter in both languages", () => {
    for (const language of ["zh", "en"] as const) {
      const text = formatDiagnostic(diagnostic, language);
      expect(text).toContain("rest-every");
      expect(text).toContain("every");
      expect(text).not.toContain("undefined");
    }
  });

  it("says which allowed values a choice takes", () => {
    const en = formatDiagnostic(
      {
        code: "tool-parameter",
        params: { toolId: "t", parameter: "mode", reason: "value", values: "up, down" },
        at: {},
      },
      "en",
    );
    expect(en).toContain("up, down");
  });
});
