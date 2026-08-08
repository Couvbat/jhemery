<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useLocale } from '@/i18n'
import { messages } from '@/i18n/messages'
import { prefersReducedMotion } from '@/composables/useCrt'
import { fireConfetti } from '@/composables/useConfetti'
import { COMPLETIONIST, dismissToast, toastQueue } from '@/terminal/achievements'

const { t } = useLocale()

const visibleTitle = ref<string | null>(null)
const toastEl = ref<HTMLElement | null>(null)

/** Shows the next queued toast, if one is waiting and nothing is currently shown. */
function scheduleNext() {
  if (visibleTitle.value !== null || toastQueue.value.length === 0) return

  const next = toastQueue.value[0]!
  visibleTitle.value = t(next.title)

  // Fire from the toast's own centre rather than a fixed corner, so the burst still
  // comes out of the badge once it has moved (narrow viewports, future placement).
  void nextTick(() => {
    const rect = toastEl.value?.getBoundingClientRect()
    if (!rect) return
    fireConfetti({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      // The last one is worth more than the other twenty-nine.
      intensity: next.id === COMPLETIONIST ? 2.5 : 1,
    })
  })

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
      ref="toastEl"
      role="status"
      aria-live="polite"
      class="fixed top-16 right-4 z-[70] rounded border border-primary/40 bg-background/95 backdrop-blur px-4 py-2 text-xs sm:text-sm font-mono border-glow"
    >
      <span class="text-primary">🏆 {{ t(messages.achievements.toastPrefix) }}</span>
      <span class="text-foreground ml-1">{{ visibleTitle }}</span>
    </div>
  </Transition>
</template>
