# Vim Pane Terminal Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `vim` terminal easter egg's static "prints a few ~ lines" behavior with a real vim-styled full-pane view inside the terminal overlay, capable of opening the same read-only fake files `cat` already supports.

**Architecture:** A shared `resolveFileLines()` function becomes the single source of truth for "what does file X contain," used by both the existing `cat` command (unchanged colored output) and the new `vim` pane (plain text). Terminal state (`useTerminal.ts`) gains a `vimBuffer` ref that, when non-null, tells `TerminalOverlay.vue` to render a new `VimPane.vue` component instead of the normal scrolling output. Vim's `:` commands continue to be ordinary registered terminal commands, reusing the existing bottom input line — no new input-handling surface except one keydown interception for readonly-blocked insert keys.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Tailwind classes matching the existing terminal component styling. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-vim-pane-design.md` — read it before starting; this plan implements it task-by-task.
- This frontend has **no automated test runner** (no vitest/jest configured — confirmed via `frontend/package.json`). Every task's verification step is `npm run type-check` (runs `vue-tsc --build`, from `frontend/`) plus a manual check in the browser preview, matching this project's documented convention (`docs/features-spec.md`: "vérification par preview navigateur manuelle").
- `cat`'s existing colored output must be **byte-for-byte unchanged** after the refactor in Task 1 — this is a refactor, not a behavior change, for that command.
- File naming/paths, types, and function names below are exact — later tasks depend on the exact names introduced in earlier tasks.
- `frontend/tsconfig.app.json` has `noUncheckedIndexedAccess: true` — array/object index access returns possibly-`undefined` types; already accounted for in the code below (e.g. destructuring `const [file] = args` rather than `args[0]`).

---

### Task 1: Shared file resolver + `cat` refactor

**Files:**
- Create: `frontend/src/terminal/commands/files.ts`
- Modify: `frontend/src/terminal/commands/navigate.ts`

**Interfaces:**
- Produces: `resolveFileLines(file: string, t: <T>(value: Localised<T>) => T): OutputLine[] | undefined` — exported from `frontend/src/terminal/commands/files.ts`. Returns the file's content as `OutputLine[]` (same shape `cat` already prints) or `undefined` if `file` doesn't resolve to anything (checked last against guestbook entries, same fallback order as the current `cat` switch). Task 2's `vim` command (Task 4) will call this too.

- [ ] **Step 1: Create `frontend/src/terminal/commands/files.ts`**

This moves the body of `cat`'s `switch` (currently inline in `navigate.ts`) into one shared function, verbatim in behavior.

```ts
import { profile, socials, skills, availability } from '@/content'
import type { Localised } from '@/content/types'
import { blank, line, wrap } from '../format'
import type { OutputLine } from '../types'
import { SECRET_FILE, secretContents } from './secret'
import { resolveGuestbookFile } from './guestbook-fs'

type TFunction = <T>(value: Localised<T>) => T

/**
 * The fake filesystem shared by `cat` and `vim` — one source of truth for what a
 * given filename contains, so the two commands can never show different content
 * for the same file. Returns `undefined` when the name doesn't resolve to anything.
 */
export function resolveFileLines(file: string, t: TFunction): OutputLine[] | undefined {
  switch (file) {
    case 'about.txt':
    case 'a-propos.txt':
      return [
        ...t(profile.bio).flatMap((paragraph) => [
          ...wrap(paragraph).map((text) => line(text)),
          blank,
        ]),
        line(`🌐 ${t(profile.languages)}`, 'muted'),
      ]

    case 'skills.txt':
    case 'competences.txt':
      return wrap(skills.join('  ·  ')).map((text) => line(text, 'primary'))

    case 'contact.txt':
      return [
        ...socials.map((s) => ({
          text: `${s.label.padEnd(11)}  ${s.handle}`,
          tone: 'accent' as const,
          pre: true,
        })),
        blank,
        line(t(availability), 'muted'),
      ]

    case SECRET_FILE:
      return secretContents(t)

    default: {
      const entry = resolveGuestbookFile(file)
      if (!entry) return undefined
      return [
        line(`${entry.name} — ${new Date(entry.date).toLocaleDateString()}`, 'primary'),
        ...wrap(entry.message).map((text) => line(`  ${text}`)),
      ]
    }
  }
}
```

- [ ] **Step 2: Refactor `cat` in `navigate.ts` to use it**

Replace the full file content of `frontend/src/terminal/commands/navigate.ts` with:

