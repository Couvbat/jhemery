<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { profile } from '@/content'
import { useLocale } from '@/i18n'
import { useTerminal } from '@/composables/useTerminal'
import TerminalOutput from './TerminalOutput.vue'
import VimPane from './VimPane.vue'

const { t, m } = useLocale()
const {
  open,
  maximised,
  busy,
  buffer,
  revision,
  pendingPrompt,
  capturing,
  vimBuffer,
  handleVimKeydown,
  handleCaptureKeydown,
  primeOverlay,
  closeTerminal,
  submit,
  cancel,
  recallHistory,
  completeInput,
} = useTerminal()

/** Shared chrome for the three title-bar dots (they only differ by colour). */
const BUTTON_CLASS =
  'w-3 h-3 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-muted'
const GLYPH_CLASS =
  'text-[8px] leading-none text-black/70 opacity-0 group-hover:opacity-100 transition-opacity'

const input = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const scrollEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
/** Restored when the overlay closes, so keyboard users land back where they started. */
let previouslyFocused: HTMLElement | null = null

const promptLabel = computed(() => {
  if (pendingPrompt.value) return pendingPrompt.value.question
  if (capturing.value) return t(m.terminal.playing)
  return `${profile.handle}:~$`
})

watch(revision, async () => {
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
})

async function handleOpened() {
  previouslyFocused = document.activeElement as HTMLElement | null
  primeOverlay()
  await nextTick()
  inputEl.value?.focus()
}

// This component only mounts because `open` just became true for the first time
// ever (App.vue gates its very existence on that) — a `watch(open, ...)` alone
// would miss that first transition, since it isn't registered until after it
// already happened. `onMounted` handles that one; the watch covers every
// open/close after that, same as before the code-split (the component just
// stays alive from here on, so it's a normal watch from then on).
onMounted(handleOpened)

watch(open, (isOpen) => {
  if (isOpen) {
    void handleOpened()
  } else {
    previouslyFocused?.focus()
    previouslyFocused = null
  }
})

// A command that takes the keyboard re-enables the input it was just disabled in
// (games run with `busy === true`), so make sure focus is still on it — a blurred
// input means the keys land nowhere and the game looks frozen.
watch(capturing, async (active) => {
  if (!active) return
  await nextTick()
  inputEl.value?.focus()
})

async function onSubmit() {
  const value = input.value
  input.value = ''
  await submit(value)
  await nextTick()
  inputEl.value?.focus()
}

function onKeydown(event: KeyboardEvent) {
  // A running command that took the keyboard wins over everything below,
  // including the vim branch — in practice the two never overlap (vim commands
  // return synchronously and hold no capture), but the precedence is written
  // down rather than inferred. Escape is deliberately let through to
  // `onPanelKeydown`, which turns it into an abort while a game is running.
  if (capturing.value && event.key !== 'Escape' && handleCaptureKeydown(event)) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  if (
    vimBuffer.value &&
    input.value === '' &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    event.key !== ':'
  ) {
    if (handleVimKeydown(event)) {
      // Escape leaving insert mode must not also reach onPanelKeydown's Escape
      // handling below (which would additionally submit `:q`) — a key the vim
      // editor consumed is fully consumed, not just its default action.
      event.preventDefault()
      event.stopPropagation()
    }
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

/** The red dot and Escape share one exit path, vim-trap nudge included — a
 *  close button that silently does nothing just reads as broken. */
function requestClose() {
  if (!closeTerminal()) void submit(':q')
}

/** Focus trap: the panel is the only interactive region while open. */
function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (capturing.value) {
      // Quitting a game should not also dismiss the terminal.
      cancel()
      return
    }
    requestClose()
    return
  }

  if (event.key !== 'Tab' || !panelEl.value) return

  const focusable = panelEl.value.querySelectorAll<HTMLElement>(
    'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])',
  )
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return

  // The input handles Tab itself for completion; only the chrome buttons cycle.
  if (document.activeElement === inputEl.value) return

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
    enter-from-class="opacity-0 translate-y-4"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="opacity-0 translate-y-4"
  >
    <div
      v-if="open"
      class="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-2 pb-2 sm:px-4 sm:pb-4"
      @keydown="onPanelKeydown"
    >
      <div
        ref="panelEl"
        role="dialog"
        aria-modal="true"
        :aria-label="t(m.terminal.title)"
        :class="[
          'w-full rounded border border-primary/40 bg-background/95 backdrop-blur overflow-hidden border-glow flex flex-col',
          maximised ? 'max-w-6xl h-[85vh]' : 'max-w-4xl h-[60vh]',
        ]"
      >
        <!-- Title bar -->
        <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border shrink-0">
          <!-- Traffic lights, macOS-style: the dots *are* the controls, and their
               glyphs only show on hover so the idle bar stays quiet. -->
          <div class="group flex items-center gap-2">
            <button
              type="button"
              :class="[BUTTON_CLASS, 'bg-red-500/80 hover:bg-red-500']"
              :aria-label="t(m.terminal.close)"
              :title="t(m.terminal.close)"
              @click="requestClose()"
            >
              <span :class="GLYPH_CLASS" aria-hidden="true">✕</span>
            </button>
            <button
              type="button"
              :class="[BUTTON_CLASS, 'bg-yellow-500/80 hover:bg-yellow-500']"
              :aria-label="t(m.terminal.minimise)"
              :title="t(m.terminal.minimise)"
              @click="maximised = false"
            >
              <span :class="GLYPH_CLASS" aria-hidden="true">−</span>
            </button>
            <button
              type="button"
              :class="[BUTTON_CLASS, 'bg-green-500/80 hover:bg-green-500']"
              :aria-label="t(m.terminal.maximise)"
              :title="t(m.terminal.maximise)"
              @click="maximised = true"
            >
              <span :class="GLYPH_CLASS" aria-hidden="true">+</span>
            </button>
          </div>
          <span class="ml-3 text-xs text-muted-foreground flex-1"
            >{{ profile.handle }}@{{ profile.host }} ~ {{ t(m.terminal.title) }}</span
          >
          <span v-if="vimBuffer?.mode === 'insert'" class="text-xs text-yellow-400">-- INSERT --</span>
        </div>

        <!-- Output -->
        <div
          v-if="!vimBuffer"
          ref="scrollEl"
          class="flex-1 overflow-y-auto p-4 font-mono text-xs sm:text-sm space-y-0.5"
          :aria-live="capturing ? 'off' : 'polite'"
          aria-atomic="false"
          @click="inputEl?.focus()"
        >
          <TerminalOutput v-for="(entry, i) in buffer" :key="i" :line="entry" />
        </div>
        <VimPane v-else :buffer="vimBuffer" />

        <!-- Input -->
        <form
          class="flex items-center gap-2 px-4 py-3 border-t border-border bg-card/50 shrink-0 font-mono text-xs sm:text-sm"
          @submit.prevent="onSubmit"
        >
          <label for="terminal-input" class="sr-only">{{ t(m.terminal.inputLabel) }}</label>
          <span :class="pendingPrompt ? 'text-accent' : 'text-primary'">{{ promptLabel }}</span>
          <input
            id="terminal-input"
            ref="inputEl"
            v-model="input"
            :type="pendingPrompt?.mask ? 'password' : 'text'"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            :disabled="busy && !pendingPrompt && !capturing"
            :readonly="capturing"
            class="flex-1 bg-transparent outline-none text-foreground caret-primary disabled:opacity-50"
            @keydown="onKeydown"
          />
        </form>
      </div>
    </div>
  </Transition>
</template>
