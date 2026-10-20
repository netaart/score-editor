// ABOUTME: Pins the two closed diagnostic code sets and the zh/en text that turns a diagnostic into a sentence.
// ABOUTME: Text is read through the package entry, where a host gets it, and bar numbers are the 1-based ones people see.

import {
  COMMAND_DIAGNOSTIC_CODES,
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

describe("diagnostics", () => {
  it("has exactly the reading codes RULES.md lists, and an empty command set", () => {
    expect([...READING_DIAGNOSTIC_CODES]).toEqual(READING_CODES);
    expect([...COMMAND_DIAGNOSTIC_CODES]).toEqual([]);
  });

  it("has non-empty zh and en text for every reading code", () => {
    for (const code of READING_DIAGNOSTIC_CODES) {
      for (const language of ["zh", "en"] as const) {
        const text = formatDiagnostic({ code, params: {}, at: {} }, language);
        expect(text.length).toBeGreaterThan(0);
      }
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
