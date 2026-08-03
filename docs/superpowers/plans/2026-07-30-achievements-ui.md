# Achievements Modal, Nav Button & Toast Implementation Plan

**Status: complete.** Shipped in PR #13 (`6f8b707`). All 18 achievements carry a `hint`, and the
modal, nav button and toast are live. Kept as a record of the reasoning, not as an open work item.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the existing terminal achievement tracker (`frontend/src/terminal/achievements.ts`) a hint for every locked entry, and a UI surface outside the terminal — a nav button, a modal, and a floating toast on unlock — so a visitor doesn't need to know the `achievements` terminal command exists.

**Architecture:** `achievements.ts` gains a `hint` field on `Achievement`, an exported reactive `unlocked` ref (Vue components read live state the same way `history.ts` already exposes `history`), and a `toastQueue` ref that `unlock()` pushes to on every new unlock — centralized there so it covers every call site, including the Konami handler in `App.vue` that currently renders nothing. `AchievementsModal.vue` (new) is a hand-rolled dialog matching `TerminalOverlay.vue`'s existing focus-trap pattern, opened from a new button in `NavBar.vue`. `AchievementToast.vue` (new) is mounted once in `App.vue` and drains `toastQueue` one entry at a time.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-30-achievements-design.md` — read it before starting.
- This is a UI layer on top of an already-implemented, already-shipped tracker. Do not re-implement `unlock`/`isUnlocked`/`visitSection`/`announce`/`toast` or touch any of their existing call sites in `eggs.ts`, `navigate.ts`, `core.ts`, or `live.ts` — none of that changes.
- This frontend has **no automated test runner**. Verification is `npm run type-check` (from `frontend/`) plus manual browser checks — **except** for the pure logic added to `achievements.ts` in Task 1, which has zero Vue-component/DOM dependencies and gets a real, deterministic, throwaway Node script instead (this project's own established exception, see `docs/superpowers/plans/2026-07-29-vim-pane-editing.md`).
- File naming/paths, types, and function/export names below are exact — later tasks depend on the exact names introduced in earlier tasks.
- All 18 existing achievement ids, in `achievementList` order: `secret`, `explorer`, `sign`, `mail`, `lang`, `sudo`, `vim`, `matrix`, `hack`, `cowsay`, `fortune`, `sl`, `coffee`, `rickroll`, `crt`, `htop`, `konami`, `completionist`. Do not add, remove, or reorder entries — only add the `hint` field to each.

---

### Task 1: `hint` field, reactive `unlocked` export, and `toastQueue`

**Files:**
- Modify: `frontend/src/terminal/achievements.ts`

**Interfaces:**
- Produces: `Achievement.hint: Localised<string>` (new field). `export const unlocked: Ref<Set<string>>` (was module-private). `export const toastQueue: Ref<{ id: string; title: Localised<string> }[]>`. `export function dismissToast(id: string): void`. `unlock()`'s existing signature (`(id: string) => string[]`) and behavior are unchanged except it now also appends to `toastQueue`.
- Consumes: nothing new — this task only touches `achievements.ts` itself.
- Task 2 consumes `Achievement.hint`. Tasks 4/5/6 consume `unlocked`, `toastQueue`, `dismissToast`.

- [x] **Step 1: Add `hint` to the `Achievement` interface and every entry**

In `frontend/src/terminal/achievements.ts`, change the interface:

```ts
export interface Achievement {
  id: string
  title: Localised<string>
  hint: Localised<string>
  description: Localised<string>
}
```

Then add a `hint` field to each of the 18 entries in `achievementList`, in place, right after each entry's `title`. The full updated array:

```ts
export const achievementList: Achievement[] = [
  {
    id: 'secret',
    title: { en: 'Read the Manual', fr: 'A lu le manuel' },
    hint: {
      en: 'Not everything shows up in a normal listing.',
      fr: 'Tout ne s’affiche pas dans une liste normale.',
    },
    description: { en: '`ls -a` then `cat .secret`.', fr: '`ls -a` puis `cat .secret`.' },
  },
  {
    id: 'explorer',
    title: { en: 'Grand Tour', fr: 'Grand tour' },
    hint: {
      en: 'Have you seen everywhere this site has to offer?',
      fr: 'Avez-vous vu tout ce que ce site a à offrir ?',
    },
    description: { en: '`cd` into every section.', fr: '`cd` dans chaque section.' },
  },
  {
    id: 'sign',
    title: { en: 'Kilroy Was Here', fr: 'Kilroy est passé ici' },
    hint: { en: 'Leave your mark somewhere public.', fr: 'Laissez votre marque quelque part de public.' },
    description: { en: 'Signed the guestbook.', fr: 'Signé le livre d’or.' },
  },
  {
    id: 'mail',
    title: { en: "You've Got Mail", fr: 'Vous avez un message' },
    hint: {
      en: 'There’s a way to reach out without leaving the terminal.',
      fr: 'Il y a un moyen de me contacter sans quitter le terminal.',
    },
    description: { en: 'Sent a message with `mail`.', fr: 'Envoyé un message avec `mail`.' },
  },
  {
    id: 'lang',
    title: { en: 'Bilingual', fr: 'Bilingue' },
    hint: { en: 'This site speaks more than one language.', fr: 'Ce site parle plus d’une langue.' },
    description: { en: 'Switched language with `lang`.', fr: 'Changé de langue avec `lang`.' },
  },
  {
    id: 'sudo',
    title: { en: 'Script Kiddie', fr: 'Script kiddie' },
    hint: {
      en: 'Some commands should never be run as root.',
      fr: 'Certaines commandes ne devraient jamais être lancées en root.',
    },
    description: { en: 'Ran `sudo rm -rf /`.', fr: 'Lancé `sudo rm -rf /`.' },
  },
  {
    id: 'vim',
    title: { en: 'Vi Improved', fr: 'Vi amélioré' },
    hint: {
      en: 'Getting in is easy. Getting out is the achievement.',
      fr: 'Entrer est facile. Sortir, c’est l’exploit.',
    },
    description: { en: 'Escaped vim with `:q!`.', fr: 'Échappé de vim avec `:q!`.' },
  },
  {
    id: 'matrix',
    title: { en: 'Red Pill', fr: 'Pilule rouge' },
    hint: { en: 'There’s a red pill somewhere in here.', fr: 'Il y a une pilule rouge quelque part ici.' },
    description: { en: 'Followed the white rabbit.', fr: 'Suivi le lapin blanc.' },
  },
  {
    id: 'hack',
    title: { en: '1337 h4x0r', fr: '1337 h4x0r' },
    hint: { en: 'Some targets are worth an nmap.', fr: 'Certaines cibles méritent un bon nmap.' },
    description: { en: 'Tried to `hack` the mainframe.', fr: 'Tenté de `hack` le mainframe.' },
  },
  {
    id: 'cowsay',
    title: { en: 'Bovine Wisdom', fr: 'Sagesse bovine' },
    hint: { en: 'Ask a cow for its opinion.', fr: 'Demandez son avis à une vache.' },
    description: { en: 'Asked a cow for advice.', fr: 'Demandé conseil à une vache.' },
  },
  {
    id: 'fortune',
    title: { en: 'Fortune Cookie', fr: 'Biscuit chinois' },
    hint: {
      en: 'The terminal has opinions, if you ask nicely.',
      fr: 'Le terminal a des opinions, si on lui demande gentiment.',
    },
    description: { en: 'Requested a `fortune`.', fr: 'Demandé une `fortune`.' },
  },
  {
    id: 'sl',
    title: { en: 'Choo Choo', fr: 'Tchou tchou' },
    hint: {
      en: 'Everyone mistypes `ls` eventually.',
      fr: 'Tout le monde tape `sl` au lieu de `ls` un jour ou l’autre.',
    },
    description: { en: 'Typo\'d `ls` into `sl`.', fr: 'Tapé `sl` au lieu de `ls`.' },
  },
  {
    id: 'coffee',
    title: { en: "I'm a Teapot", fr: 'Je suis une théière' },
    hint: { en: 'Try brewing something.', fr: 'Essayez de préparer quelque chose.' },
    description: { en: 'Tried to `coffee`.', fr: 'Tenté un `coffee`.' },
  },
  {
    id: 'rickroll',
    title: { en: 'Never Gonna', fr: 'Never Gonna' },
    hint: { en: 'Curiosity killed the cat.', fr: 'La curiosité est un vilain défaut.' },
    description: { en: 'Clicked through a `rickroll`.', fr: 'Cliqué sur un `rickroll`.' },
  },
  {
    id: 'crt',
    title: { en: 'CRT Overdrive', fr: 'Surtension CRT' },
    hint: { en: 'This terminal has a retro mode.', fr: 'Ce terminal a un mode rétro.' },
    description: { en: 'Toggled `crt` mode.', fr: 'Activé le mode `crt`.' },
  },
  {
    id: 'htop',
    title: { en: 'Task Manager', fr: 'Gestionnaire de tâches' },
    hint: {
      en: 'Ever wonder what’s running under the hood?',
      fr: 'Vous êtes-vous demandé ce qui tourne sous le capot ?',
    },
    description: { en: 'Watched `htop`.', fr: 'Surveillé `htop`.' },
  },
  {
    id: 'konami',
    title: { en: 'Cheat Code', fr: 'Code de triche' },
    hint: { en: '↑↑↓↓←→←→ rings a bell?', fr: '↑↑↓↓←→←→ ça vous dit quelque chose ?' },
    description: {
      en: 'Entered the Konami code — not even in the terminal.',
      fr: 'Entré le code Konami — même pas dans le terminal.',
    },
  },
  {
    id: COMPLETIONIST,
    title: { en: '100%', fr: '100%' },
    hint: { en: 'For those who leave no stone unturned.', fr: 'Pour ceux qui ne laissent rien au hasard.' },
    description: { en: 'Unlocked everything else.', fr: 'Tout débloqué.' },
  },
]
```

(`COMPLETIONIST` is the existing `const COMPLETIONIST = 'completionist'` already defined above the array — unchanged, just referenced here same as before.)

- [x] **Step 2: Export `unlocked` and add the toast queue**

Change the existing `const unlocked = ref<Set<string>>(loadSet(ACHIEVEMENTS_KEY))` to:

```ts
export const unlocked = ref<Set<string>>(loadSet(ACHIEVEMENTS_KEY))
```

Immediately below the existing `const visitedSections = ref<Set<string>>(loadSet(SECTIONS_KEY))` line, add:

```ts
/** Newly-unlocked achievements waiting to be shown as a floating toast, oldest first. */
export const toastQueue = ref<{ id: string; title: Localised<string> }[]>([])

/** Removes one entry from the toast queue once it's been shown. */
export function dismissToast(id: string) {
  toastQueue.value = toastQueue.value.filter((entry) => entry.id !== id)
}
```

- [x] **Step 3: Push newly-unlocked achievements onto the toast queue**

In `unlock()`, change:

```ts
  unlocked.value = next
  persist(ACHIEVEMENTS_KEY, next)
  return newly
```

to:

```ts
  unlocked.value = next
  persist(ACHIEVEMENTS_KEY, next)
  toastQueue.value = [
    ...toastQueue.value,
    ...newly.map((gained) => ({
      id: gained,
      title: achievementList.find((a) => a.id === gained)!.title,
    })),
  ]
  return newly
```

- [x] **Step 4: Write and run a throwaway verification script**

Create `frontend/tmp-achievements-check.ts` (temporary — deleted in Step 6, never committed):

```ts
import assert from 'node:assert/strict'
import { achievementList, toastQueue, unlock } from './src/terminal/achievements.ts'

// Unknown id is a no-op — no unlock, no toast.
{
  const result = unlock('not-a-real-id')
  assert.deepEqual(result, [], 'unknown id should not unlock anything')
  assert.equal(toastQueue.value.length, 0, 'no toast for an unknown id')
}

// A normal unlock returns just that id and queues one toast.
{
  const result = unlock('coffee')
  assert.deepEqual(result, ['coffee'])
  assert.equal(toastQueue.value.length, 1)
  assert.equal(toastQueue.value[0]!.id, 'coffee')
}

// Unlocking the same id again is a no-op — no duplicate toast.
{
  const result = unlock('coffee')
  assert.deepEqual(result, [])
  assert.equal(toastQueue.value.length, 1, 'still just the one queued toast from before')
}

// Unlocking every other achievement cascades the last one into `completionist`.
{
  const rest = achievementList
    .map((a) => a.id)
    .filter((id) => id !== 'coffee' && id !== 'completionist')
  for (const id of rest.slice(0, -1)) unlock(id)
  const last = rest[rest.length - 1]!
  const result = unlock(last)
  assert.deepEqual(result, [last, 'completionist'], 'the final unlock should cascade into completionist')
  const queuedIds = toastQueue.value.map((entry) => entry.id)
  assert.ok(queuedIds.includes('completionist'), 'completionist toast should be queued')
  assert.ok(queuedIds.includes(last), 'the triggering achievement’s toast should also be queued')
}

// Every achievement has a hint in both locales.
{
  for (const achievement of achievementList) {
    assert.ok(achievement.hint?.en, `${achievement.id} is missing an English hint`)
    assert.ok(achievement.hint?.fr, `${achievement.id} is missing a French hint`)
  }
}

console.log('all achievements checks passed')
```

Run: `node tmp-achievements-check.ts` (from `frontend/`)
Expected output: `all achievements checks passed`, exit code 0. If an assertion fails, Node prints an `AssertionError` with expected/actual values — fix `achievements.ts` (not the script) until all pass.

- [x] **Step 5: Type-check**

Run: `npm run type-check` (from `frontend/`)
Expected: no errors.

- [x] **Step 6: Delete the throwaway script**

```bash
rm frontend/tmp-achievements-check.ts
```

- [x] **Step 7: Commit**

```bash
git add frontend/src/terminal/achievements.ts
git commit -m "feat: add hints, reactive unlock state, and a toast queue to achievements"
```

---

### Task 2: Terminal `achievements` command shows hints for locked entries

**Files:**
- Modify: `frontend/src/terminal/commands/system.ts`

**Interfaces:**
- Consumes: `Achievement.hint` from Task 1.
- Produces: nothing new — this only changes what one existing command prints.

- [x] **Step 1: Render the hint instead of the literal `'locked'`**

In the `achievements` command's `run({ t })`, change:

```ts
            : { text: `  ✗ ${'???'.padEnd(24)}  locked`, tone: 'muted', pre: true },
```

to:

```ts
            : { text: `  ✗ ${'???'.padEnd(24)}  ${t(achievement.hint)}`, tone: 'muted', pre: true },
```

- [x] **Step 2: Type-check**

Run: `npm run type-check` (from `frontend/`)
Expected: no errors.

- [x] **Step 3: Verify in the browser**

Start the dev server preview, open the terminal (backtick or the launcher button), run `achievements`. Confirm:
- Unlocked rows (if any from prior local testing) show a real title + description with `✓`.
- Locked rows show `✗ ???` followed by a hint sentence, not the word `locked`.

Then run `lang fr` and `achievements` again — confirm the hints are now in French. (Running `lang fr` itself unlocks the `lang` achievement, which is expected — that achievement's row should flip from locked to unlocked with a French title/description.)

- [x] **Step 4: Commit**

```bash
git add frontend/src/terminal/commands/system.ts
git commit -m "feat: show real hints for locked achievements in the terminal command"
```

---

### Task 3: `m.achievements` i18n messages

**Files:**
- Modify: `frontend/src/i18n/messages.ts`

**Interfaces:**
- Produces: `messages.achievements.{title, open, close, toastPrefix}`, each `Localised<string>`.
- Consumed by Tasks 4, 5, 6.

- [x] **Step 1: Add the namespace**

In `frontend/src/i18n/messages.ts`, add a new top-level key (anywhere in the object — alongside the existing `footer`/`boot` entries at the end reads naturally):

```ts
  achievements: {
    title: { en: 'Achievements', fr: 'Succès' },
    open: { en: 'View achievements', fr: 'Voir les succès' },
    close: { en: 'Close achievements', fr: 'Fermer les succès' },
    toastPrefix: { en: 'Achievement unlocked:', fr: 'Succès débloqué :' },
  },
```

- [x] **Step 2: Type-check**

Run: `npm run type-check` (from `frontend/`)
Expected: no errors (the `satisfies Record<string, Record<string, Localised>>` at the bottom of the file will catch a malformed entry).

- [x] **Step 3: Commit**

```bash
git add frontend/src/i18n/messages.ts
git commit -m "feat: add i18n messages for the achievements UI"
```

---

### Task 4: `AchievementsModal.vue`

**Files:**
- Create: `frontend/src/components/AchievementsModal.vue`

**Interfaces:**
- Consumes: `achievementList`, `unlocked` from `@/terminal/achievements` (Task 1); `messages` from `@/i18n/messages` (Task 3); `useLocale` from `@/i18n`.
- Produces: a component with a `v-model:open: boolean` prop (via `defineModel`). Task 5 consumes this exact prop name.

- [x] **Step 1: Create the component**

```vue
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useLocale } from '@/i18n'
import { messages } from '@/i18n/messages'
import { achievementList, unlocked } from '@/terminal/achievements'

const { t } = useLocale()

const open = defineModel<boolean>('open', { required: true })

const panelEl = ref<HTMLElement | null>(null)
const closeButtonEl = ref<HTMLButtonElement | null>(null)
let previouslyFocused: HTMLElement | null = null

const count = computed(() => unlocked.value.size)
const total = achievementList.length

function isUnlocked(id: string): boolean {
  return unlocked.value.has(id)
}

function close() {
  open.value = false
}

watch(open, async (isOpen) => {
  if (isOpen) {
    previouslyFocused = document.activeElement as HTMLElement | null
    await nextTick()
    closeButtonEl.value?.focus()
  } else {
    previouslyFocused?.focus()
    previouslyFocused = null
  }
})

/** Focus trap: the panel is the only interactive region while open. */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }

  if (event.key !== 'Tab' || !panelEl.value) return

  const focusable = panelEl.value.querySelectorAll<HTMLElement>(
    'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])',
  )
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      @keydown="onKeydown"
      @click.self="close"
    >
      <div
        ref="panelEl"
        role="dialog"
        aria-modal="true"
        :aria-label="t(messages.achievements.title)"
        class="w-full max-w-lg max-h-[80vh] rounded border border-primary/40 bg-background/95 backdrop-blur overflow-hidden border-glow flex flex-col"
      >
        <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border shrink-0">
          <span class="text-sm text-primary font-mono flex-1">
            🏆 {{ t(messages.achievements.title) }} — {{ count }}/{{ total }}
          </span>
          <button
            ref="closeButtonEl"
            class="text-xs text-muted-foreground hover:text-destructive px-1 transition-colors"
            :aria-label="t(messages.achievements.close)"
            :title="t(messages.achievements.close)"
            @click="close"
          >
            ✕
          </button>
        </div>

        <ul class="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs sm:text-sm">
          <li
            v-for="achievement in achievementList"
            :key="achievement.id"
            class="flex items-start gap-2"
          >
            <span :class="isUnlocked(achievement.id) ? 'text-primary' : 'text-muted-foreground'">
              {{ isUnlocked(achievement.id) ? '✓' : '🔒' }}
            </span>
            <div class="flex-1">
              <p :class="isUnlocked(achievement.id) ? 'text-foreground' : 'text-muted-foreground'">
                {{ isUnlocked(achievement.id) ? t(achievement.title) : '???' }}
              </p>
              <p class="text-muted-foreground">
                {{ isUnlocked(achievement.id) ? t(achievement.description) : t(achievement.hint) }}
              </p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </Transition>
</template>
```

- [x] **Step 2: Type-check**

Run: `npm run type-check` (from `frontend/`)
Expected: no errors. (This component isn't wired to anything yet — Task 5 does that, where it gets its real browser verification.)

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/AchievementsModal.vue
git commit -m "feat: add AchievementsModal component"
```

---

### Task 5: Wire the modal into `NavBar.vue`

**Files:**
- Modify: `frontend/src/components/NavBar.vue`

**Interfaces:**
- Consumes: `AchievementsModal` from Task 4; `m.achievements` from Task 3 (already available via the existing `const { t, m, locale, toggleLocale } = useLocale()` destructure — `m` is `messages`).

- [x] **Step 1: Import the modal and add local state**

At the top of `<script setup>`, add:

```ts
import AchievementsModal from '@/components/AchievementsModal.vue'
```

Below the existing `const menuOpen = ref(false)`, add:

```ts
const achievementsOpen = ref(false)
```

- [x] **Step 2: Add the desktop button**

In the `<ul class="hidden md:flex gap-1 items-center">` list, immediately after the existing language-toggle `<li>`, add:

```html
        <li>
          <button
            @click="achievementsOpen = true"
            :title="t(m.achievements.open)"
            :aria-label="t(m.achievements.open)"
            class="ml-1 px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
          >
            🏆
          </button>
        </li>
```

- [x] **Step 3: Add the mobile button**

In the `<div class="flex items-center gap-2 md:hidden">` block, immediately before the existing language-toggle button, add:

```html
        <button
          @click="achievementsOpen = true"
          :aria-label="t(m.achievements.open)"
          class="px-2 py-1 text-xs rounded border border-border text-muted-foreground"
        >
          🏆
        </button>
```

- [x] **Step 4: Mount the modal**

Immediately before the closing `</header>` tag, add:

```html
    <AchievementsModal v-model:open="achievementsOpen" />
```

- [x] **Step 5: Type-check**

Run: `npm run type-check` (from `frontend/`)
Expected: no errors.

- [x] **Step 6: Verify in the browser (desktop)**

Start the dev server preview at the default desktop viewport. Confirm:
- A `🏆` button appears in the navbar next to the `EN`/`FR` toggle.
- Clicking it opens the modal, listing 18 rows, header reads `🏆 Achievements — {count}/18` with some non-zero count if you ran `achievements`/`cowsay`/etc. earlier in this session, or `0/18` on a fresh profile.
- Pressing `Tab` repeatedly cycles focus only within the modal (starting from the close button) and wraps around; `Shift+Tab` cycles backward.
- Pressing `Escape` closes the modal and returns focus to the `🏆` button.
- Clicking the background overlay (outside the panel) closes it.

- [x] **Step 7: Verify in the browser (mobile)**

Resize the preview to the `mobile` preset. Confirm the `🏆` button is present in the mobile controls row (next to `EN`/`FR` and the hamburger) and opens the same modal.

- [x] **Step 8: Commit**

```bash
git add frontend/src/components/NavBar.vue
git commit -m "feat: add achievements button to the navbar"
```

---

### Task 6: `AchievementToast.vue`

**Files:**
- Create: `frontend/src/components/AchievementToast.vue`

**Interfaces:**
- Consumes: `toastQueue`, `dismissToast` from `@/terminal/achievements` (Task 1); `messages.achievements.toastPrefix` from Task 3; `prefersReducedMotion` from `@/composables/useCrt`.
- Produces: a component with no props — Task 7 mounts it with no bindings.

- [x] **Step 1: Create the component**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useLocale } from '@/i18n'
import { messages } from '@/i18n/messages'
import { prefersReducedMotion } from '@/composables/useCrt'
import { dismissToast, toastQueue } from '@/terminal/achievements'

const { t } = useLocale()

const visibleTitle = ref<string | null>(null)

/** Shows the next queued toast, if one is waiting and nothing is currently shown. */
function scheduleNext() {
  if (visibleTitle.value !== null || toastQueue.value.length === 0) return

  const next = toastQueue.value[0]!
  visibleTitle.value = t(next.title)

  window.setTimeout(
    () => {
      dismissToast(next.id)
      visibleTitle.value = null
      scheduleNext()
    },
    prefersReducedMotion() ? 2000 : 3500,
  )
}

watch(() => toastQueue.value.length, scheduleNext, { immediate: true })
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 -translate-y-2"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="opacity-0 -translate-y-2"
  >
    <div
      v-if="visibleTitle"
      role="status"
      aria-live="polite"
      class="fixed top-16 right-4 z-[70] rounded border border-primary/40 bg-background/95 backdrop-blur px-4 py-2 text-xs sm:text-sm font-mono border-glow"
    >
      <span class="text-primary">🏆 {{ t(messages.achievements.toastPrefix) }}</span>
      <span class="text-foreground ml-1">{{ visibleTitle }}</span>
    </div>
  </Transition>
</template>
```

- [x] **Step 2: Type-check**

Run: `npm run type-check` (from `frontend/`)
Expected: no errors.

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/AchievementToast.vue
git commit -m "feat: add AchievementToast component"
```

---

### Task 7: Mount the toast in `App.vue` and verify end-to-end

**Files:**
- Modify: `frontend/src/App.vue`

**Interfaces:**
- Consumes: `AchievementToast` from Task 6.

- [x] **Step 1: Import and mount**

Add the import alongside the other component imports:

```ts
import AchievementToast from '@/components/AchievementToast.vue'
```

Add `<AchievementToast />` in the template, next to the other always-mounted chrome (e.g. right after `<CommandPalette />`):

```html
  <CommandPalette />
  <AchievementToast />
```

- [x] **Step 2: Type-check**

Run: `npm run type-check` (from `frontend/`)
Expected: no errors.

- [x] **Step 3: Verify in the browser**

Start the dev server preview. If `localStorage` already has achievements unlocked from earlier manual testing in this session, clear it first: open the browser devtools console and run `localStorage.removeItem('couvbat:achievements')`, then reload.

- Open the terminal, run `cowsay hi`. Confirm a toast reading `🏆 Achievement unlocked: Bovine Wisdom` (or `Sagesse bovine` in French) appears top-right, below the navbar, and disappears on its own after a few seconds.
- Run `cowsay hi` again. Confirm no toast appears the second time (already unlocked).
- Open the achievements modal (the navbar button from Task 5) and confirm the `Bovine Wisdom` row now shows as unlocked with its real description, and the header count went up by one.
- Close the terminal, then run the Konami code (↑↑↓↓←→←→ b a) using keyboard input anywhere on the page. Confirm the toast still appears even with the terminal closed — this is the gap this task set out to close.

- [x] **Step 4: Commit**

```bash
git add frontend/src/App.vue
git commit -m "feat: mount the achievement toast globally"
```
