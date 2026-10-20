// ABOUTME: Page-side half of the mount seam: mounts the built editor and exposes window.harness for the tests.
// ABOUTME: Host callbacks are fakes that only record what they receive.

import { sampleScore } from "/e2e/page/sample.js";
import { syntheticScore } from "/e2e/page/synthetic.js";
import { mount } from "/packages/score-editor/dist/index.js";

const stage = document.getElementById("stage");
const notices = [];
let editor = null;

function scoreFor(request) {
  if (request === undefined || request === "sample") return sampleScore();
  return syntheticScore(request);
}

window.harness = {
  stage,
  notices,
  /** Mounts on the stage. `score` is "sample" (default) or the arguments of syntheticScore. */
  mount({ score, ...options } = {}) {
    editor = mount(stage, {
      language: "en",
      notify: (notice) => notices.push(notice),
      spikeScore: scoreFor(score),
      ...options,
    });
  },
  update({ score, ...options } = {}) {
    editor.update(score === undefined ? options : { ...options, spikeScore: scoreFor(score) });
  },
  destroy() {
    editor.destroy();
  },
};
