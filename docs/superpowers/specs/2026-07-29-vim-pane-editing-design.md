# Real navigation and insert-mode editing for the vim pane

## Context

The vim pane (built in a prior plan, see [`2026-07-29-vim-pane-design.md`](2026-07-29-vim-pane-design.md)
and [`docs/superpowers/plans/2026-07-29-vim-pane-terminal.md`](../plans/2026-07-29-vim-pane-terminal.md))
currently renders a file's content as a static, non-interactive block: pressing an
insert-triggering key (`i`, `a`, `o`, …) does nothing but flash a readonly error, and there is no
cursor or way to move around the buffer.

After trying it, the ask is for a more faithful emulation: real cursor navigation and real
in-buffer editing — the same experience real vim gives you when you open a readonly file. Real
vim *does* let you edit a readonly buffer in memory; it only refuses to `:w` it. This spec adds
exactly that: navigation, insert-mode editing, and a dirty-tracking `:q` that now has a genuine
reason to sometimes refuse (reviving the original "you need `:q!`" joke, but for a real cause
instead of an arbitrary one).

## Decisions

- **Command scope**: the "core" vim command set — `hjkl`/arrow movement, `0`/`$` line
  start/end, `i`/`I`/`a`/`A`/`o`/`O` to enter insert mode, `x` to delete the character under the
  cursor, `Esc` to leave insert mode. No `dd`, no yank/put, no undo, no counts, no word motions
  (`w`/`b`/`e`), no visual mode. Unmapped keys are silent no-ops, matching real vim's behavior for
  commands it doesn't recognize.
- **Persistence**: edits are always in-memory only. There is no `:w` that succeeds under any
  circumstance — the buffer is fundamentally readonly, editing it is just no longer blocked.
  Re-opening a file with `vim <file>` (or reopening the same one) always starts fresh from the
  original content, cursor at `(0,0)`, normal mode, not dirty.
- **Quit semantics revived with real meaning**: `:q`/`:quit` on a clean (non-dirty) buffer closes
  immediately, same success message as before. On a dirty buffer, `:q`/`:quit` now errors with
  `E37: No write since last change (add ! to override)` — real vim's actual message for this
  situation. `:q!`/`:quit!` always force-closes regardless of dirty state. `:wq`/`:wq!`/`:x`
  always fail with the existing `E45: 'readonly' option is set...` message, dirty or not, since
  writing is impossible either way.
- **Cursor rendering**: a solid highlighted single character block, no blink animation. Avoids
  motion/`prefers-reduced-motion` handling entirely since nothing animates.
- **Applies uniformly**: the no-argument `vim` scratch buffer (`[No Name]`, splash text as
  initial content) behaves identically to a real file buffer — editable, dirty-trackable, same
  quit rules. No special-casing.

## Architecture

**New file: `frontend/src/terminal/vimEditor.ts`** — pure functions, no Vue/DOM imports. Given a
mutable `VimBufferState` and a `KeyboardEvent`, mutates cursor/lines/mode/dirty in place. Kept
separate from `useTerminal.ts` so the actual editing logic (the part with real edge cases to get
right — column clamping, line-merge-on-backspace-at-column-0, etc.) is isolated from the
composable's existing terminal-shell concerns, and can be read/reasoned about on its own.

```ts
export function handleVimKey(state: VimBufferState, event: KeyboardEvent): boolean
```

Returns `true` for every key except `:` (which the caller lets fall through to the existing
command-line typing mechanism, unchanged from the prior plan). Internally dispatches on
`state.mode`.

**`frontend/src/terminal/types.ts`** — new types:

```ts
export interface VimCursor {
  row: number
  col: number
}

export type VimMode = 'normal' | 'insert'

export interface VimBufferState {
  name: string
  lines: string[]
  cursor: VimCursor
  mode: VimMode
  dirty: boolean
}
```

