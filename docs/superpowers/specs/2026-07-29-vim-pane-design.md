# A real vim-style pane for the `vim` terminal command

Status: implemented (PR #10, `fab290e`). The read-only behaviour described here was superseded
within the same PR by [the editing spec](2026-07-29-vim-pane-editing-design.md) — the pane now
takes real input. See [features-spec.md §5.1](../../features-spec.md) for the shipped result.

## Context

The `vim` easter egg (`frontend/src/terminal/commands/eggs.ts`) currently just prints a few
static `~`-prefixed lines into the normal scrolling output buffer and sets a `trapped` flag that
blocks `Esc` from closing the overlay. It doesn't look like vim — it's a joke made of plain
terminal lines — and it can't open any file content.

Goal: make `vim [file]` render an actual full-height, vim-styled pane inside the terminal overlay
(tildes filling unused space, a status line, readonly behavior), and let it open the same fake
files `cat` already knows about (`about.txt`, `skills.txt`, `contact.txt`, `.secret`, and
guestbook entries), read-only — you can look but not touch.

## Decisions

- **File scope**: exactly the set `cat` already supports. No new content is invented for this
  feature.
- **Fidelity**: static full view. The whole file renders at once (nothing in the fake filesystem
  is long enough to need scrolling); no cursor movement, no `hjkl` navigation.
- **Readonly feedback**: pressing an insert-triggering key (`i`, `I`, `a`, `A`, `o`, `O`, `s`,
  `S`, `c`, `C`, `r`, `R`) while the pane is focused shows a real vim-style error
  (`E45: 'readonly' option is set (add ! to override)`) instead of typing the character. The same
  error text is reused when the visitor tries to `:wq`/`:x` (write-and-quit) — one consistent
  "you cannot change this" joke, whether triggered mid-buffer or at exit.
- **Exit**: `:q` (no bang) now works to leave vim, since a readonly buffer can never have unsaved
  changes — real vim would allow this too. `:q!`/`:quit`/`:quit!` also work. `:wq`/`:wq!`/`:x`
  fail with the readonly error above, because they attempt to write.
- **Unknown file**: `vim <file>` for a file that doesn't resolve prints
  `vim: <file>: No such file or directory` to the normal scrolling buffer and does **not** open
  the pane — same failure style as `cat`.
- **No mobile changes needed**: the terminal launcher is already hidden below `md` (existing
  scope decision in `features-spec.md` §9), so this inherits that constraint for free.

## Data layer: shared file resolver

**Where:** new `frontend/src/terminal/commands/files.ts`

`navigate.ts`'s `cat` command currently has the content for `about.txt`, `skills.txt`,
`contact.txt`, `.secret` (via `secretContents`) and guestbook entries (via
`resolveGuestbookFile`) inline in a `switch`. Since `vim` needs to show the exact same content,
that switch moves into one function:

```ts
function resolveFileLines(file: string, t: TFunction): OutputLine[] | undefined
```

Returns the same `OutputLine[]` (with tones) as `cat` prints today, or `undefined` if the name
doesn't resolve to anything (including guestbook entries, tried last, same fallback order as
today).

- `cat` becomes: `resolveFileLines(file, t) ?? [line('cat: ...', 'error')]` — visually identical
  output to today, just no longer duplicated.
- `vim` calls the same function and strips it to plain strings (`.map(l => l.text)`) for the
  pane, since the pane renders monochrome text, not toned terminal lines.

This is the only refactor of existing code; everything else is additive.

## State: `useTerminal.ts`

- New module-level ref: `vimBuffer = ref<{ name: string; lines: string[] } | null>(null)`.
  Non-null means the vim pane is showing in place of the normal scrolling output.
- New module-level ref: `vimError = ref<string | null>(null)` — the transient readonly-error
  message, auto-cleared via `setTimeout` after ~2s (any new error restarts the timer).
- `TerminalEffects.vim` signature changes:
  ```ts
  vim: (enabled: boolean, file?: { name: string; lines: string[] }) => void
  ```
  Setting `enabled: true` sets `trapped.value = true` and `vimBuffer.value = file ?? null`.
  Setting `enabled: false` clears both. The existing `trapped` ref is unchanged in meaning
  (still what blocks `Esc` from closing the overlay) and continues to be exposed the same way.
- A new exported function `triggerVimReadonlyError()` sets `vimError.value` to the E45 string and
  schedules it back to `null`. This is called directly from `TerminalOverlay.vue`'s keydown
  handler (not through a `Command`, since it's a UI-level interaction, not something the visitor
  typed and submitted).

## UI: `VimPane.vue`

**Where:** new `frontend/src/components/terminal/VimPane.vue`, mounted conditionally in
`TerminalOverlay.vue`.

Replaces the existing scrolling output `<div>` (not the title bar, not the input line) whenever
`vimBuffer` is non-null:

```
[content lines, one per row, plain monochrome text]
~
~
~                              <- ~60 tilde filler lines; container has overflow-hidden,
~                                  so however many actually fit is whatever fits — no
...                                pixel/height measurement needed for different pane
                                   sizes (normal 60vh vs maximised 85vh) or font sizes
["<name>" [readonly] <N>L, <B>B]   <- status line, replaced by the E45 vimError message
                                       for ~2s when set, then reverts
```

