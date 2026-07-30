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
