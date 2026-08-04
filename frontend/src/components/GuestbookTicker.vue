<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useLocale } from '@/i18n'
import { messages } from '@/i18n/messages'
import { prefersReducedMotion } from '@/composables/useCrt'
import {
  dismissGuestbookEntry,
  startGuestbookTicker,
  stopGuestbookTicker,
  useGuestbookTicker,
} from '@/composables/useGuestbookTicker'
import { openTerminal } from '@/composables/useTerminalShell'

const { t } = useLocale()
const { queue } = useGuestbookTicker()

const visible = ref<{ id: string; name: string } | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

/** Shows the next queued entry, if one is waiting and nothing is currently shown.
 *  Same one-at-a-time drain as `AchievementToast` — two floating notices fighting
 *  for the same corner reads as a bug. */
function scheduleNext() {
  if (visible.value !== null || queue.value.length === 0) return

  const next = queue.value[0]!
  visible.value = { id: next.id, name: next.name }

  timer = setTimeout(
    () => {
      dismissGuestbookEntry(next.id)
      visible.value = null
      scheduleNext()
    },
    prefersReducedMotion() ? 3000 : 5000,
  )
}

function openGuestbook() {
  if (visible.value) dismissGuestbookEntry(visible.value.id)
  clearTimeout(timer)
  visible.value = null
  openTerminal('guestbook')
}

watch(() => queue.value.length, scheduleNext, { immediate: true })

onMounted(startGuestbookTicker)
onUnmounted(() => {
  clearTimeout(timer)
  stopGuestbookTicker()
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 translate-y-2"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="opacity-0 translate-y-2"
  >
    <button
      v-if="visible"
      type="button"
      class="fixed bottom-20 left-4 z-[70] max-w-[min(20rem,calc(100vw-2rem))] rounded border border-accent/40 bg-background/95 backdrop-blur px-4 py-2 text-left text-xs sm:text-sm font-mono hover:border-accent transition-colors"
      @click="openGuestbook"
    >
      <span class="text-accent">✍ {{ visible.name }}</span>
      <!-- A real space, not a margin: this line is read aloud as well as looked at. -->
      <span class="text-foreground">&nbsp;{{ t(messages.guestbookTicker.signed) }}</span>
      <span class="block text-muted-foreground text-[11px] mt-0.5">
        {{ t(messages.guestbookTicker.read) }}
      </span>
    </button>
  </Transition>
</template>
