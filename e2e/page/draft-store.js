// ABOUTME: A stand-in for a host's draft store that lives in the test page: it keeps real versions, records every call and can be told to fail or to wait.
// ABOUTME: A write with a version other than the stored one is answered as a conflict, so a conflict is caused by another writer and not by a flag.

/**
 * Makes a draft store that holds its files in memory.
 *
 * What the editor calls is `read`, `write`, `remove` and `list`; every call is recorded with its arguments when it is made
 * and with its answer when it is answered. What a test calls is the rest: `seed` and `external` put a file there (the second
 * as another window would, with a version of its own), `failNext` makes the next calls of one kind fail, and `hold` makes
 * `read` calls wait until `release`.
 */
export function createFakeDraftStore() {
  const files = new Map();
  const calls = [];
  const failures = { write: 0, remove: 0, read: 0, list: 0 };
  let versions = 0;
  let gate = null;
  let writeGate = null;

  const newVersion = () => `v${++versions}`;
  const wait = async () => {
    if (gate) await gate.promise;
  };
  const waitWrite = async () => {
    if (writeGate) await writeGate.promise;
  };
  const record = (call) => {
    calls.push(call);
    return call;
  };
  /** The answer of a write or removal that does not go through: a failure it was told to make, or a version that is not the stored one. */
  const refuse = (method, call, key, expected) => {
    if (failures[method] > 0) {
      failures[method] -= 1;
      call.result = "failed";
      return { ok: false, reason: "failed" };
    }
    const current = files.get(key)?.version ?? null;
    if (current !== expected) {
      call.result = "conflict";
      return { ok: false, reason: "conflict" };
    }
    return null;
  };

  return {
    async read(key) {
      const call = record({ method: "read", key });
      await wait();
      if (failures.read > 0) {
        failures.read -= 1;
        call.result = "failed";
        throw new Error("the store could not read");
      }
      const found = files.get(key);
      call.result = found ? found.version : null;
      return found ? { text: found.text, version: found.version } : null;
    },
    async write(key, text, expected) {
      const call = record({ method: "write", key, text, expected });
      await waitWrite();
      const refusal = refuse("write", call, key, expected);
      if (refusal) return refusal;
      const version = newVersion();
      files.set(key, { text, version });
      call.result = version;
      return { ok: true, version };
    },
    async remove(key, expected) {
      const call = record({ method: "remove", key, expected });
      const refusal = refuse("remove", call, key, expected);
      if (refusal) return refusal;
      files.delete(key);
      call.result = "removed";
      return { ok: true, version: newVersion() };
    },
    async list() {
      const call = record({ method: "list" });
      if (failures.list > 0) {
        failures.list -= 1;
        call.result = "failed";
        throw new Error("the store could not list");
      }
      call.result = [...files.keys()].join(",");
      return [...files.keys()];
    },

    /** Every call so far, in order, as plain data. */
    calls() {
      return calls.map((call) => ({ ...call }));
    },
    /** Puts a file there before the editor opens, and gives back its version. */
    seed(key, text) {
      const version = newVersion();
      files.set(key, { text, version });
      return version;
    },
    /** Another window writes the file: a new version, so the editor's next versioned write is a conflict. */
    external(key, text) {
      return this.seed(key, text);
    },
    /** What the store holds for `key`, or null. */
    file(key) {
      const found = files.get(key);
      return found ? { text: found.text, version: found.version } : null;
    },
    /** The next `count` calls of `method` (read, write, remove or list) fail. */
    failNext(method, count = 1) {
      failures[method] = count;
    },
    /** Makes `read` calls wait until `release`, as a slow network does. */
    hold() {
      let release = () => {};
      const promise = new Promise((resolve) => {
        release = resolve;
      });
      gate = { promise, release };
    },
    release() {
      gate?.release();
      gate = null;
    },
    /** Makes `write` calls wait until `releaseWrite`, as a slow save does. */
    holdWrite() {
      let release = () => {};
      const promise = new Promise((resolve) => {
        release = resolve;
      });
      writeGate = { promise, release };
    },
    releaseWrite() {
      writeGate?.release();
      writeGate = null;
    },
  };
}