```ts
import { findSection, profile, sections, socials } from '@/content'
import { currentSection } from '@/composables/useActiveSection'
import type { Command } from '../types'
import { line } from '../format'
import { SECRET_FILE } from './secret'
import { resolveFileLines } from './files'

const FILES = ['about.txt', 'skills.txt', 'contact.txt'] as const

export const navigateCommands: Command[] = [
  {
    name: 'ls',
    usage: 'ls [-a]',
    description: { en: 'List sections and files', fr: 'Lister sections et fichiers' },
    group: 'navigate',
    run({ args, t }) {
      const showHidden = args.some((a) => a === '-a' || a === '-la' || a === '-al')

      const dirs = sections.map((s) => ({
        text: `${t(s.label)}/`.padEnd(14),
        tone: 'primary' as const,
        pre: true,
      }))
      const files = FILES.map((f) => ({ text: f, tone: 'default' as const, pre: true }))
      const hidden = showHidden
        ? [{ text: SECRET_FILE, tone: 'muted' as const, pre: true }]
        : []

      return [...dirs, ...files, ...hidden]
    },
  },
  {
    name: 'cd',
    usage: 'cd <section>',
    description: { en: 'Jump to a section', fr: 'Aller à une section' },
    group: 'navigate',
    run({ args, navigate, t }) {
      const [target] = args
      if (!target || target === '~' || target === '/') {
        navigate('about')
        return
      }

      const section = findSection(target)
      if (!section) {
        return [line(`cd: ${target}: No such file or directory`, 'error')]
      }
      navigate(section.id)
      return [line(`~/${t(section.label)}`, 'muted')]
    },
  },
  {
    name: 'pwd',
    description: { en: 'Print the current section', fr: 'Afficher la section courante' },
    group: 'navigate',
    run() {
      return [line(`/home/${profile.handle}/${currentSection()}`, 'muted')]
    },
  },
  {
    name: 'cat',
    usage: 'cat <file>',
    description: { en: 'Print a file', fr: 'Afficher un fichier' },
    group: 'navigate',
    run({ args, t }) {
      const [file] = args
      if (!file) return [line('cat: missing operand', 'error')]

      return resolveFileLines(file, t) ?? [line(`cat: ${file}: No such file or directory`, 'error')]
    },
  },
  {
    name: 'open',
    usage: 'open <github|linkedin|soundcloud|steam|email>',
    description: { en: 'Open an external link', fr: 'Ouvrir un lien externe' },
    group: 'navigate',
    run({ args }) {
      const [target] = args
      const targets: Record<string, string> = {
        ...Object.fromEntries(socials.map((s) => [s.keyword, s.href])),
        steam: 'https://steamcommunity.com/id/couvbat',
        cv: `https://${profile.domain}/resume.txt`,
        resume: `https://${profile.domain}/resume.txt`,
      }

      if (!target) {
        return [
          line('open: missing target', 'error'),
          line(`available: ${Object.keys(targets).join(', ')}`, 'muted'),
        ]
      }

      const href = targets[target.toLowerCase()]
      if (!href) return [line(`open: unknown target \`${target}\``, 'error')]

      window.open(href, '_blank', 'noopener,noreferrer')
      return [line(`opening ${href}`, 'success')]
    },
  },
]
```

(Removed imports vs. the original: `skills`, `availability` from `@/content`; `secretContents` from `./secret`; the whole `./guestbook-fs` import — all now only used inside `files.ts`. Added: `resolveFileLines` from `./files`.)

- [ ] **Step 3: Type-check**

Run: `npm run type-check` (from `frontend/`)
Expected: no errors.

- [ ] **Step 4: Manual regression check in the browser**

With the frontend dev server running, open the terminal (desktop viewport, `Ctrl+K` or the launcher) and run each of:
- `cat about.txt` — bio text + 🌐 language line, same as before.
- `cat skills.txt` — skill list in primary color.
- `cat contact.txt` — social rows + availability line.
- `ls -a` then `cat .secret` — the hidden-file easter egg text.
- `guestbook` then `cat <one of the listed .txt filenames>` — that entry's name/date/message.
- `cat nope.txt` — `cat: nope.txt: No such file or directory`.

All six must look identical (text, color, wrapping) to how they looked before this change.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/terminal/commands/files.ts frontend/src/terminal/commands/navigate.ts
git commit -m "refactor: extract shared fake-filesystem resolver from cat"
```

---

### Task 2: `VimFile` type + terminal state plumbing

**Files:**
- Modify: `frontend/src/terminal/types.ts`
- Modify: `frontend/src/composables/useTerminal.ts`

