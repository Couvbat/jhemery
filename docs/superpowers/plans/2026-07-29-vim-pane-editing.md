# Vim Pane Real Navigation and Editing Implementation Plan

**Status: complete.** Shipped in PR #10 (`fab290e`), alongside
[the pane plan](2026-07-29-vim-pane-terminal.md) it builds on. A follow-up fix in PR #11
(`85bd5ec`) corrected `Escape` handling. Kept as a record of the reasoning, not as an open work
item.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the vim terminal pane real cursor navigation and real insert-mode editing (in-memory only, never persisted), with `:q` now genuinely refusing to quit a modified buffer without a bang.

**Architecture:** A new pure module (`vimEditor.ts`, no Vue/DOM dependencies) owns all cursor/mode/line-mutation logic as a single `handleVimKey(state, event)` dispatcher. The terminal composable (`useTerminal.ts`) owns the reactive `VimBufferState` and delegates keydowns to it. `TerminalOverlay.vue` routes non-`:`, non-modifier keydowns to the editor while a vim pane is open; `VimPane.vue` renders the resulting cursor/dirty state. `eggs.ts`'s `:q` command reads dirty state through a new `effects.vimIsDirty()` to decide whether to require a bang.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-vim-pane-editing-design.md` — read it before starting.
- Builds on an already-implemented, already-reviewed prior plan (`docs/superpowers/plans/2026-07-29-vim-pane-terminal.md`) — the read-only vim pane, `resolveFileLines`, and the `VimFile`/`vimBuffer` state it introduced all exist in the codebase already. This plan modifies that code, not the codebase from scratch.
- This frontend has **no automated test runner**. Verification is `npm run type-check` (from `frontend/`) plus manual browser checks, matching this project's documented convention — **except** for the new `vimEditor.ts` module, which has zero Vue/DOM dependencies and can be exercised with a real, deterministic, throwaway Node script (Task 1) — a strictly stronger check than the project's usual manual-only convention, use it.
- **Deliberate cleanup**: `vimError`/`triggerVimReadonlyError` (the old "flash an error when an insert key is pressed" mechanism from the read-only-only version) becomes genuinely dead code once insert keys perform real actions instead of being blocked — nothing calls `triggerVimReadonlyError` anymore once Task 2 lands. Task 2 removes it. This is intentional, not an oversight — do not flag its removal as an unexplained deletion.
- File naming/paths, types, and function names below are exact — later tasks depend on the exact names introduced in earlier tasks.
- `frontend/tsconfig.app.json` has `noUncheckedIndexedAccess: true` — the code below already accounts for this (`?? ''` fallbacks on array indexing).

---

### Task 1: `VimBufferState` types + pure `vimEditor.ts` logic

**Files:**
- Modify: `frontend/src/terminal/types.ts`
- Create: `frontend/src/terminal/vimEditor.ts`

**Interfaces:**
- Produces: `VimCursor { row: number; col: number }`, `VimMode = 'normal' | 'insert'`, `VimBufferState { name: string; lines: string[]; cursor: VimCursor; mode: VimMode; dirty: boolean }` — all exported from `frontend/src/terminal/types.ts`. `handleVimKey(state: VimBufferState, event: KeyboardEvent): boolean` — exported from `frontend/src/terminal/vimEditor.ts`. Returns `false` only for `event.key === ':'`; every other key returns `true` (handled, including silent no-ops for unmapped keys). Task 2 consumes both.
- This task does **not** touch `TerminalEffects` or any other existing type/file — `vimIsDirty` is added to `TerminalEffects` in Task 2, bundled with the composable code that implements it (adding it here would make `useTerminal.ts`'s existing `effects` object literal fail type-check, since it wouldn't yet satisfy the interface).

- [x] **Step 1: Add the new types to `types.ts`**

In `frontend/src/terminal/types.ts`, insert directly above the existing `export interface VimFile { ... }` block:

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

(`VimFile` itself is unchanged — it keeps its existing role as the "open with this content" payload the `vim` command passes when starting a session. `VimBufferState` is the richer runtime state built from it.)

- [x] **Step 2: Create `frontend/src/terminal/vimEditor.ts`**

