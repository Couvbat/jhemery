<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { profile } from '@/content'
import { useLocale } from '@/i18n'
import { resetRecall, useTerminal } from '@/composables/useTerminal'
import { usePromptSuggestion } from '@/composables/usePromptSuggestion'
import { autosuggest, searchBackward } from '@/terminal/history'
import { suggestionPool } from '@/terminal/registry'
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
  captureTakesEscape,
  vimBuffer,
  handleVimKeydown,
  handleCaptureKeydown,
  primeOverlay,
  closeTerminal,
  submit,
  cancel,
  recallHistory,
  completeInput,
  history,
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

/** A command is in flight and wants nothing from the keyboard but Ctrl+C: no
 *  capture, no prompt. `ping`, `ask`, anything that just awaits. */
const running = computed(() => busy.value && !pendingPrompt.value && !capturing.value)

// `try: neofetch` in the empty input. A placeholder, not a buffer line: it is never
// typed, never submitted and never copied. Off whenever the prompt is doing
// anything else — a question, a game, a running command, the vim pane.
const { suggestion, dismiss } = usePromptSuggestion(
  suggestionPool,
  computed(
    () => input.value === '' && !pendingPrompt.value && !capturing.value && !running.value && !vimBuffer.value,
  ),
)
const placeholder = computed(() =>
  suggestion.value && !search.value ? t(m.terminal.suggestion).replace('{command}', suggestion.value) : '',
)
watch(input, (value) => {
  if (value) dismiss()
})

/** Nothing else wants the keyboard: no game, no question, no command running, no vim. */
const ownsKeyboard = computed(() => !capturing.value && !pendingPrompt.value && !running.value && !vimBuffer.value)

/**
 * Ctrl+R, reverse-i-search: what has been typed into the search, the match it found and
 * where (so another Ctrl+R looks further back), and the line it replaced in the input.
 */
const search = ref<{ query: string; index: number; found: string | null; saved: string } | null>(null)

function findInSearch(query: string, before?: number) {
  const current = search.value!
  const hit = searchBackward(history.value, query, before)
  search.value = { ...current, query, index: hit?.index ?? current.index, found: hit?.entry ?? (before === undefined ? null : current.found) }
  input.value = search.value.found ?? search.value.saved
}

function endSearch(keep: boolean) {
  const current = search.value
  if (!current) return
  search.value = null
  input.value = keep && current.found ? current.found : current.saved
}

/** A modifier pressed on its own: the first half of Ctrl+R, Ctrl+C or a capital, not a key. */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Dead', 'Process'])

/** The keys Ctrl+R's search takes for itself. Returns whether it took this one. */
function searchKeydown(event: KeyboardEvent): boolean {
  if (MODIFIER_KEYS.has(event.key)) return true
  const current = search.value!
  if ((event.key === 'c' || event.key === 'g') && event.ctrlKey) {
    endSearch(false)
  } else if (event.key === 'Enter') {
    endSearch(true)
    void onSubmit()
  } else if (event.key === 'Escape' || event.key === 'ArrowRight' || event.key === 'Tab') {
    // Escape has to stop here, or the panel's own Escape would close the terminal.
    event.stopPropagation()
    endSearch(true)
  } else if (event.key === 'Backspace') {
    findInSearch(current.query.slice(0, -1))
  } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    findInSearch(current.query + event.key)
  } else {
    // Anything else (an arrow, Home) ends the search with the match in hand, then acts.
    endSearch(true)
    return false
  }
  event.preventDefault()
  return true
}

/** Where the caret is and whether the input has scrolled: the ghost only fits at the end of an unscrolled line. */
const caretAtEnd = ref(true)
const inputScrolled = ref(false)
/** Typing starts the next ↑ afresh, from what is now in the input. */
function onTyped() {
  resetRecall()
  measure()
}

function measure() {
  const el = inputEl.value
  if (!el) return
  caretAtEnd.value = el.selectionStart === el.value.length && el.selectionEnd === el.value.length
  inputScrolled.value = el.scrollLeft > 0
}

/** The rest of the newest line in the visitor's own history that starts with what is typed. */
const ghost = computed(() =>
  ownsKeyboard.value && !search.value && caretAtEnd.value && !inputScrolled.value ? autosuggest(input.value, history.value) : '',
)

// A search belongs to the shell's own prompt: a prompt, a game or a command taking the
// keyboard ends it, and so does closing the panel, which leaves this component mounted.
watch(ownsKeyboard, (owns) => {
  if (!owns) endSearch(false)
})

const promptLabel = computed(() => {
  if (search.value) return `(reverse-i-search)'${search.value.query}':`
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
    endSearch(false)
    previouslyFocused?.focus()
    previouslyFocused = null
  }
})

