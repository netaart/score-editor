# Drafts

Use the draft keeper when a host wants edits to survive a reload or another device, and wants a regenerated song to
inherit the lyric lines arranged on the previous one. It is headless: it binds one `EditingSession` to a host store
and touches no DOM. `mount` does not wire it yet; a host using its own layout calls it directly.

```ts
import { createDraftKeeper } from "@neta-art/score-editor";

const keeper = createDraftKeeper({
  session,
  store, // the host's DraftStore
  original: project, // never changed by the keeper
  notify: (notice) => showToast(notice.message),
  now: () => Date.now(), // optional; tests inject a clock
  debounceMs: 1000, // optional; this is the default
});

await keeper.ready; // opening and inheritance are done
keeper.subscribe(({ status }) => showConflict(status === "conflict"));
await keeper.overwrite(); // keep this window's project
await keeper.loadTheirs(); // take the other window's draft
await keeper.handoff(); // "written" | "unchanged" | "conflict" | "failed"
await keeper.restoreOriginal(); // original back, history reset, draft cleared
keeper.destroy(); // stops the timer and subscription, starts one pending write
```

## Decisions the host makes

- **Store.** Implement `DraftStore` and decide where a source key maps (a file, a path, a record). Versions are
  the host's; the package only hands them back. The exact contract is in the README.
- **Conflict prompt.** `status` is `"opening" | "ready" | "conflict" | "destroyed"`, and `DraftKeeperChange` carries
  the new status. Show the prompt on `"conflict"` and call `overwrite()` or `loadTheirs()`; a text the package cannot
  read leaves the conflict for overwrite.
- **Notices.** Pass `notify` and show `draft-source-changed` and `draft-save-failed` in the host's own toast system.
- **When to hand off or restore.** `handoff()` saves at once with the current joined lyrics and score; when the
  project equals the original it writes nothing and resolves `"unchanged"`. `restoreOriginal()` is the user's
  "back to the generated version" action and clears whatever draft is stored.

The draft format, `contentHash`, the full store contract and the open/inherit/keep/conflict/failure/restore rules are
in the package README's [Drafts section](../../../README.md#drafts). The public pieces are `ScoreDraft` and
`DraftProject` with `DRAFT_FORMAT_VERSION`, `draftText`, `readDraft` and `contentHash` for the document;
`DraftStore`, `DraftStoreEntry` and `DraftWriteResult` for storage; and `DraftKeeper`, `DraftKeeperOptions`,
`DraftKeeperChange`, `DraftKeeperStatus` and `DraftHandoffResult` for the keeper.
