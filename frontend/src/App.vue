<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { RouterView } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import BootSequence from '@/components/BootSequence.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import TerminalLauncher from '@/components/terminal/TerminalLauncher.vue'
import { useKonami } from '@/composables/useKonami'
import { restoreCrt, setCrt } from '@/composables/useCrt'
import { useMatrix } from '@/composables/useMatrix'
import { terminalOpen } from '@/composables/useTerminalShell'
import { unlock } from '@/terminal/achievements'
import AchievementToast from '@/components/AchievementToast.vue'

const ThreeBackground = defineAsyncComponent(() => import('@/components/ThreeBackground.vue'))
// Only pulled in when someone actually types `matrix`.
const MatrixRain = defineAsyncComponent(() => import('@/components/effects/MatrixRain.vue'))
// The whole command registry (every command, the guestbook client, the vim
// editor...) lives behind this — only fetched once the terminal is actually opened.
const TerminalOverlay = defineAsyncComponent(
  () => import('@/components/terminal/TerminalOverlay.vue'),
)

const { matrixActive } = useMatrix()
// Purely decorative, so it's kept off the critical rendering path: skipped entirely
// for reduced-motion (no point fetching ~500KB of three.js for a static frame nobody
// asked to animate), and deferred until the browser is idle for everyone else so it
// doesn't compete with hero content for bandwidth/CPU during first paint.
const showThreeBackground = ref(false)

// Once true, stays true — TerminalOverlay is mounted for the rest of the session
// (its own internal `open`/Transition handles every close/reopen after that) so
// its async chunk is fetched exactly once, the first time it's actually needed.
const terminalEverOpened = ref(false)
watch(terminalOpen, (isOpen) => {
  if (isOpen) terminalEverOpened.value = true
})

useKonami(() => {
  setCrt()
  unlock('konami')
})

onMounted(() => {
  restoreCrt()

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const load = () => {
    showThreeBackground.value = true
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(load, { timeout: 2000 })
  } else {
    setTimeout(load, 200)
  }
})
</script>

<template>
  <ThreeBackground v-if="showThreeBackground" />
  <NavBar />
  <RouterView />

  <TerminalLauncher />
  <TerminalOverlay v-if="terminalEverOpened" />
  <CommandPalette />
  <AchievementToast />

  <MatrixRain v-if="matrixActive" />
  <BootSequence />
</template>
