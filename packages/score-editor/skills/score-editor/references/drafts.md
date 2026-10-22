# Drafts

Use the draft keeper when a host wants the editor's edits to survive a reload or another device, and wants a
regenerated song to inherit the lyric lines the user arranged on the previous one. It is headless: it binds one
`EditingSession` to a host store and touches no DOM. `mount` does not wire it yet; a host using its own layout calls
it directly.

```ts
import { contentHash, createDraftKeeper, draftText, readDraft } from "@neta-art/score-editor";

const keeper = createDraftKeeper({
  session,
  store,
  original: project, // never changed by the keeper
  notify: (notice) => showToast(notice.message),
  now: () => Date.now(), // optional; tests inject a clock
  debounceMs: 1000, // optional; this is the default
});

await keeper.ready;
keeper.subscribe(({ status }) => showConflict(status === "conflict"));
await keeper.overwrite();
await keeper.loadTheirs();
await keeper.handoff(); // "written" | "unchanged" | "conflict" | "failed"
await keeper.restoreOriginal();
keeper.destroy();
```

## The draft document

`ScoreDraft` is one source song's saved edit:

| Field | What it holds |
| --- | --- |
| `version` | `DRAFT_FORMAT_VERSION`, today `1`. |
| `sourceKey` | The source project's key; the host maps it to its storage. |
| `sourceHash` | The content hash of the original's lyrics and score. |
| `project` | A `DraftProject`: style, joined `lyrics`, `lyricLines`, score text, score mode and seed. |
| `handoffHash` | The content hash at the last handoff, or null. |
| `updatedAt` | Milliseconds since the epoch. |

`draftText(draft)` is the JSON text a host stores. `readDraft(text)` returns a `ScoreDraft`, or null for a text of
another version or one that does not have the shape. The joined `lyrics` field is kept beyond the format's list so a
restored project equals the one the user left byte for byte.

`contentHash(lyrics, score)` is SHA-256 over the UTF-8 bytes of `JSON.stringify([lyrics, score])`, lowercase hex, with
no normalisation. It uses `globalThis.crypto.subtle`, so it is the same in browsers, Workers and Node from 19 on.

## The host store

`DraftStore` takes source keys and text; a key may map to a file, a path or a record.

```ts
interface DraftStore {
  read(key: string): Promise<DraftStoreEntry | null>; // { text, version }
  write(key: string, text: string, expected: string | null): Promise<DraftWriteResult>;
  remove(key: string, expected: string | null): Promise<DraftWriteResult>;
  list(): Promise<ReadonlyArray<string>>;
}
```

`DraftWriteResult` is `{ ok: true, version }` or `{ ok: false, reason: "conflict" | "failed" }`. `expected` is the
version last read or written, or null to create. A host without deletion may keep a tombstone, as long as `read`
answers null and `list` leaves the key out.

## What the keeper does

- **Open** reads the original's key. A matching source hash restores its project; a stale one is removed and
  `draft-source-changed` is sent; no draft is normal and silent.
- **Inherit** runs only when there is no own draft. It reads at most 50 listed drafts, picks the matching
  `handoffHash` with the latest `updatedAt`, and puts the original with that draft's joined lyrics and lyric lines
  into the session. The new song keeps its own key, model and score and is saved as a new draft after the debounce.
- **Keep** writes about one second after the last project change. Selection, view and insertion-point changes write
  nothing. A project equal to the original removes the draft instead, and does nothing when there is none.
- **Conflict** stops writes and sets `status` to `"conflict"`; the change announcement is `DraftKeeperChange`.
  `overwrite()` reads their version and writes ours over it; `loadTheirs()` puts their draft into the session.
- **Failure** sends `draft-save-failed`; the next project change tries again.
- **Restore** puts `original` back through `replaceProject` (history, selection and insertion point reset) and
  removes the draft.
- **Handoff** hashes the current joined lyrics and score and writes at once with that handoff hash. When the
  project equals the original there is nothing to inherit, so it writes nothing and returns `"unchanged"`.
- **Destroy** stops the timer and the subscription and starts one pending write, without waiting for it.

`DraftKeeperStatus` is `"opening" | "ready" | "conflict" | "destroyed"`, and `DraftKeeperOptions` takes the
session, store, original, `notify`, `now` and `debounceMs`. `DraftKeeper` is the object `createDraftKeeper`
returns; `DraftHandoffResult` is what its `handoff()` resolves. Writes and removals use only the original's source
key; inheritance reads other keys and never writes them.