**Interfaces:**
- Consumes: nothing new from Task 1.
- Produces:
  - `VimFile` interface (`{ name: string; lines: string[] }`), exported from `frontend/src/terminal/types.ts`.
  - `TerminalEffects.vim` new signature: `(enabled: boolean, file?: VimFile) => void`.
  - From `useTerminal()`: `vimBuffer: ComputedRef<VimFile | null>`, `vimError: ComputedRef<string | null>`, `triggerVimReadonlyError: () => void`. Task 3 (component) and Task 4 (wiring + commands) depend on these exact names.

- [ ] **Step 1: Add `VimFile` and update `TerminalEffects` in `types.ts`**

In `frontend/src/terminal/types.ts`, add the `VimFile` interface directly above `TerminalEffects`, and change the `vim` field:

```ts
export interface VimFile {
  name: string
  lines: string[]
}

export interface TerminalEffects {
  matrix: () => void
  crt: (enabled?: boolean) => boolean
  vim: (enabled: boolean, file?: VimFile) => void
  glitch: (durationMs: number) => Promise<void>
  playMusic: () => void
}
```

(This replaces the existing `vim: (enabled: boolean) => void` line inside `TerminalEffects` — everything else in the file is unchanged.)

- [ ] **Step 2: Add state + update the `vim` effect in `useTerminal.ts`**

In `frontend/src/composables/useTerminal.ts`:

1. Update the type-only import (currently `import type { CommandContext, OutputLine, TerminalEffects } from '@/terminal/types'`) to also bring in `VimFile`:

```ts
import type { CommandContext, OutputLine, TerminalEffects, VimFile } from '@/terminal/types'
```

2. Directly below the existing `const trapped = ref(false)` line, add:

```ts
/** Non-null while the vim pane is showing in place of the normal scrolling output. */
const vimBuffer = ref<VimFile | null>(null)
/** Transient readonly-error message shown in the vim pane's status line. */
const vimError = ref<string | null>(null)
let vimErrorTimeoutId: number | null = null
```

3. Replace the `vim` field inside the `effects` object:

```ts
  vim: (enabled: boolean, file?: VimFile) => {
    trapped.value = enabled
    vimBuffer.value = enabled ? (file ?? null) : null
  },
```

4. Directly below the `effects` object's closing `}`, add:

```ts
/** Flashes the vim pane's readonly error, auto-clearing after 2s. Called directly
 *  from TerminalOverlay's keydown handler, not through a Command — it's a UI
 *  reaction to a blocked keystroke, not something the visitor typed and submitted. */
export function triggerVimReadonlyError() {
  vimError.value = "E45: 'readonly' option is set (add ! to override)"
  if (vimErrorTimeoutId !== null) window.clearTimeout(vimErrorTimeoutId)
  vimErrorTimeoutId = window.setTimeout(() => {
    vimError.value = null
    vimErrorTimeoutId = null
  }, 2000)
}
```

5. In the `useTerminal()` return object, add three entries (next to the existing `trapped: computed(() => trapped.value),` line):

```ts
    vimBuffer: computed(() => vimBuffer.value),
    vimError: computed(() => vimError.value),
    triggerVimReadonlyError,
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check` (from `frontend/`)
Expected: no errors.

- [ ] **Step 4: Manual regression check — old vim joke still works**

