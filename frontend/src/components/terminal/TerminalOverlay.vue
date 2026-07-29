<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { profile } from '@/content'
import { useLocale } from '@/i18n'
import { useTerminal } from '@/composables/useTerminal'
import TerminalOutput from './TerminalOutput.vue'

const { t, m } = useLocale()
const {
  open,
  maximised,
  busy,
  trapped,
  buffer,
  revision,
  pendingPrompt,
  closeTerminal,
  submit,
  cancel,
  recallHistory,
  completeInput,
} = useTerminal()

const input = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const scrollEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
/** Restored when the overlay closes, so keyboard users land back where they started. */
let previouslyFocused: HTMLElement | null = null

const promptLabel = computed(() =>
  pendingPrompt.value ? pendingPrompt.value.question : `${profile.handle}:~$`,
)

watch(revision, async () => {
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
})

watch(open, async (isOpen) => {
  if (isOpen) {
    previouslyFocused = document.activeElement as HTMLElement | null
    await nextTick()
    inputEl.value?.focus()
  } else {
    previouslyFocused?.focus()
    previouslyFocused = null
  }
})

async function onSubmit() {
  const value = input.value
  input.value = ''
  await submit(value)
  await nextTick()
  inputEl.value?.focus()
}

function onKeydown(event: KeyboardEvent) {
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

/** Focus trap: the panel is the only interactive region while open. */
function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (!closeTerminal()) {
      // vim trap active — nudge rather than silently swallowing the key.
      void submit(':q')
    }
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
          <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
          <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
          <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
          <span class="ml-3 text-xs text-muted-foreground flex-1"
            >{{ profile.handle }}@{{ profile.host }} ~ {{ t(m.terminal.title) }}</span
          >
          <span v-if="trapped" class="text-xs text-yellow-400">-- INSERT --</span>
          <button
            class="text-xs text-muted-foreground hover:text-primary px-1 transition-colors"
            :aria-label="maximised ? t(m.terminal.restore) : t(m.terminal.maximise)"
            :title="maximised ? t(m.terminal.restore) : t(m.terminal.maximise)"
            @click="maximised = !maximised"
          >
            {{ maximised ? '▾' : '▴' }}
          </button>
          <button
            class="text-xs text-muted-foreground hover:text-destructive px-1 transition-colors"
            :aria-label="t(m.terminal.close)"
            :title="t(m.terminal.close)"
            @click="closeTerminal()"
          >
            ✕
          </button>
        </div>

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
            :disabled="busy && !pendingPrompt"
            class="flex-1 bg-transparent outline-none text-foreground caret-primary disabled:opacity-50"
            @keydown="onKeydown"
          />
        </form>
      </div>
    </div>
  </Transition>
</template>
