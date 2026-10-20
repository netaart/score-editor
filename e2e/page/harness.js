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
  shadowRoot: null,
  /**
   * Mounts on the stage. `score` is "sample" (default) or the arguments of syntheticScore;
   * `shadow` mounts inside an open shadow root of a host element instead of straight on the stage.
   */
  mount({ score, shadow, ...options } = {}) {
    let target = stage;
    if (shadow) {
      const host = document.createElement("div");
      host.id = "shadow-host";
      stage.append(host);
      window.harness.shadowRoot = host.attachShadow({ mode: "open" });
      target = document.createElement("div");
      target.style.height = "420px";
      window.harness.shadowRoot.append(target);
    }
    editor = mount(target, {
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

// `?demo` mounts on load, for looking at the page by hand: `&lang=zh`, `&readonly`, `&big` (a 128-bar score).
const params = new URLSearchParams(location.search);
if (params.has("demo")) {
  window.harness.mount({
    language: params.get("lang") === "zh" ? "zh" : "en",
    editable: !params.has("readonly"),
    score: params.has("big") ? { bars: 128, notes: 1500 } : "sample",
  });
}
