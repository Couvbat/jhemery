<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { sections, views, type Locale } from '@/content'
import type { SearchIndex } from '@/content/search'
import { useLocale } from '@/i18n'
import { openTerminal, openTerminalFromLink } from '@/composables/useTerminalShell'
import { paletteOpen } from '@/composables/usePalette'
import { DESKTOP_QUERY } from '@/composables/useRunLink'
import { goTo, routeTo } from '@/composables/useViewSwing'
import { loadSearchIndex, rank, resultTarget, searchable, searchIndex, wantsIndex } from '@/lib/search'
import type { LinkTarget } from '@/terminal/links'
import type { Command } from '@/terminal/types'

const { t, m, locale } = useLocale()

const open = paletteOpen
const query = ref('')
const cursor = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

interface Entry {
  id: string
  label: string
  hint: string
  /** A design note's language: the notes aren't translated, so a result can be in the other one. */
  lang?: Locale
  run: () => void
}

interface Group {
  id: string
  /** None for the palette's own entries, which come first, as they always have. */
  label?: string
  entries: Entry[]
  /** Where the group's first entry sits in the flat list the cursor walks. */
  start: number
}

/**
 * Whether there is a terminal to run things in: the launcher's breakpoint (§9). Read
 * when the palette opens, which below it is only from the navbar menu's *search*.
 */
const wide = ref(true)

function isWide(): boolean {
  return typeof window.matchMedia !== 'function' || window.matchMedia(DESKTOP_QUERY).matches
}

// The full command registry (every command, the guestbook client, the vim editor...)
// is a separate chunk — fetched only the first time the palette is actually opened,
// so it costs nothing for visitors who never press Ctrl+K. A phone never fetches it:
// each command opens the terminal, which §9 keeps off phones.
const registryCommands = shallowRef<Command[]>([])
let registryRequested = false

function loadRegistryCommands() {
  if (registryRequested) return
  registryRequested = true
  void import('@/terminal/registry').then(({ paletteCommands }) => {
    registryCommands.value = paletteCommands()
  })
}

/**
 * Sections come first — jumping around the page is what most visitors actually want
 * from Ctrl+K — then the other views, then the registry commands, so the palette
 * never needs a list of its own. `goTo` handles being on the wrong page for a section.
 */
const entries = computed<Entry[]>(() => [
  ...sections.map((s) => ({
    id: `go:${s.id}`,
    label: `cd ${t(s.label)}`,
    hint: t(s.heading),
    run: () => goTo(s.id),
  })),
  ...views
    .filter((v) => v.id !== 'home')
    .map((v) => ({
      id: `go:${v.id}`,
      label: `cd ${t(v.label)}`,
      hint: t(v.heading),
      run: () => goTo(v.id),
    })),
  ...(wide.value ? registryCommands.value : []).map((c) => ({
    id: `cmd:${c.name}`,
    label: c.name,
    hint: t(c.description),
    run: () => openTerminal(c.name),
  })),
])

/** Split into words once per change of list or locale, not once per keystroke. */
const pool = computed(() => entries.value.map((e) => searchable(e, { title: e.label, text: e.hint })))

/**
 * `/search.json`: the case studies, the `why` topics, the notes' headings and /now. Not
 * fetched at load, nor for a query too short to search with: the home page is near its
 * byte budget, and most visitors never search.
 */
const index = shallowRef<SearchIndex | null>(null)
const indexState = ref<'idle' | 'loading' | 'failed'>('idle')

watch(query, (value) => {
  if (index.value || indexState.value !== 'idle' || !wantsIndex(value)) return
  indexState.value = 'loading'
  loadSearchIndex().then(
    (loaded) => {
      index.value = loaded
      indexState.value = 'idle'
    },
    () => {
      // Tried again once the palette is reopened, rather than on every keystroke.
      indexState.value = 'failed'
    },
  )
})