`VimFile` (`{ name: string; lines: string[] }`) is unchanged and keeps its existing role: the
"open with this initial content" payload the `vim` command passes to `effects.vim(true, file)`.
`TerminalEffects.vim`'s signature is unchanged. One new method is added:

```ts
export interface TerminalEffects {
  // ...existing fields unchanged...
  vimIsDirty: () => boolean
}
```

**`frontend/src/composables/useTerminal.ts`**:
- `vimBuffer` ref type changes from `VimFile | null` to `VimBufferState | null`.
- `effects.vim(enabled, file?)`, when enabling, constructs the full runtime state:
  `{ name: file.name, lines: [...file.lines], cursor: { row: 0, col: 0 }, mode: 'normal', dirty: false }`.
- `effects.vimIsDirty = () => vimBuffer.value?.dirty ?? false`.
- New exported function `handleVimKeydown(event: KeyboardEvent): boolean` — guards on
  `vimBuffer.value` being non-null, then delegates to `vimEditor.ts`'s `handleVimKey`, returning
  its result (or `false` if no buffer is open).

**`frontend/src/components/terminal/TerminalOverlay.vue`**:
- The existing `INSERT_KEYS` set and blocking branch in `onKeydown` is replaced by a delegation
  to `handleVimKeydown`, under the same guard shape already reviewed and approved (vim pane open,
  input empty, no modifier keys held), except now checking `event.key !== ':'` instead of
  membership in a small key set — everything non-`:`, non-modifier goes to the vim handler:
  ```ts
  if (
    vimBuffer.value &&
    input.value === '' &&
    !event.ctrlKey && !event.altKey && !event.metaKey &&
    event.key !== ':'
  ) {
    if (handleVimKeydown(event)) event.preventDefault()
    return
  }
  ```
