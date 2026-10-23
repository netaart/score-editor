# Drafts

Use drafts when a host wants edits to survive a reload or another device, and wants a regenerated song to inherit the
lyric lines arranged on the previous one. Two ways in: give `mount` a store (`MountOptions.drafts`) and the default
editor does the rest, or, for a layout of your own, call the headless keeper, which binds one `EditingSession` to a host
store and touches no DOM.

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
await keeper.restoreOriginal(); // original back, history reset; true when the draft was cleared
keeper.destroy(); // stops the timer and subscription, starts one pending write
```

## In the default editor

```ts
const editor = mount(el, { language, project, dialects, drafts: store, notify: (notice) => showToast(notice.message) });
```

- **What the host does.** Pass `drafts` (a `DraftStore`) and `notify`, and make `project.sourceKey` stable for the song:
  the draft is kept under it. Show `draft-source-changed` and `draft-save-failed` in the host's own toast; the editor
  draws nothing for them.
- **What the editor does.** While editable it keeps one keeper, opens on the original until the draft is read (the badge
  says "Opening draft…" and nothing can be edited), offers a Restore original button that asks once, and shows a conflict
  strip with "Overwrite with my version" and "Load the other version" while the editor goes on editing and nothing is
  written. Read-only, or without `drafts`, it has no keeper and never calls the store.
- **`update`.** Another `sourceKey`, `lyrics` or score text is a new original and the keeper starts over (the old one writes
  what it holds first); the same project passed again keeps the user's edits; `drafts` and `editable` are applied as given.
- **A store that never answers** leaves the editor opening; there is no timeout, so the store should fail rather than hang.
- **Parts.** For your own layout, bind `mountToolbar(el, session, { draftKeeper: keeper })` for the opening badge and
  Restore original, and `mountDraftConflict(el, session, keeper)` for the strip.

The wording, the question's text and the update rules are in the package README's
[Drafts section](../../../README.md#in-the-default-editor).

## Decisions the host makes

- **Store.** Implement `DraftStore` and decide where a source key maps (a file, a path, a record). Versions are
  the host's; the package only hands them back. The exact contract is in the README.
- **Conflict prompt.** `status` is `"opening" | "ready" | "conflict" | "destroyed"`, and `DraftKeeperChange` carries
  the new status. Show the prompt on `"conflict"` and call `overwrite()` or `loadTheirs()`; a text the package cannot
  read leaves the conflict for overwrite.
- **Notices.** Pass `notify` and show `draft-source-changed` and `draft-save-failed` in the host's own toast system.
- **When to hand off or restore.** `handoff()` saves at once with the current joined lyrics and score; when the
  project equals the original it writes nothing and resolves `"unchanged"`. `restoreOriginal()` is the user's
  "back to the generated version" action and clears whatever draft is stored; it resolves `false` when a conflict or
  a failure left the draft, which is also sent to `notify` as `draft-save-failed`.

The draft format, `contentHash`, the full store contract and the open/inherit/keep/conflict/failure/restore rules are
in the package README's [Drafts section](../../../README.md#drafts). The public pieces are `ScoreDraft` and
`DraftProject` with `DRAFT_FORMAT_VERSION`, `draftText`, `readDraft` and `contentHash` for the document;
`DraftStore`, `DraftStoreEntry` and `DraftWriteResult` for storage; and `DraftKeeper`, `DraftKeeperOptions`,
`DraftKeeperChange`, `DraftKeeperStatus` and `DraftHandoffResult` for the keeper.