/** A result's target, followed the way a link in the terminal's output is (`terminal/links.ts`). */
function follow(target: LinkTarget) {
  if (target.kind === 'route') routeTo(target.path)
  else if (target.kind === 'document') window.location.assign(target.href)
  else if (target.kind === 'external') window.open(target.href, '_blank', 'noopener')
  // Through the `?run=` path, not `openTerminal`: the line comes from a fetched file, so
  // the shell checks it the way it checks a link (`why <topic>` passes).
  else openTerminalFromLink(target.line)
}

const groups = computed<Group[]>(() => {
  const own = query.value.trim() ? rank(pool.value, query.value) : entries.value
  const found = index.value ? searchIndex(index.value, query.value, locale.value) : []
  const list: Group[] = [{ id: 'own', entries: own, start: 0 }]
  let start = own.length
  for (const group of found) {
    list.push({
      id: group.kind,
      label: t(m.search[group.kind]),
      start,
      entries: group.results.map((result) => ({
        id: `${group.kind}:${result.entry.target}`,
        label: result.label,
        hint: result.hint,
        lang: result.lang,
        run: () => follow(resultTarget(result.entry, wide.value)),
      })),
    })
    start += group.results.length
  }
  return list
})

const filtered = computed(() => groups.value.flatMap((group) => group.entries))

/**
 * The list is capped at `max-h-72`, so arrow-key navigation has to drag the
 * viewport along with it. Rect maths rather than `offsetTop` (the list is not
 * the offset parent) and rather than `scrollIntoView` (which would also scroll
 * the page behind the overlay).
 */
function scrollCursorIntoView() {
  const list = listEl.value
  const item = list?.querySelector<HTMLElement>(`#palette-option-${cursor.value}`)
  if (!list || !item) return
  const listBox = list.getBoundingClientRect()
  const itemBox = item.getBoundingClientRect()
  if (itemBox.top < listBox.top) list.scrollTop -= listBox.top - itemBox.top
  else if (itemBox.bottom > listBox.bottom) list.scrollTop += itemBox.bottom - listBox.bottom
}

watch(cursor, () => scrollCursorIntoView())

watch(filtered, async () => {
  cursor.value = 0
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = 0
})

const activeDescendant = computed(() =>
  filtered.value[cursor.value] ? `palette-option-${cursor.value}` : undefined,
)

/** Nothing matched yet: say whether the index is still on its way, or never came. */
const emptyMessage = computed(() => {
  if (wantsIndex(query.value) && indexState.value === 'loading') return t(m.search.loading)
  if (wantsIndex(query.value) && indexState.value === 'failed') return t(m.search.failed)
  return t(m.palette.empty)
})

/** Ctrl+K and the navbar menu both just set `paletteOpen`; this is the rest of opening. */
watch(open, async (isOpen) => {
  if (!isOpen) return
  previouslyFocused = document.activeElement as HTMLElement | null
  query.value = ''
  cursor.value = 0
  wide.value = isWide()
  if (wide.value) loadRegistryCommands()
  if (indexState.value === 'failed') indexState.value = 'idle'
  await nextTick()
  inputEl.value?.focus()
})

function hide() {
  open.value = false
  previouslyFocused?.focus()
  previouslyFocused = null
}

/**
 * Scrolling moves rows under a stationary pointer, and browsers report that as
 * a `mousemove` — without this the mouse would yank the selection straight back
 * off whatever the arrow keys just moved to.
 */
let pointer: { x: number; y: number } | null = null

function onItemMousemove(event: MouseEvent, index: number) {
  if (pointer && pointer.x === event.clientX && pointer.y === event.clientY) return
  pointer = { x: event.clientX, y: event.clientY }
  cursor.value = index
}

function choose(entry: Entry | undefined) {
  if (!entry) return
  hide()
  entry.run()
}