`eggs.ts` hasn't changed yet, so `effects.vim(true)` is still called with no second argument (`file` stays `undefined`, so `vimBuffer.value` stays `null`). In the browser terminal:
- Run `vim` — same `~`-prefixed static lines print as before (nothing about this task's changes affects the printed content).
- Run `:q!` — same "you are free. that was the hard part." message as before.

If either looks different, something in this task leaked into visible behavior — stop and check before moving on, since this task is supposed to be a no-visible-change addition.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/terminal/types.ts frontend/src/composables/useTerminal.ts
git commit -m "feat: add vim pane state to terminal composable"
```

---

### Task 3: `VimPane.vue` component

**Files:**
- Create: `frontend/src/components/terminal/VimPane.vue`

**Interfaces:**
- Consumes: `VimFile` type from `frontend/src/terminal/types.ts` (Task 2).
- Produces: `VimPane` component with props `{ file: VimFile; error: string | null }`. Task 4 mounts it.

This component isn't mounted anywhere yet (that's Task 4), so it can't be manually exercised in the running app this task — verification here is limited to type-checking. Task 4's manual pass is where this component's actual behavior gets exercised end-to-end.

- [ ] **Step 1: Create `frontend/src/components/terminal/VimPane.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { VimFile } from '@/terminal/types'

const props = defineProps<{ file: VimFile; error: string | null }>()

/** Fixed, generous count — the container clips whatever doesn't fit, so this
 *  works at both the normal (60vh) and maximised (85vh) overlay heights without
 *  measuring pixel heights. */
const TILDE_COUNT = 60
const tildeRows = Array.from({ length: TILDE_COUNT })

const statusText = computed(() => {
  const byteCount = props.file.lines.join('\n').length
  return `"${props.file.name}" [readonly] ${props.file.lines.length}L, ${byteCount}B`
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
        v-for="(text, i) in file.lines"
        :key="`line-${i}`"
        class="text-foreground whitespace-pre-wrap break-words"
      >{{ text || ' ' }}</p>
      <p v-for="(_, i) in tildeRows" :key="`tilde-${i}`" class="text-muted-foreground">~</p>
    </div>
    <p
      :class="[
        'px-4 py-1 border-t border-border shrink-0 truncate',
        error ? 'text-destructive bg-destructive/10' : 'text-muted-foreground bg-muted',
      ]"
    >{{ error ?? statusText }}</p>
  </div>
</template>
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check` (from `frontend/`)
Expected: no errors. This confirms the component's props/types are internally consistent, even though it isn't mounted yet.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/terminal/VimPane.vue
git commit -m "feat: add VimPane component"
```

---

### Task 4: Wire the pane in, rewrite `vim`/`:q` commands, full verification

**Files:**
- Modify: `frontend/src/components/terminal/TerminalOverlay.vue`
- Modify: `frontend/src/terminal/commands/eggs.ts`

**Interfaces:**
- Consumes: `resolveFileLines` (Task 1), `VimFile`/`TerminalEffects.vim` (Task 2), `VimPane` (Task 3), `vimBuffer`/`vimError`/`triggerVimReadonlyError` from `useTerminal()` (Task 2).
- Produces: the finished, user-visible feature — nothing further depends on this task.

- [ ] **Step 1: Wire `VimPane` into `TerminalOverlay.vue`**

In `frontend/src/components/terminal/TerminalOverlay.vue`:

1. Add the import, next to the existing `import TerminalOutput from './TerminalOutput.vue'`:

```ts
import VimPane from './VimPane.vue'
```

2. In the `useTerminal()` destructure (currently `open, maximised, busy, trapped, buffer, revision, pendingPrompt, closeTerminal, submit, cancel, recallHistory, completeInput`), add three names:

```ts
const {
  open,
  maximised,
  busy,
  trapped,
  buffer,
  revision,
  pendingPrompt,
  vimBuffer,
  vimError,
  triggerVimReadonlyError,
  closeTerminal,
  submit,
  cancel,
  recallHistory,
  completeInput,
} = useTerminal()
```

3. Replace the `onKeydown` function with:

```ts
const INSERT_KEYS = new Set(['i', 'I', 'a', 'A', 'o', 'O', 's', 'S', 'c', 'C', 'r', 'R'])

function onKeydown(event: KeyboardEvent) {
  if (vimBuffer.value && input.value === '' && INSERT_KEYS.has(event.key)) {
    event.preventDefault()
    triggerVimReadonlyError()
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    input.value = recallHistory(-1, input.value)
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    input.value = recallHistory(1, input.value)
  } else if (event.key === 'Tab') {
    event.preventDefault()
    input.value = completeInput(input.value)
  } else if (event.key === 'l' && event.ctrlKey) {
    event.preventDefault()
    useTerminal().clearBuffer()
  } else if (event.key === 'c' && event.ctrlKey) {
    event.preventDefault()
    input.value = ''
    cancel()
  }
}
```

4. In the template, replace the `<!-- Output -->` block:

```html
        <!-- Output -->
        <div
          ref="scrollEl"
          class="flex-1 overflow-y-auto p-4 font-mono text-xs sm:text-sm space-y-0.5"
          aria-live="polite"
          aria-atomic="false"
          @click="inputEl?.focus()"
        >
          <TerminalOutput v-for="(entry, i) in buffer" :key="i" :line="entry" />
        </div>
```

with:

```html
        <!-- Output -->
        <div
          v-if="!vimBuffer"
          ref="scrollEl"
          class="flex-1 overflow-y-auto p-4 font-mono text-xs sm:text-sm space-y-0.5"
          aria-live="polite"
          aria-atomic="false"
          @click="inputEl?.focus()"
        >
          <TerminalOutput v-for="(entry, i) in buffer" :key="i" :line="entry" />
        </div>
        <VimPane v-else :file="vimBuffer" :error="vimError" />
```

- [ ] **Step 2: Rewrite the `vim` and `:q` commands in `eggs.ts`**

In `frontend/src/terminal/commands/eggs.ts`:

1. Add the import, next to the existing `import { forgetGuestbookFile, resolveGuestbookFile } from './guestbook-fs'`:

```ts
import { resolveFileLines } from './files'
```

2. Add this constant near the top of the file, alongside `FORTUNES` and `RM_STAGES`:

```ts
const VIM_SPLASH: string[] = [
  '',
  '',
  '',
  '',
  'VIM - Vi IMproved',
  '',
  'type :q to exit',
  '',
  "(Esc still won't save you)",
]
```

3. Replace the whole `vim` command object:

```ts
  {
    name: 'vim',
    aliases: ['vi', 'nvim', 'emacs'],
    description: { en: 'Open the editor', fr: "Ouvrir l'éditeur" },
    group: 'fun',
    hidden: true,
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
  },
```

4. Replace the whole `:q` command object:

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

(Note: the `:q` command's original `aliases` array was `[':q!', ':wq', ':x', ':quit']` — this replaces it with `[':q!', ':quit', ':quit!', ':wq', ':wq!', ':x']`, adding `:quit!` and `:wq!` so both bang and no-bang variants of every alias resolve.)

- [ ] **Step 3: Type-check**

Run: `npm run type-check` (from `frontend/`)
Expected: no errors.

- [ ] **Step 4: Full manual verification in the browser**

With the dev server running, open the terminal and work through every item below:

- `vim` (no args) → pane opens filling the output area; splash text (`VIM - Vi IMproved`, `type :q to exit`, `(Esc still won't save you)`) appears a few lines down, tildes fill the rest, status line reads `"[No Name]" [readonly] 9L, <N>B`.
- `vim about.txt` → pane shows the same bio text `cat about.txt` prints (plain, no color), status line reads `"about.txt" [readonly] <N>L, <N>B`.
- `vim nope.txt` → pane does **not** open; `vim: nope.txt: No such file or directory` appears in the normal scrolling buffer instead.
- While a pane is open, press `i` with the input box empty → nothing is typed, status line flashes `E45: 'readonly' option is set (add ! to override)`, reverts to the filename status after ~2s.
- While a pane is open, type `:q!` and press Enter → pane closes, `you are free. that was the hard part.` prints to the normal buffer.
- Re-open with `vim`, type `:wq` and press Enter → pane **stays open**, `E45: 'readonly' option is set (add ! to override)` + hint print to the normal buffer (note: since the pane is still showing, these lines print to a buffer that isn't visible until you `:q`/`:q!` out — that's expected, matches the spec).
- Re-open with `vim`, type `:q` (no bang) and press Enter → pane closes successfully.
- With a pane open, press `Esc` → overlay does not close (existing `trapped` behavior, unchanged).
- Re-run the Task 1 `cat` checks once more (`cat about.txt`, `cat skills.txt`, `cat contact.txt`, `cat .secret`, a guestbook file, `cat nope.txt`) — still byte-for-byte identical to before this whole plan.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/terminal/TerminalOverlay.vue frontend/src/terminal/commands/eggs.ts
git commit -m "feat: render vim command as a real read-only pane"
```

---

## Plan Self-Review

**Spec coverage:**
- Shared file resolver → Task 1.
- `VimFile` type + `TerminalEffects.vim` signature + `vimBuffer`/`vimError`/`triggerVimReadonlyError` state → Task 2.
- `VimPane.vue` (tildes, status line, error flash) → Task 3.
- Overlay wiring + insert-key interception → Task 4 Step 1.
- `vim`/`:q` command behavior (splash, file open, unknown file, `:q` vs `:wq`/`:x`) → Task 4 Step 2.
- Full spec "Verification" checklist → Task 4 Step 4.

**Placeholder scan:** none — every step has complete code, no TBD/TODO.

**Type consistency:** `VimFile` (Task 2) used identically in `TerminalEffects.vim`, `useTerminal.ts`, `VimPane.vue` props (Task 3), and the `eggs.ts` `ctx.effects.vim(true, { name, lines })` calls (Task 4) — same `{ name: string; lines: string[] }` shape throughout. `resolveFileLines` (Task 1) signature matches its two call sites (`cat` in Task 1, `vim` in Task 4).