```ts
import type { VimBufferState } from './types'

function currentLine(state: VimBufferState): string {
  return state.lines[state.cursor.row] ?? ''
}

/** Clamps the cursor's column to the current line's bounds. `allowEnd` permits
 *  sitting one past the last character (used when entering insert mode via
 *  `a`/`A`); normal-mode movement never allows that. */
function clampCol(state: VimBufferState, allowEnd: boolean) {
  const len = currentLine(state).length
  const max = allowEnd ? len : Math.max(0, len - 1)
  state.cursor.col = Math.min(Math.max(0, state.cursor.col), max)
}

function moveLeft(state: VimBufferState) {
  state.cursor.col = Math.max(0, state.cursor.col - 1)
}

function moveRight(state: VimBufferState) {
  state.cursor.col = Math.min(state.cursor.col + 1, Math.max(0, currentLine(state).length - 1))
}

function moveDown(state: VimBufferState) {
  state.cursor.row = Math.min(state.cursor.row + 1, state.lines.length - 1)
  clampCol(state, false)
}

function moveUp(state: VimBufferState) {
  state.cursor.row = Math.max(state.cursor.row - 1, 0)
  clampCol(state, false)
}

function handleNormalKey(key: string, state: VimBufferState): void {
  switch (key) {
    case 'h':
    case 'ArrowLeft':
      moveLeft(state)
      return
    case 'l':
    case 'ArrowRight':
      moveRight(state)
      return
    case 'j':
    case 'ArrowDown':
      moveDown(state)
      return
    case 'k':
    case 'ArrowUp':
      moveUp(state)
      return
    case '0':
      state.cursor.col = 0
      return
    case '$':
      state.cursor.col = Math.max(0, currentLine(state).length - 1)
      return
    case 'i':
      state.mode = 'insert'
      return
    case 'I':
      state.cursor.col = 0
      state.mode = 'insert'
      return
    case 'a':
      state.cursor.col = Math.min(state.cursor.col + 1, currentLine(state).length)
      state.mode = 'insert'
      return
    case 'A':
      state.cursor.col = currentLine(state).length
      state.mode = 'insert'
      return
    case 'o':
      state.lines.splice(state.cursor.row + 1, 0, '')
      state.cursor.row += 1
      state.cursor.col = 0
      state.mode = 'insert'
      state.dirty = true
      return
    case 'O':
      state.lines.splice(state.cursor.row, 0, '')
      state.cursor.col = 0
      state.mode = 'insert'
      state.dirty = true
      return
    case 'x': {
      const line = currentLine(state)
      if (line.length > 0 && state.cursor.col < line.length) {
        state.lines[state.cursor.row] =
          line.slice(0, state.cursor.col) + line.slice(state.cursor.col + 1)
        state.dirty = true
        clampCol(state, false)
      }
      return
    }
    default:
      return
  }
}

function handleInsertKey(event: KeyboardEvent, state: VimBufferState): void {
  const { key } = event

  if (key === 'Escape') {
    state.mode = 'normal'
    state.cursor.col = Math.max(0, state.cursor.col - 1)
    return
  }
  if (key === 'ArrowLeft') {
    moveLeft(state)
    return
  }
  if (key === 'ArrowRight') {
    moveRight(state)
    return
  }
  if (key === 'ArrowUp') {
    moveUp(state)
    return
  }
  if (key === 'ArrowDown') {
    moveDown(state)
    return
  }
  if (key === 'Backspace') {
    if (state.cursor.col > 0) {
      const line = currentLine(state)
      state.lines[state.cursor.row] =
        line.slice(0, state.cursor.col - 1) + line.slice(state.cursor.col)
      state.cursor.col -= 1
      state.dirty = true
    } else if (state.cursor.row > 0) {
      const line = currentLine(state)
      const prevLine = state.lines[state.cursor.row - 1] ?? ''
      state.lines.splice(state.cursor.row - 1, 2, prevLine + line)
      state.cursor.row -= 1
      state.cursor.col = prevLine.length
      state.dirty = true
    }
    return
  }
  if (key === 'Enter') {
    const line = currentLine(state)
    const before = line.slice(0, state.cursor.col)
    const after = line.slice(state.cursor.col)
    state.lines.splice(state.cursor.row, 1, before, after)
    state.cursor.row += 1
    state.cursor.col = 0
    state.dirty = true
    return
  }
  if (key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
    const line = currentLine(state)
    state.lines[state.cursor.row] = line.slice(0, state.cursor.col) + key + line.slice(state.cursor.col)
    state.cursor.col += 1
    state.dirty = true
  }
}

/**
 * Dispatches one keydown to the vim pane's cursor/mode/buffer state, mutating it
 * in place. Returns `false` only for `:` — the caller lets that fall through to
 * the existing command-line typing mechanism unchanged. Every other key is
 * considered handled, including ones this editor doesn't map to anything, since
 * real vim's normal mode silently swallows unmapped keys rather than leaking
 * them into the shell.
 */
export function handleVimKey(state: VimBufferState, event: KeyboardEvent): boolean {
  if (event.key === ':') return false
  if (state.mode === 'insert') {
    handleInsertKey(event, state)
  } else {
    handleNormalKey(event.key, state)
  }
  return true
}
```

