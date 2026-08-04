<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { sections } from '@/content'
import { useLocale } from '@/i18n'
import { openTerminal } from '@/composables/useTerminalShell'
import { scrollToSection } from '@/composables/useActiveSection'
import type { Command } from '@/terminal/types'

const { t, m } = useLocale()

const open = ref(false)
const query = ref('')
const cursor = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLUListElement | null>(null)
let previouslyFocused: HTMLElement | null = null

interface Entry {
  id: string
  label: string
  hint: string
  run: () => void
}

// The full command registry (every command, the guestbook client, the vim
// editor...) is a separate chunk — fetched only the first time the palette is
// actually opened, so it costs nothing for visitors who never press Ctrl+K.
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
 * from Ctrl+K. Registry commands follow, so the palette never needs its own list.
 */
const entries = computed<Entry[]>(() => [
  ...sections.map((s) => ({
    id: `go:${s.id}`,
    label: `cd ${t(s.label)}`,
    hint: t(s.heading),
    run: () => scrollToSection(s.id),
  })),
  ...registryCommands.value.map((c) => ({
    id: `cmd:${c.name}`,
    label: c.name,
    hint: t(c.description),
    run: () => openTerminal(c.name),
  })),
])

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return entries.value
  return entries.value.filter(
    (e) => e.label.toLowerCase().includes(needle) || e.hint.toLowerCase().includes(needle),
  )
})

/**
 * The list is capped at `max-h-72`, so arrow-key navigation has to drag the
 * viewport along with it. Rect maths rather than `offsetTop` (the `<ul>` is not
 * the offset parent) and rather than `scrollIntoView` (which would also scroll
 * the page behind the overlay).
 */
function scrollCursorIntoView() {
  const list = listEl.value
  const item = list?.children[cursor.value] as HTMLElement | undefined
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

const activeDescendant = computed(() => {
  const entry = filtered.value[cursor.value]
  return entry ? `palette-${entry.id}` : undefined
})

async function show() {
  previouslyFocused = document.activeElement as HTMLElement | null
  open.value = true
  query.value = ''
  cursor.value = 0
  loadRegistryCommands()
  await nextTick()
  inputEl.value?.focus()
}

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
    else void show()
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
    <div
      v-if="open"
      class="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[15vh] bg-background/70 backdrop-blur-sm"
      @click.self="hide"
    >
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="t(m.palette.open)"
        class="w-full max-w-lg rounded border border-primary/40 bg-card overflow-hidden border-glow"
      >
        <div class="flex items-center gap-2 px-4 py-3 border-b border-border font-mono text-sm">
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
            spellcheck="false"
            :placeholder="t(m.palette.placeholder)"
            class="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground caret-primary"
            @keydown="onKeydown"
          />
        </div>

        <ul
          id="palette-list"
          ref="listEl"
          role="listbox"
          :aria-label="t(m.palette.open)"
          class="max-h-72 overflow-y-auto py-1 font-mono text-sm"
        >
          <li
            v-for="(entry, i) in filtered"
            :id="`palette-${entry.id}`"
            :key="entry.id"
            role="option"
            :aria-selected="i === cursor"
            :class="[
              'flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors',
              i === cursor ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-muted',
            ]"
            @click="choose(entry)"
            @mousemove="onItemMousemove($event, i)"
          >
            <span class="truncate">{{ entry.label }}</span>
            <span class="ml-auto text-xs text-muted-foreground truncate">{{ entry.hint }}</span>
          </li>
          <li v-if="!filtered.length" class="px-4 py-3 text-muted-foreground">
            {{ t(m.palette.empty) }}
          </li>
        </ul>

        <div class="px-4 py-2 border-t border-border text-[10px] font-mono text-muted-foreground">
          {{ t(m.palette.hint) }}
        </div>
      </div>
    </div>
  </Transition>
</template>