function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (open.value) hide()
    else open.value = true
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    hide()
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    cursor.value = (cursor.value + 1) % Math.max(filtered.value.length, 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    cursor.value =
      (cursor.value - 1 + Math.max(filtered.value.length, 1)) % Math.max(filtered.value.length, 1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    choose(filtered.value[cursor.value])
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onUnmounted(() => window.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <Transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition duration-100 ease-in"
    leave-to-class="opacity-0"
  >
    <!-- Nearer the top on a phone, where the keyboard takes the bottom half. -->
    <div
      v-if="open"
      class="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-4 md:pt-[15vh] bg-background/70 backdrop-blur-sm"
      @click.self="hide"
    >
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="t(m.palette.open)"
        class="w-full max-w-lg rounded border border-primary/40 bg-card overflow-hidden border-glow"
      >
        <!-- 16px below `md`: iOS zooms the page into any input whose text is smaller. -->
        <div class="flex items-center gap-2 px-4 py-3 border-b border-border font-mono text-base md:text-sm">
          <span class="text-primary">&gt;</span>
          <label for="palette-input" class="sr-only">{{ t(m.palette.open) }}</label>
          <input
            id="palette-input"
            ref="inputEl"
            v-model="query"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            :aria-activedescendant="activeDescendant"
            autocomplete="off"
            autocapitalize="off"
            enterkeyhint="go"
            spellcheck="false"
            :placeholder="t(m.palette.placeholder)"
            class="flex-1 min-w-0 bg-transparent outline-none text-foreground placeholder:text-muted-foreground caret-primary"
            @keydown="onKeydown"
          />
        </div>

        <!-- Grouped as the APG's grouped listbox: a group per kind of result, its
             heading a presentational row. The palette's own entries are the unnamed
             first group, so they read as before. -->
        <div
          id="palette-list"
          ref="listEl"
          role="listbox"
          :aria-label="t(m.palette.open)"
          class="max-h-72 overflow-y-auto py-1 font-mono text-sm"
        >
          <template v-for="group in groups" :key="group.id">
            <ul
              v-if="group.entries.length"
              :role="group.label ? 'group' : 'presentation'"
              :aria-labelledby="group.label ? `palette-group-${group.id}` : undefined"
            >
              <li
                v-if="group.label"
                :id="`palette-group-${group.id}`"
                role="presentation"
                class="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                {{ group.label }}
              </li>
              <li
                v-for="(entry, j) in group.entries"
                :id="`palette-option-${group.start + j}`"
                :key="entry.id"
                role="option"
                :aria-selected="group.start + j === cursor"
                :class="[
                  'flex px-4 py-2 cursor-pointer transition-colors',
                  // A result's title is what it is, and its hint a sentence, so each gets
                  // a line: side by side, the hint squeezed the title down to an ellipsis.
                  group.label ? 'flex-col gap-0.5' : 'items-center gap-3',
                  group.start + j === cursor ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-muted',
                ]"
                @click="choose(entry)"
                @mousemove="onItemMousemove($event, group.start + j)"
              >
                <span class="flex items-center gap-2 min-w-0">
                  <span class="truncate" :lang="entry.lang">{{ entry.label }}</span>
                  <span
                    v-if="entry.lang && entry.lang !== locale"
                    class="shrink-0 px-1 rounded border border-border text-[10px] uppercase text-muted-foreground"
                  >
                    <span aria-hidden="true">{{ entry.lang }}</span>
                    <span class="sr-only">({{ t(entry.lang === 'fr' ? m.search.inFrench : m.search.inEnglish) }})</span>
                  </span>
                </span>
                <span
                  :class="['text-xs text-muted-foreground truncate', group.label ? 'max-w-full' : 'ml-auto']"
                  :lang="entry.lang"
                >
                  {{ entry.hint }}
                </span>
              </li>
            </ul>
          </template>
          <p v-if="!filtered.length" class="px-4 py-3 text-muted-foreground">
            {{ emptyMessage }}
          </p>
        </div>

        <!-- Keys a phone doesn't have. -->
        <div class="hidden md:block px-4 py-2 border-t border-border text-[10px] font-mono text-muted-foreground">
          {{ t(m.palette.hint) }}
        </div>
      </div>
    </div>
  </Transition>
</template>