- [x] **Step 3: Type-check**

Run: `npm run type-check` (from `frontend/`)
Expected: no errors.

- [x] **Step 4: Write and run a throwaway verification script**

Create `frontend/tmp-vim-editor-check.ts` (temporary — deleted in Step 5, never committed):

```ts
import assert from 'node:assert/strict'
import { handleVimKey } from './src/terminal/vimEditor.ts'
import type { VimBufferState } from './src/terminal/types.ts'

function freshState(lines: string[]): VimBufferState {
  return { name: 'test.txt', lines, cursor: { row: 0, col: 0 }, mode: 'normal', dirty: false }
}

function key(k: string): KeyboardEvent {
  return { key: k, ctrlKey: false, altKey: false, metaKey: false } as unknown as KeyboardEvent
}

// Movement clamps at line end in normal mode
{
  const s = freshState(['abc'])
  handleVimKey(s, key('l'))
  handleVimKey(s, key('l'))
  handleVimKey(s, key('l'))
  assert.equal(s.cursor.col, 2, 'l should clamp to last character index')
}

// j clamps column to a shorter next line
{
  const s = freshState(['abcdef', 'ab'])
  s.cursor.col = 5
  handleVimKey(s, key('j'))
  assert.equal(s.cursor.row, 1)
  assert.equal(s.cursor.col, 1, 'column should clamp to new line length - 1')
}

// i enters insert mode without moving
{
  const s = freshState(['abc'])
  s.cursor.col = 1
  handleVimKey(s, key('i'))
  assert.equal(s.mode, 'insert')
  assert.equal(s.cursor.col, 1)
}

// typing a character in insert mode inserts it and marks dirty
{
  const s = freshState(['ac'])
  s.mode = 'insert'
  s.cursor.col = 1
  handleVimKey(s, key('b'))
  assert.equal(s.lines[0], 'abc')
  assert.equal(s.cursor.col, 2)
  assert.equal(s.dirty, true)
}

// Enter splits the line
{
  const s = freshState(['abcdef'])
  s.mode = 'insert'
  s.cursor.col = 3
  handleVimKey(s, key('Enter'))
  assert.deepEqual(s.lines, ['abc', 'def'])
  assert.equal(s.cursor.row, 1)
  assert.equal(s.cursor.col, 0)
  assert.equal(s.dirty, true)
}

// Backspace at column 0 merges into the previous line
{
  const s = freshState(['abc', 'def'])
  s.mode = 'insert'
  s.cursor.row = 1
  s.cursor.col = 0
  handleVimKey(s, key('Backspace'))
  assert.deepEqual(s.lines, ['abcdef'])
  assert.equal(s.cursor.row, 0)
  assert.equal(s.cursor.col, 3)
}

// Escape returns to normal mode and steps the cursor back one column
{
  const s = freshState(['abc'])
  s.mode = 'insert'
  s.cursor.col = 2
  handleVimKey(s, key('Escape'))
  assert.equal(s.mode, 'normal')
  assert.equal(s.cursor.col, 1)
}

// o opens a new line below, enters insert mode, marks dirty
{
  const s = freshState(['abc'])
  handleVimKey(s, key('o'))
  assert.deepEqual(s.lines, ['abc', ''])
  assert.equal(s.cursor.row, 1)
  assert.equal(s.cursor.col, 0)
  assert.equal(s.mode, 'insert')
  assert.equal(s.dirty, true)
}

// x deletes the character under the cursor and marks dirty
{
  const s = freshState(['abc'])
  s.cursor.col = 1
  handleVimKey(s, key('x'))
  assert.equal(s.lines[0], 'ac')
  assert.equal(s.dirty, true)
}

// ':' is not handled, so callers know to let it fall through
{
  const s = freshState(['abc'])
  const handled = handleVimKey(s, key(':'))
  assert.equal(handled, false)
}

console.log('all vimEditor checks passed')
```

