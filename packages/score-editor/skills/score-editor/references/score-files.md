# Score files, save and save-as

Use this page when a score is a document in the host instead of a generated song. The host tells `mount` where the
score came from; a file saves explicitly, a generated score keeps drafts and gains a save-as callback. The package
never chooses a path, writes a file or calls a generation API.

## The source option

```ts
type ScoreSource = GeneratedScoreSource | ScoreFileSource;

interface GeneratedScoreSource {
  kind: "generated";
}

interface ScoreFileSource {
  kind: "scoreFile";
  name: string;      // the handoff instruction's title
  version: string;   // the version the file was opened at
  save(text: string, expected: string): Promise<ScoreFileSaveResult>;
  read(): Promise<ScoreFileEntry | null>;
}
```

`mount(el, { project, dialects, language, source, ... })`:

- `source` absent or `{ kind: "generated" }` is the generated score: `drafts` works as before, and `onHandoff` gets the
  draft saved first.
- `source: { kind: "scoreFile", ... }` is a document: Save is explicit, `drafts` is ignored completely (no read, write,
  list or remove, even when the host also passes a store), Restore original goes back to the last saved version, and the
  change log compares with it.
- A source whose `kind` is neither, or a score file without `name`, `version`, `save` or `read`, is a host mistake and
  `mount` throws a `TypeError`. `update({ source })` has the same rule.

`version` is an opaque string the host owns, exactly as a `DraftStore` version is. A successful `save` answers
`{ ok: true, version }`; a version mismatch answers `{ ok: false, reason: "conflict" }`; any other failure answers
`{ ok: false, reason: "failed" }`. `ScoreFileSaveResult` is the same union as `DraftWriteResult`, and `ScoreFileEntry`
the same `{ text, version }` as `DraftStoreEntry`: one rule for host-owned versions, not two. `read()` is how "load the
other version" gets the version and text the other writer left.

A score file carries score text only. `mount` starts its style description, seed and lyric-line alignment empty; the
host passes the file's score in `project.score`, and lyrics may come from the score itself. Those fields can be filled
and are used by the handoff, but they are never written back through `save`.

## The save state in `mount`

```ts
const editor = mount(el, {
  project,
  dialects,
  language: "en",
  source: {
    kind: "scoreFile",
    name: "tune.abc",
    version: file.version,
    save: (text, expected) => writeFile(path, text, expected),
    read: () => readFile(path),
  },
  onSaveAs,                  // generated scores only
  onUnsavedChange: (unsaved) => guardWindowClose(unsaved),
  requiredInputs: ["style"],
  onHandoff,
});

editor.hasUnsavedChanges(); // false for a generated score
```

- The toolbar gets **Save** in the right-hand group, before the view switch. It chooses one form for the box from the
  room the widest state's words need, and re-chooses only when the toolbar's width, the language or the font metrics
  change, never when the state changes. While those words fit in the toolbar's height without the control, the state is
  in words: `Unsaved`, `Saving…` in the button, `Save failed` in the pill with `Save again` on the button, and `Unsaved`
  in a conflict. Where they would add a row, every state uses the icon and one mark (`•`, `!`, `?`, `…` while saving).
  The pill is `aria-hidden`; the button's description carries the state and, after a failure, the recovery sentence. The
  toolbar's live region says `Saved` or the recovery sentence. Save is `aria-disabled` while there is nothing to write,
  or while a save is in flight or a conflict stands. Ctrl/Cmd+S saves while the focus is inside the editor; outside it
  the browser's and the host's own shortcuts are untouched.
- A failed save leaves the changes in place and Save again retries with the same version; the host gets
  `score-save-failed`. The conflict strip scrolls the chrome into view and its Overwrite note says the other version
  can't be brought back.
- A conflict shows the same strip and two two-line choices as the draft conflict: **Overwrite with my version** reads
  the other writer's version and writes ours over it, **Load the other version** puts their text in the session as a new
  document. The editor never overwrites by itself.
- Restore original for a file asks about the last saved version; it is muted while the file is clean, its answer is
  `Go back to last save`, it replaces the project, and it resets the history (Undo cannot bring the changes back)
  without reading or writing the host's file.
- `onUnsavedChange` is called when the state changes, and `hasUnsavedChanges()` answers the same question for a close
  guard that asks just before closing. Both are false for a generated score.

A generated score keeps drafts as before and adds **Save as…** while `onSaveAs` is given: the callback receives the
current score text and decides where it goes. A read-only editor shows neither Save nor Save as.

## The headless keeper

A host with its own Save control can bind the same logic without the default editor:

```ts
import { createScoreFileKeeper } from "@neta-art/score-editor";

const keeper = createScoreFileKeeper({
  session,
  original: session.project, // the project as opened
  source,                    // a ScoreFileSource
  notify: (notice) => showToast(notice.message),
  onUnsavedChange: (unsaved) => guardWindowClose(unsaved),
});

await keeper.save();          // ScoreFileSaveResult; writes nothing when there is nothing to save
await keeper.overwrite();     // in a conflict: read theirs, then write ours at their version
await keeper.loadTheirs();    // in a conflict: put their text in the session
await keeper.handoff();       // "saved" | "unchanged" | "conflict" | "failed"
await keeper.restoreOriginal(); // the last saved project back, history reset; never touches the file
keeper.destroy();
```

`ScoreFileKeeper` has `status` (`ScoreFileKeeperStatus`: `"clean" | "dirty" | "saving" | "conflict" | "destroyed"`),
`unsaved`, `failed`, `savedProject` (the change log's original and Restore's target), `version`, `save`, `overwrite`,
`loadTheirs`, `restoreOriginal`, `handoff`, `subscribe` and `destroy`. `ScoreFileKeeperChange` is `{ status, unsaved,
failed }`; `ScoreFileKeeperOptions` is `{ session, original, source, notify?, onUnsavedChange? }`. A save captures the
project when it starts, so an edit made while the host is slow stays unsaved when the write returns.

## Required inputs and the handoff

The editor reads no model declaration. `requiredInputs` is the host's list of `ProjectField` values (`"style"`,
`"scoreMode"`, `"seed"` or `"lyrics"`). While one is missing, the trigger names it (`Add style first…` or `Add 2 required
inputs…`); pressing it opens the Project panel on the first missing field, except for lyrics: those show the arrangement
and open the lyric track's new-line editor on its text box, with the first row below the pinned head. A required empty
field's hint starts `Required to regenerate.` Filling the field recomputes the state, and the ordinary trigger comes back.

With a score file, the handoff saves first when the file is dirty (the review says `Saves <file> first, then sends the
song.`; conflict and failure keep the callback closed and send `handoff-not-sent` plus the toolbar live region), the
change log compares with the last saved project, and the instruction's title is the file's name. With a generated
score, the draft is saved first as [handoff.md](handoff.md) describes.

The public pieces are `createScoreFileKeeper`; `ScoreFileKeeper`, `ScoreFileKeeperOptions`, `ScoreFileKeeperChange`,
`ScoreFileKeeperStatus` and `ScoreFileHandoffResult`; and on `mount`, `ScoreSource`, `GeneratedScoreSource`,
`ScoreFileSource`, `ScoreFileEntry`, `ScoreFileSaveResult`, `ProjectField` and `RequiredInput`.
