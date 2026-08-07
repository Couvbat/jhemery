<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { profile } from '@/content'
import { useLocale } from '@/i18n'
import { prefersReducedMotion } from '@/composables/useCrt'
import { useBoot } from '@/composables/useBoot'

const STORAGE_KEY = 'couvbat:booted'
const STEP_MS = 130

const { t, m } = useLocale()
const { bootActive, ackBoot } = useBoot()

const visible = ref(false)
const shown = ref<string[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
let armTimer: ReturnType<typeof setTimeout> | undefined

const STEPS = [
  '[    0.000000] couvsh 1.0 booting…',
  '[    0.041233] CPU: caffeine detected, 4 cores online',
  `[    0.118904] mounting /home/${profile.handle}`,
  '[    0.204551] loading module: vue@3',
  '[    0.288017] loading module: three.js (wireframes)',
  '[    0.377420] starting service: nestjs-api',
  '[    0.501338] starting service: terminal',
  `[    0.664902] resolving ${profile.domain} … ok`,
  '[    0.812004] all systems nominal',
  '',
  'welcome.',
]

function disarm() {
  clearTimeout(armTimer)
  window.removeEventListener('keydown', finish)
  window.removeEventListener('click', finish)
}

function finish() {
  clearTimeout(timer)
  visible.value = false
  disarm()
  // Clears the `reboot` flag, so the command can be run again straight away.
  ackBoot()
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Private browsing — the sequence will just play again next time.
  }
}

function step(index: number) {
  if (index >= STEPS.length) {
    timer = setTimeout(finish, 450)
    return
  }
  shown.value = [...shown.value, STEPS[index]!]
  timer = setTimeout(() => step(index + 1), STEP_MS)
}

/** Plays the sequence from the top. Shared by the first visit and by `reboot`,
 *  so the two can never drift into showing different things. */
function start() {
  clearTimeout(timer)
  disarm()
  shown.value = []
  visible.value = true
  // The keypress or click that ran `reboot` is still propagating when the watcher
  // fires, and a window listener attached now would catch it and dismiss the
  // replay instantly. Arming a beat later leaves the sequence a chance to play.
  armTimer = setTimeout(() => {
    window.addEventListener('keydown', finish)
    window.addEventListener('click', finish)
  }, 300)
  step(0)
}

/**
 * Whether this visitor has already seen the sequence.
 *
 * Reading localStorage throws outright in a few configurations — Safari private
 * browsing, third-party-cookie blocking in an embedded context. Treating the
 * throw as "already booted" is the safe direction: the sequence is skipped once
 * rather than replayed on every single navigation.
 */
function hasBooted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return true
  }
}

onMounted(() => {
  // First visit only, and never when the visitor asked for less motion.
  if (hasBooted() || prefersReducedMotion()) return

  start()
})

// `reboot` replays it on demand — no `alreadyBooted` gate, that's the whole point.
watch(bootActive, (requested) => {
  if (requested) start()
})

onUnmounted(() => {
  clearTimeout(timer)
  disarm()
})
</script>

<template>
  <Transition
    leave-active-class="transition duration-300 ease-in"
    leave-to-class="opacity-0"
  >
    <div
      v-if="visible"
      class="fixed inset-0 z-[110] bg-background flex items-center justify-center px-6 cursor-pointer"
      aria-hidden="true"
    >
      <div class="w-full max-w-2xl font-mono text-xs sm:text-sm space-y-0.5">
        <p v-for="(entry, i) in shown" :key="i" class="text-primary whitespace-pre-wrap">
          {{ entry || ' ' }}
        </p>
        <p class="text-muted-foreground pt-6">{{ t(m.boot.skip) }}</p>
      </div>
    </div>
  </Transition>
</template>