Run: `node tmp-vim-editor-check.ts` (from `frontend/`)
Expected output: `all vimEditor checks passed`, exit code 0. If any assertion fails, Node prints an `AssertionError` with the expected/actual values — fix `vimEditor.ts` (not the test) until all pass, since these assertions encode the spec's exact documented behavior.

- [x] **Step 5: Delete the throwaway script**

```bash
rm frontend/tmp-vim-editor-check.ts
```

This script is not part of the shipped code and must not be committed — it exists purely to verify Step 2's logic deterministically before moving on.

- [x] **Step 6: Commit**

```bash
git add frontend/src/terminal/types.ts frontend/src/terminal/vimEditor.ts
git commit -m "feat: add vim pane cursor/editing state machine"
```

(The temporary script is already deleted and was never staged, so it won't appear in this commit — confirm with `git status` that only the two intended files are staged before committing.)

---

### Task 2: Wire real navigation/editing into the composable, overlay, and pane

**Files:**
- Modify: `frontend/src/terminal/types.ts`
- Modify: `frontend/src/composables/useTerminal.ts`
- Modify: `frontend/src/components/terminal/TerminalOverlay.vue`
- Modify: `frontend/src/components/terminal/VimPane.vue`

**Interfaces:**
- Consumes: `VimBufferState`, `handleVimKey` (Task 1).
- Produces: `TerminalEffects.vimIsDirty(): boolean`. From `useTerminal()`: `handleVimKeydown(event: KeyboardEvent): boolean`. `vimBuffer` now typed `ComputedRef<VimBufferState | null>` (was `VimFile | null`). `VimPane` now takes a single prop `buffer: VimBufferState` (the `file`/`error` props are gone). Task 3 consumes `effects.vimIsDirty()`.

- [x] **Step 1: Add `vimIsDirty` to `TerminalEffects` in `types.ts`**

Change the existing `TerminalEffects` interface from:

```ts
export interface TerminalEffects {
  matrix: () => void
  crt: (enabled?: boolean) => boolean
  vim: (enabled: boolean, file?: VimFile) => void
  glitch: (durationMs: number) => Promise<void>
  playMusic: () => void
}
```

to:

```ts
export interface TerminalEffects {
  matrix: () => void
  crt: (enabled?: boolean) => boolean
  vim: (enabled: boolean, file?: VimFile) => void
  vimIsDirty: () => boolean
  glitch: (durationMs: number) => Promise<void>
  playMusic: () => void
}
```

- [x] **Step 2: Update `useTerminal.ts`**

1. Change the type-only import line from:
   ```ts
   import type { CommandContext, OutputLine, TerminalEffects, VimFile } from '@/terminal/types'
   ```
   to:
   ```ts
   import type { CommandContext, OutputLine, TerminalEffects, VimBufferState, VimFile } from '@/terminal/types'
   import { handleVimKey } from '@/terminal/vimEditor'
   ```

2. Replace these three lines:
   ```ts
   /** Non-null while the vim pane is showing in place of the normal scrolling output. */
   const vimBuffer = ref<VimFile | null>(null)
   /** Transient readonly-error message shown in the vim pane's status line. */
   const vimError = ref<string | null>(null)
   let vimErrorTimeoutId: number | null = null
   ```
   with:
   ```ts
   /** Non-null while the vim pane is showing in place of the normal scrolling output. */
   const vimBuffer = ref<VimBufferState | null>(null)
   ```
   (`vimError`/`vimErrorTimeoutId` are removed — see Global Constraints on why this is dead code now.)

3. Replace the `effects` object's `vim` field and add `vimIsDirty` — change:
   ```ts
     vim: (enabled: boolean, file?: VimFile) => {
       trapped.value = enabled
       vimBuffer.value = enabled ? (file ?? null) : null
     },
   ```
   to:
   ```ts
     vim: (enabled: boolean, file?: VimFile) => {
       trapped.value = enabled
       vimBuffer.value =
         enabled && file
           ? {
               name: file.name,
               lines: [...file.lines],
               cursor: { row: 0, col: 0 },
               mode: 'normal',
               dirty: false,
             }
           : null
     },
     vimIsDirty: () => vimBuffer.value?.dirty ?? false,
   ```

4. Delete the whole `triggerVimReadonlyError` function (the `/** Flashes the vim pane's readonly error... */` block, roughly 10 lines, directly below the `effects` object).

5. In its place, add:
   ```ts
   /** Delegates one keydown to the vim editor's pure state machine. Returns `false`
    *  if there's no open vim buffer, or the key wasn't handled (currently only `:`),
    *  telling the caller to let the keystroke fall through normally. */
   export function handleVimKeydown(event: KeyboardEvent): boolean {
     if (!vimBuffer.value) return false
     return handleVimKey(vimBuffer.value, event)
   }
   ```

6. In the `useTerminal()` return object, remove the `vimError: computed(() => vimError.value),` line and the `triggerVimReadonlyError,` line; add `handleVimKeydown,` in their place (anywhere in the object — grouping it near `vimBuffer: computed(() => vimBuffer.value),` is tidiest).

- [x] **Step 3: Update `TerminalOverlay.vue`**

1. In the `useTerminal()` destructure, replace `vimError,` and `triggerVimReadonlyError,` with `handleVimKeydown,` (keep `vimBuffer,` as-is).

2. Replace the whole `onKeydown` function:
   ```ts
   const INSERT_KEYS = new Set(['i', 'I', 'a', 'A', 'o', 'O', 's', 'S', 'c', 'C', 'r', 'R'])

   function onKeydown(event: KeyboardEvent) {
     if (
       vimBuffer.value &&
       input.value === '' &&
       !event.ctrlKey &&
       !event.altKey &&
       !event.metaKey &&
       INSERT_KEYS.has(event.key)
     ) {
       event.preventDefault()
       triggerVimReadonlyError()
       return
     }

     if (event.key === 'ArrowUp') {
   ```
   with:
   ```ts
   function onKeydown(event: KeyboardEvent) {
     if (
       vimBuffer.value &&
       input.value === '' &&
       !event.ctrlKey &&
       !event.altKey &&
       !event.metaKey &&
       event.key !== ':'
     ) {
       if (handleVimKeydown(event)) event.preventDefault()
       return
     }

     if (event.key === 'ArrowUp') {
   ```
   (Everything from `if (event.key === 'ArrowUp')` onward in the function body is unchanged — only the guard block above it changes, and the `INSERT_KEYS` set is deleted entirely.)

3. In the template, change:
   ```html
           <span v-if="trapped" class="text-xs text-yellow-400">-- INSERT --</span>
   ```
   to:
   ```html
           <span v-if="vimBuffer?.mode === 'insert'" class="text-xs text-yellow-400">-- INSERT --</span>
   ```

4. In the template, change:
   ```html
           <VimPane v-else :file="vimBuffer" :error="vimError" />
   ```
   to:
   ```html
           <VimPane v-else :buffer="vimBuffer" />
   ```

- [x] **Step 4: Rewrite `VimPane.vue`**

Replace the whole file with:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { VimBufferState } from '@/terminal/types'

const props = defineProps<{ buffer: VimBufferState }>()

/** Fixed, generous count — the container clips whatever doesn't fit, so this
 *  works at both the normal (60vh) and maximised (85vh) overlay heights without
 *  measuring pixel heights. */
const TILDE_COUNT = 60
const tildeRows = Array.from({ length: TILDE_COUNT })

const statusText = computed(() => {
  const byteCount = props.buffer.lines.join('\n').length
  const modified = props.buffer.dirty ? ' [+]' : ''
  return `"${props.buffer.name}" [readonly]${modified} ${props.buffer.lines.length}L, ${byteCount}B`
})
</script>

<template>
  <div
    class="flex-1 flex flex-col overflow-hidden font-mono text-xs sm:text-sm"
    aria-live="polite"
    aria-atomic="false"
  >
    <div class="flex-1 overflow-hidden p-4">
      <p
        v-for="(text, i) in buffer.lines"
        :key="`line-${i}`"
        class="text-foreground whitespace-pre-wrap break-words"
      ><template v-if="i === buffer.cursor.row"
        >{{ text.slice(0, buffer.cursor.col) }}<span
          class="bg-primary text-background"
          >{{ text[buffer.cursor.col] ?? ' ' }}</span
        >{{ text.slice(buffer.cursor.col + 1) }}</template
      ><template v-else>{{ text || ' ' }}</template></p>
      <p v-for="(_, i) in tildeRows" :key="`tilde-${i}`" class="text-muted-foreground">~</p>
    </div>
    <p class="px-4 py-1 border-t border-border shrink-0 truncate text-muted-foreground bg-muted">{{
      statusText
    }}</p>
  </div>
</template>
```

- [x] **Step 5: Type-check**

Run: `npm run type-check` (from `frontend/`)
Expected: no errors.

- [x] **Step 6: Manual verification in the browser**

`eggs.ts` hasn't changed yet in this task, so `:q`'s dirty-refusal behavior isn't wired up — `:q` will still close immediately even on a dirty buffer at this point. That's expected; it's covered in Task 3. For this task, verify:

- `vim about.txt` → pane opens, cursor visible (highlighted block) at row 0, col 0.
- Press `l` several times → cursor moves right, stops at the last character of the line (doesn't run off the end).
- Press `j`/`k` → cursor moves between lines, column re-clamps sensibly when a line is shorter.
- Press `A` → cursor jumps to end of the current line; title-bar badge now shows `-- INSERT --` (it did not before pressing `A`).
- Type a few characters → they appear in the line; status line gains ` [+]`.
- Press `Esc` → title-bar badge disappears (mode back to normal), cursor stepped back one column.
- Press `o` → a new blank line appears below, cursor on it, insert mode active.
- Type text, press `Enter`, confirm the line actually split into two.
- Move to the start of a non-first line in insert mode and press `Backspace` → merges into the previous line at the correct column.
- Press `:` → still types normally into the bottom input (regression check — confirm a stray `:` keystroke isn't swallowed by the new handler).
- With the pane open, press Ctrl+C and Ctrl+L → still cancel / clear as before (regression check for the modifier-key exemption).
- `cat about.txt` still prints identically to before (regression check — `files.ts`/`navigate.ts` untouched by this task).

- [x] **Step 7: Commit**

```bash
git add frontend/src/terminal/types.ts frontend/src/composables/useTerminal.ts frontend/src/components/terminal/TerminalOverlay.vue frontend/src/components/terminal/VimPane.vue
git commit -m "feat: wire real vim cursor navigation and insert-mode editing"
```

---

### Task 3: Dirty-aware `:q`, full verification

**Files:**
- Modify: `frontend/src/terminal/commands/eggs.ts`

**Interfaces:**
- Consumes: `effects.vimIsDirty()` (Task 2).
- Produces: nothing further depends on this task — it's the final piece.

- [x] **Step 1: Rewrite the `:q` command**

In `frontend/src/terminal/commands/eggs.ts`, replace the whole `:q` command object:

```ts
  {
    name: ':q',
    aliases: [':q!', ':quit', ':quit!', ':wq', ':wq!', ':x'],
    description: { en: 'Escape', fr: 'Sortir' },
    group: 'fun',
    hidden: true,
    run({ effects, raw }) {
      const cmd = raw.trim()
      if (cmd === ':q' || cmd === ':q!' || cmd === ':quit' || cmd === ':quit!') {
        effects.vim(false)
        return [line('you are free. that was the hard part.', 'success')]
      }

      return [
        line("E45: 'readonly' option is set (add ! to override)", 'error'),
        line('hint: try `:q` — there is nothing to save anyway.', 'muted'),
      ]
    },
  },
```

with:

```ts
  {
    name: ':q',
    aliases: [':q!', ':quit', ':quit!', ':wq', ':wq!', ':x'],
    description: { en: 'Escape', fr: 'Sortir' },
    group: 'fun',
    hidden: true,
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
    },
  },
