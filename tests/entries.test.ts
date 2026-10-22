// ABOUTME: Imports both published package entries in a plain node environment.
// ABOUTME: Guards the rule that makes server-side imports in host apps safe: no side effects, no DOM at import time.
import { describe, expect, it } from "vitest";

describe("package entries in a node environment", () => {
  it("runs where there is no DOM or browser global to touch", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
  });

  it("imports the editor entry", async () => {
    const editor = await import("@neta-art/score-editor");
    expect(typeof editor.mount).toBe("function");
  });

  it("exports the editing session and every view part, and keeps what 0.1.0 exported", async () => {
    const editor = await import("@neta-art/score-editor");
    const functions = [
      "createEditingSession",
      "mountChordTrack",
      "mountCutNotice",
      "mountProblemView",
      "mountTimeRuler",
      "mountVoiceTrack",
      "mountZoomControl",
      // What 0.1.0 exported.
      "mount",
      "applyProjectCommand",
      "applyScoreCommand",
      "createDialectRegistry",
      "formatDiagnostic",
      "noteId",
    ];
    for (const name of functions) expect(typeof editor[name as keyof typeof editor], name).toBe("function");
    expect(typeof editor.TICKS_PER_QUARTER).toBe("number");
    expect(Array.isArray(editor.NOTICE_CODES)).toBe(true);
    expect(Array.isArray(editor.COMMAND_DIAGNOSTIC_CODES)).toBe(true);
  });

  it("refuses to mount a view part without a DOM instead of failing obscurely", async () => {
    const { createDialectRegistry, createEditingSession, mountTimeRuler, mountZoomControl } = await import(
      "@neta-art/score-editor"
    );
    const project = {
      style: "",
      lyrics: "",
      score: "",
      scoreMode: "full",
      seed: null,
      modelId: "song2",
      sourceKey: "n",
    } as const;
    const session = createEditingSession({ project, dialects: createDialectRegistry([]) });
    expect(() => mountTimeRuler({} as HTMLElement, session)).toThrow(/browser/i);
    expect(() => mountZoomControl({} as HTMLElement, session)).toThrow(/browser/i);
  });

  it("imports the song2 dialect entry", async () => {
    const dialect = await import("@neta-art/score-dialect-song2");
    expect(dialect.song2Id).toBe("song2");
  });

  it("refuses to mount without a DOM instead of failing obscurely", async () => {
    const { createDialectRegistry, mount } = await import("@neta-art/score-editor");
    const project = {
      style: "",
      lyrics: "",
      score: "",
      scoreMode: "full",
      seed: null,
      modelId: "song2",
      sourceKey: "node-test",
    } as const;
    const options = { language: "en", project, dialects: createDialectRegistry([]) } as const;
    expect(() => mount({} as HTMLElement, options)).toThrow(/browser/i);
  });
});
