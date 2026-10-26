// ABOUTME: A stand-in for a host's score file on the test page: it keeps a version, records every read and versioned save, and can fail or wait.
// ABOUTME: A save with a version other than the stored one is answered as a conflict, so a conflict is caused by another writer.

/**
 * Makes a score file that a test's host callbacks use. What the editor calls is `source.save` and `source.read`; every
 * call is recorded with its arguments and answer. What a test calls is `external` (another window's write), `failNext`,
 * `holdSave` and `releaseSave`.
 */
export function createFakeScoreFile({ name = "tune.abc", text = "", version = "file-1" } = {}) {
  const calls = [];
  const failures = { save: 0, read: 0 };
  let file = { text, version };
  let next = 1;
  let gate = null;

  const record = (call) => {
    calls.push(call);
    return call;
  };
  const wait = async () => {
    if (gate) await gate.promise;
  };
  const newVersion = () => `save-${next++}`;

  const source = {
    kind: "scoreFile",
    name,
    version,
    async save(text, expected) {
      const call = record({ method: "save", text, expected });
      await wait();
      if (failures.save > 0) {
        failures.save -= 1;
        call.result = "failed";
        return { ok: false, reason: "failed" };
      }
      if (file.version !== expected) {
        call.result = "conflict";
        return { ok: false, reason: "conflict" };
      }
      const nextVersion = newVersion();
      file = { text, version: nextVersion };
      call.result = nextVersion;
      return { ok: true, version: nextVersion };
    },
    async read() {
      const call = record({ method: "read" });
      await wait();
      if (failures.read > 0) {
        failures.read -= 1;
        call.result = "failed";
        throw new Error("the file could not be read");
      }
      call.result = file.version;
      return { text: file.text, version: file.version };
    },
  };

  return {
    source,
    calls() {
      return calls.map((call) => ({ ...call }));
    },
    file() {
      return { text: file.text, version: file.version };
    },
    /** Another window writes the file: a version the editor has not seen. */
    external(nextText) {
      file = { text: nextText, version: `other-${next++}` };
      return file.version;
    },
    failNext(method, count = 1) {
      failures[method] = count;
    },
    holdSave() {
      let release = () => {};
      const promise = new Promise((resolve) => {
        release = resolve;
      });
      gate = { promise, release };
    },
    releaseSave() {
      gate?.release();
      gate = null;
    },
  };
}