```

- [x] **Step 2: Type-check**

Run: `npm run type-check` (from `frontend/`)
Expected: no errors.

- [x] **Step 3: Full manual verification in the browser**

This is the first point the complete feature (navigation + editing + dirty-aware quitting) is observable end to end. Work through every item:

- `vim about.txt`, move around with `hjkl`/arrows, confirm clamping at all four edges (first/last line, first/last column).
- Press `A`, type text → status line shows ` [+]`.
- Press `:q` (no bang) → `E37: No write since last change (add ! to override)`, pane stays open.
- Press `:q!` → force-closes, pane gone.
- Re-open with `vim about.txt` → content is back to the original (the earlier edit did not persist).
- Repeat: make a dirty edit, then type `:wq` → `E45: readonly...` message, pane stays open (still can't write, regardless of dirty state).
- Make a dirty edit, then type `:q!` → force-closes successfully.
- On a clean (unedited) buffer, type `:q` (no bang) → closes immediately with the success message (no E37 — only dirty buffers require the bang).
- Press `o`, type a line, confirm a real new line was inserted (not just visually — reopen the file after quitting to confirm the original still has the original line count).
- Confirm `x` deletes the character under the cursor and marks the buffer dirty.
- Confirm Ctrl+C, Ctrl+L, and Ctrl+A still work normally while the pane is open (regression check spanning both this plan and the modifier-key fix from the prior plan).
- Confirm `Esc` still does not close the terminal overlay while a vim pane is open (existing `trapped` behavior, unchanged by this plan).
- `cat about.txt`, `cat skills.txt`, `cat contact.txt`, `cat .secret`, a guestbook file, `cat nope.txt` — all still print identically to before either vim plan (final full regression check).

- [x] **Step 4: Commit**

```bash
git add frontend/src/terminal/commands/eggs.ts
git commit -m "feat: make :q refuse to quit a dirty vim buffer without a bang"
```

---

## Plan Self-Review

**Spec coverage:**
- `VimBufferState`/`VimCursor`/`VimMode` types + pure key-dispatch logic → Task 1.
- `TerminalEffects.vimIsDirty`, composable wiring, dead-code removal (`vimError`) → Task 2 Steps 1-2.
- Overlay key-routing + title-bar mode indicator fix → Task 2 Step 3.
- Cursor rendering + `[+]` dirty marker in the pane → Task 2 Step 4.
- Full key-mapping table (normal + insert mode) → Task 1 Step 2, exercised by Task 1 Step 4's script and Task 2 Step 6's manual pass.
- `:q` dirty-refusal / `:q!` force-quit / `:wq` always-fails semantics → Task 3.
- Full spec Verification checklist → Task 3 Step 3 (plus partial coverage split sensibly across Task 1's script and Task 2's manual pass, since dirty-quit behavior can't be exercised before Task 3 exists).

**Placeholder scan:** none — every step has complete code, no TBD/TODO.

**Type consistency:** `VimBufferState` (Task 1) used identically in `TerminalEffects.vim`'s construction (Task 2 Step 2), `handleVimKeydown`'s parameter (Task 2 Step 2), and `VimPane`'s prop type (Task 2 Step 4). `effects.vimIsDirty()` (Task 2 Step 2) consumed with the exact same name in Task 3 Step 1. `handleVimKey`'s signature (Task 1) matches its only call site in `handleVimKeydown` (Task 2).