- The title-bar `-- INSERT --` badge (currently `v-if="trapped"`) changes to
  `v-if="vimBuffer?.mode === 'insert'"` — `trapped` still gates whether `Esc` closes the overlay
  (unchanged, that's a separate concern), but the badge itself should reflect the real editing
  mode now that one exists, not just "a vim pane happens to be open."

**`frontend/src/components/terminal/VimPane.vue`**:
- Prop renamed `file` → `buffer`, typed `VimBufferState` (was `VimFile`).
- The line matching `buffer.cursor.row` renders in three spans (before-cursor text, the
  highlighted character at the cursor, after-cursor text) instead of one plain paragraph; all
  other lines render as before.
- Status line gains a `[+]` marker when `buffer.dirty` is true:
  `"about.txt" [readonly] [+] 8L, 322B` vs. `"about.txt" [readonly] 8L, 322B` when clean.

**`frontend/src/terminal/commands/eggs.ts`**:
- The `vim` command is unchanged (still builds a plain `VimFile` and calls
  `ctx.effects.vim(true, { name, lines })` — the richer runtime state is constructed inside
  `useTerminal.ts`, not here).
- The `:q` command's `run()` changes to check `effects.vimIsDirty()`:
  ```ts
  run({ effects, raw }) {
    const cmd = raw.trim()
    if (cmd === ':q' || cmd === ':quit') {
      if (effects.vimIsDirty()) {
        return [line("E37: No write since last change (add ! to override)", 'error')]
      }
      effects.vim(false)
      return [line('you are free. that was the hard part.', 'success')]
    }
    if (cmd === ':q!' || cmd === ':quit!') {
      effects.vim(false)
      return [line('you are free. that was the hard part.', 'success')]
    }
    return [
      line("E45: 'readonly' option is set (add ! to override)", 'error'),
      line('hint: try `:q` to quit without writing.', 'muted'),
    ]
  }
  ```

## Key mapping

**Normal mode:**

| Key(s) | Action |
|---|---|
| `h` / `←` | Move cursor left, clamped to column 0 |
| `l` / `→` | Move cursor right, clamped to `max(0, line.length - 1)` |
| `j` / `↓` | Move cursor down a line, clamped to the last line; column re-clamped to the new line's bounds |
| `k` / `↑` | Move cursor up a line; column re-clamped |
| `0` | Move to column 0 of the current line |
| `$` | Move to `max(0, line.length - 1)` of the current line |
| `i` | Enter insert mode at the cursor (no movement) |
| `I` | Move to column 0, enter insert mode |
| `a` | Move cursor one right (or stay if line is empty), enter insert mode |
| `A` | Move to end of line, enter insert mode |
| `o` | Insert a new empty line after the current one, move cursor there (col 0), enter insert mode, mark dirty |
| `O` | Insert a new empty line before the current one (cursor's row stays the same index, now pointing at the new blank line), col 0, enter insert mode, mark dirty |
| `x` | If the line is non-empty and the cursor is within it, delete the character at the cursor; mark dirty; re-clamp column |
| anything else | No-op |

**Insert mode:**

| Key(s) | Action |
|---|---|
| Printable character (`event.key.length === 1`, no modifiers) | Insert at the cursor, cursor moves right one, mark dirty |
| `Backspace` | If column > 0: delete the character before the cursor, cursor moves left one, mark dirty. If column is 0 and row > 0: merge this line onto the end of the previous line, cursor moves to the join point, remove this line from the array, mark dirty. If row 0 and column 0: no-op |
| `Enter` | Split the current line at the cursor into two lines (`line.slice(0, col)` stays, `line.slice(col)` becomes a new line after it), cursor moves to column 0 of the new line, mark dirty |
| `←` `→` `↑` `↓` | Same movement as normal mode; mode does not change |
| `Esc` | Return to normal mode; cursor moves left one column (clamped to 0), matching real vim's exact behavior on leaving insert mode |
| `Tab` and other non-printable keys | No-op (not implementing tab-character insertion) |

## Error handling

No new error states beyond what's in "Decisions" above (`E37` for quitting a dirty buffer without
a bang, `E45` unchanged for any write attempt). Movement/editing at buffer boundaries clamps
rather than erroring, matching real vim's quiet behavior at edges.

## Verification

Manual, in browser preview (this project has no automated test runner — see the prior plan's
Global Constraints, unchanged here):
- Open `vim about.txt`, move the cursor with `hjkl` and arrow keys, confirm it stays within
  bounds at every edge (first/last line, first/last column, empty lines if any).
- Press `A`, type some text, confirm it appears at the end of the line and the status line gains
  `[+]`.
- Press `Esc`, confirm mode returns to normal (title-bar badge disappears) and the cursor steps
  back one column.
- Press `o`, type a line, confirm a genuinely new line was inserted below.
- Position the cursor at the start of a line (not the first line) and press `Backspace` in insert
  mode, confirm it merges into the previous line at the correct join column.
- Type `:q` on a dirty buffer, confirm the `E37` message and that the pane stays open. Type `:q!`,
  confirm it force-closes.
- Type `:wq` on a dirty buffer, confirm the `E45` message and the pane stays open (still can't
  write, dirty or not).
- Re-open the same file with `vim about.txt` after having force-quit a dirty edit, confirm the
  content is back to the original (edits didn't persist).
- Confirm `x` deletes the character under the cursor and marks dirty.
- Confirm Ctrl+C/Ctrl+L/Ctrl+A (modifier combos) still work while the vim pane is open, unaffected
  by the new key handling (regression check for the fix already made to the prior plan).
- Confirm typing `:` still starts a command line as before (regression check).

## Out of scope

- `dd`, yank/put, undo, counts (`3j`), word motions (`w`/`b`/`e`), visual mode — noted above,
  explicitly excluded to keep this a "core" emulation rather than a full clone.
- Tab-character insertion.
- Any actual persistence — the file is fundamentally readonly; this spec makes the *editing*
  real, not the *saving*.
- Cursor blink animation.
- Mobile support — inherits the existing "terminal hidden below `md`" scope decision from the
  original features spec.
