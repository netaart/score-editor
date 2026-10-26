// ABOUTME: Imports both published package entries in a plain node environment.
// ABOUTME: Guards the rule that makes server-side imports in host apps safe: no side effects, no DOM at import time.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
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
      "filterNotes",
      "handleEditingInput",
      "mountChordTrack",
      "mountCutNotice",
      "mountFilterPanel",
      "mountProblemView",
      "mountStaffView",
      "mountStaleNotice",
      "mountTextView",
      "mountTimeRuler",
      "mountToolbar",
      "mountViewSwitch",
      "mountVoiceTrack",
      "mountZoomControl",
      "createDraftKeeper",
      "contentHash",
      "draftText",
      "readDraft",
      "applyCommandList",
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
    expect(typeof editor.DRAFT_FORMAT_VERSION).toBe("number");
    expect([...editor.NOTICE_CODES]).toEqual([
      "command-refused",
      "draft-source-changed",
      "draft-save-failed",
      "score-save-failed",
      "score-load-failed",
    ]);
    expect(Array.isArray(editor.COMMAND_DIAGNOSTIC_CODES)).toBe(true);
  });

  it("refuses to mount a view part without a DOM instead of failing obscurely", async () => {
    const {
      createDialectRegistry,
      createEditingSession,
      mountFilterPanel,
      mountStaffView,
      mountStaleNotice,
      mountTextView,
      mountTimeRuler,
      mountToolbar,
      mountViewSwitch,
      mountZoomControl,
    } = await import("@neta-art/score-editor");
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
    expect(() => mountFilterPanel({} as HTMLElement, session)).toThrow(/browser/i);
    expect(() => mountToolbar({} as HTMLElement, session)).toThrow(/browser/i);
    expect(() => mountZoomControl({} as HTMLElement, session)).toThrow(/browser/i);
    expect(() => mountStaffView({} as HTMLElement, session)).toThrow(/browser/i);
    expect(() => mountStaleNotice({} as HTMLElement, session)).toThrow(/browser/i);
    expect(() => mountTextView({} as HTMLElement, session)).toThrow(/browser/i);
    expect(() => mountViewSwitch({} as HTMLElement, session)).toThrow(/browser/i);
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

describe("abcjs stays out of the entries", () => {
  const root = new URL("../", import.meta.url);
  const entries = ["packages/score-editor/dist/index.js", "packages/score-dialect-song2/dist/index.js"].map(
    (path) => new URL(path, root).href,
  );
  const abcjs = pathToFileURL(createRequire(new URL("packages/score-editor/package.json", root)).resolve("abcjs")).href;

  /**
   * A plain Node process, with no DOM, imports the built entries and then abcjs itself, and reports how many files of
   * abcjs the CommonJS loader holds after each. Where nothing is shared with this test, the entries are loaded as a server
   * loads them, and the second figure shows the check can see abcjs when it is loaded.
   */
  function modulesOfAbcjsSeen(): { afterEntries: number; afterAbcjs: number } {
    const script = `
      import { createRequire } from "node:module";
      const loaded = createRequire(import.meta.url).cache;
      const seen = () => Object.keys(loaded).filter((file) => /[\\\\/]abcjs[\\\\/]/.test(file)).length;
      for (const entry of ${JSON.stringify(entries)}) await import(entry);
      const afterEntries = seen();
      await import(${JSON.stringify(abcjs)});
      console.log(JSON.stringify({ afterEntries, afterAbcjs: seen() }));
    `;
    return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" }));
  }

  it("is not loaded by importing either package entry, which only a view part's mount asks for", () => {
    const { afterEntries, afterAbcjs } = modulesOfAbcjsSeen();

    expect(afterAbcjs, "the check can see abcjs when it is loaded").toBeGreaterThan(0);
    expect(afterEntries).toBe(0);
  }, 20_000);
});