- No-argument `vim` → `name: '[No Name]'`, content is the splash text, vertically centered
  among the tildes (a handful of blank lines above it, computed as roughly a third of a
  generous fixed line count — approximate centering, not exact, since exact requires knowing
  the real rendered height):
  ```
  VIM - Vi IMproved

  type :q to exit

  (Esc still won't save you)
  ```
- `vim <file>` → `name` is the resolved filename, `lines` is that file's plain text.
- Status line byte count (`<B>B`) is `lines.join('\n').length` — UTF-16 code units, not a true
  UTF-8 byte count. Good enough for a joke status line.
- Props: `file: { name: string; lines: string[] }`, `error: string | null`.
- Keeps the same `aria-live="polite" aria-atomic="false"` wrapper the normal output div uses
  today, so screen reader behavior doesn't regress.

## Interaction: `TerminalOverlay.vue`

- Template: `<VimPane v-if="vimBuffer" :file="vimBuffer" :error="vimError" />` next to the
  existing `<div v-else ref="scrollEl">...</div>` output block (mutually exclusive).
- `onKeydown` gains one branch, checked before the existing ArrowUp/Down/Tab/Ctrl+L/Ctrl+C
  handling:
  ```ts
  const INSERT_KEYS = new Set(['i', 'I', 'a', 'A', 'o', 'O', 's', 'S', 'c', 'C', 'r', 'R'])
  if (vimBuffer.value && input.value === '' && INSERT_KEYS.has(event.key)) {
    event.preventDefault()
    triggerVimReadonlyError()
    return
  }
  ```
  The `input.value === ''` guard means this only fires on the *first* keystroke of a fresh input
  line — once a visitor has typed `:` (not in `INSERT_KEYS`) to start a command, subsequent
  characters (even `q`, `w`, `x`) type normally, so `:q!`/`:wq` etc. are unaffected.
- The bottom input field itself is untouched structurally — it already doubles as vim's `:`
  command line, since `:q`/`:q!`/`:wq`/`:x`/`:quit` are already registered as ordinary terminal
  commands resolved through the normal command pipeline (`resolve(name)`), same mechanism as
  every other command.

## Command changes: `eggs.ts`

```ts
{
  name: 'vim',
  aliases: ['vi', 'nvim', 'emacs'],
  run(ctx) {
    if (ctx.raw.startsWith('emacs')) {
      return [line('emacs: a great operating system, lacking only a decent editor.', 'muted')]
    }
    const [file] = ctx.args
    if (!file) {
      ctx.effects.vim(true, { name: '[No Name]', lines: VIM_SPLASH })
      return
    }
    const lines = resolveFileLines(file, ctx.t)
    if (!lines) {
      return [line(`vim: ${file}: No such file or directory`, 'error')]
    }
    ctx.effects.vim(true, { name: file, lines: lines.map((l) => l.text) })
  },
}
```

```ts
{
  name: ':q',
  aliases: [':q!', ':quit', ':quit!', ':wq', ':wq!', ':x'],
  run({ effects, raw }) {
    const cmd = raw.trim()
    if (cmd === ':q' || cmd === ':q!' || cmd === ':quit' || cmd === ':quit!') {
      effects.vim(false)
      return [line('you are free. that was the hard part.', 'success')]
    }
    // :wq, :wq!, :x — all attempt to write a readonly buffer
    return [
      line("E45: 'readonly' option is set (add ! to override)", 'error'),
      line('hint: try `:q` — there is nothing to save anyway.', 'muted'),
    ]
  },
}
```

## Error handling

- Unknown file passed to `vim`: handled above, no pane opens.
- No other error states — the pane only ever shows content that already resolved successfully.

## Verification

Manual, in browser preview:
- `vim` with no args → pane opens with splash text centered among tildes, status line shows
  `[No Name]`.
- `vim about.txt` → pane shows the same bio text `cat about.txt` prints (modulo color), status
  line shows `"about.txt" [readonly] <N>L, <B>B`.
- `vim nonexistent.txt` → error line in the normal buffer, pane does not open.
- Press `i` with an empty input while the pane is open → input stays empty, status line flashes
  the E45 message, reverts after ~2s.
- Type `:q!` while the pane is open → pane closes, success message printed to the normal buffer.
- Type `:wq` while the pane is open → E45 message printed to the normal buffer, pane stays open.
- `cat about.txt` still prints identically to before the refactor (colors/tones unchanged).
- `Esc` still does not close the overlay while the pane is open (existing `trapped` behavior,
  unchanged).

## Out of scope

- Cursor movement / `hjkl` / scrolling — not needed, all content fits statically.
- Any actual write/edit capability — the whole point is read-only.
- Mobile support — inherits the existing "terminal hidden below `md`" scope decision.
- Syntax highlighting or line numbers — real vim's *default* look (no numbers) is what's being
  imitated, not a configured one.