// A game's keys only arrive while the input has focus, and a blurred input makes
// the game look frozen. The input no longer drops focus on its own when a command
// starts (it is never `disabled`, see the template), so this is a safety net for a
// capture that begins with focus somewhere else, not a repair.
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
  if (capturing.value && (event.key !== 'Escape' || captureTakesEscape.value) && handleCaptureKeydown(event)) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  // `readonly` stops typing but not these. Enter would still submit the form, and
  // history and completion write `input` directly. Ctrl+C has to get through, since
  // it is the only thing a running command is waiting on.
  if (running.value && ['Enter', 'Tab', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault()
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

  // Ctrl+R is the browser's reload everywhere else, and Cmd+R stays it here: only taken
  // while the shell itself has the keyboard.
  if (event.key === 'r' && event.ctrlKey && !event.metaKey && !event.altKey && ownsKeyboard.value) {
    event.preventDefault()
    if (!search.value) search.value = { query: '', index: history.value.length, found: null, saved: input.value }
    else if (search.value.query) findInSearch(search.value.query, search.value.index)
    return
  }
  if (search.value && ownsKeyboard.value && searchKeydown(event)) return

  // → or End at the end of the line takes the ghost.
  if ((event.key === 'ArrowRight' || event.key === 'End') && ghost.value) {
    event.preventDefault()
    input.value += ghost.value
    void nextTick(measure)
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
    const el = event.target as HTMLInputElement
    // The caret goes in and comes back out: completing mid-line has to leave the
    // cursor after the word it just filled in, not at the end of the line.
    const completion = completeInput(input.value, el.selectionStart ?? input.value.length)
    input.value = completion.value
    void nextTick(() => el.setSelectionRange(completion.caret, completion.caret))
  } else if (event.key === 'l' && event.ctrlKey) {
    event.preventDefault()
    useTerminal().clearBuffer()
  } else if (event.key === 'c' && event.ctrlKey) {
    event.preventDefault()
    input.value = ''
    resetRecall()
    cancel()
  }
}

/** The red dot and Escape share one exit path, vim-trap nudge included — a
 *  close button that silently does nothing just reads as broken.
 *
 *  It submits `:q!`, not `:q`: a visitor who typed something in insert mode has
 *  a dirty buffer, and plain `:q` refuses that with E37 — leaving the button
 *  doing nothing visible but a status line hidden behind the pane. The trap joke
 *  lives in the *typed* `:q` being refused; the chrome's own close control is
 *  the way out, so it always works. */
function requestClose() {
  if (!closeTerminal()) void submit(':q!')
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
          <span v-if="vimBuffer?.mode === 'insert'" class="text-xs text-warning">-- INSERT --</span>
        </div>

        <!-- Output -->
        <div
          v-if="!vimBuffer"
          ref="scrollEl"
          data-testid="terminal-output"
          class="flex-1 overflow-y-auto p-4 font-mono text-xs sm:text-sm space-y-0.5"
          :aria-live="capturing ? 'off' : 'polite'"
          aria-atomic="false"
          @click="inputEl?.focus()"
        >
          <TerminalOutput v-for="(entry, i) in buffer" :key="i" :line="entry" />
        </div>
        <!-- Same click-to-refocus as the scrollback above, and load-bearing here:
             the pane is a plain div, so a click on the file contents blurs the
             input, and every keystroke after that lands on <body> — outside the
             overlay's listeners entirely. `:q!` would then type nowhere and
             Escape would be dead, which reads exactly like a frozen editor. -->
        <VimPane v-else :buffer="vimBuffer" @click="inputEl?.focus()" />

        <!-- Input. Never `disabled`, even while a command runs: a disabled input
             loses focus to <body> a frame later, outside every listener here, and
             Ctrl+C then has nothing to land on. `readonly` keeps it focused and
             `aria-disabled` still tells assistive tech (and the dimming) it is
             inert. -->
        <form
          class="flex items-center gap-2 px-4 py-3 border-t border-border bg-card/50 shrink-0 font-mono text-xs sm:text-sm"
          @submit.prevent="onSubmit"
        >
          <label for="terminal-input" class="sr-only">{{ t(m.terminal.inputLabel) }}</label>
          <span :class="pendingPrompt || search ? 'text-accent' : 'text-primary'">{{ promptLabel }}</span>
          <div class="relative flex-1 min-w-0 flex items-center">
            <!-- The ghost: what is typed, invisible, then the rest of the history line it
                 would become, faded. Decoration only, so screen readers skip it. -->
            <span
              v-if="ghost"
              aria-hidden="true"
              data-testid="terminal-ghost"
              class="pointer-events-none absolute inset-0 flex items-center whitespace-pre overflow-hidden text-transparent"
              >{{ input }}<span class="text-muted-foreground/50">{{ ghost }}</span></span
            >
            <input
              id="terminal-input"
              ref="inputEl"
              v-model="input"
              :type="pendingPrompt?.mask ? 'password' : 'text'"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              :readonly="capturing || running"
              :aria-disabled="running"
              :placeholder="placeholder"
              class="w-full bg-transparent outline-none text-foreground caret-primary aria-disabled:opacity-50 placeholder:text-muted-foreground/50"
              @keydown="onKeydown"
              @input="onTyped"
              @keyup="measure"
              @click="measure"
              @scroll="measure"
            />
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>
