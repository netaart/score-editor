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

  it("imports the song2 dialect entry", async () => {
    const dialect = await import("@neta-art/score-dialect-song2");
    expect(dialect.song2Id).toBe("song2");
  });

  it("refuses to mount without a DOM instead of failing obscurely", async () => {
    const { mount } = await import("@neta-art/score-editor");
    expect(() => mount({} as HTMLElement, { language: "en" })).toThrow(/browser/i);
  });
});
