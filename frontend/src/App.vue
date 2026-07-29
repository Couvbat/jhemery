<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue'
import { RouterView } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import BootSequence from '@/components/BootSequence.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import TerminalLauncher from '@/components/terminal/TerminalLauncher.vue'
import TerminalOverlay from '@/components/terminal/TerminalOverlay.vue'
import { useKonami } from '@/composables/useKonami'
import { restoreCrt, setCrt } from '@/composables/useCrt'
import { useMatrix } from '@/composables/useMatrix'

const ThreeBackground = defineAsyncComponent(() => import('@/components/ThreeBackground.vue'))
// Only pulled in when someone actually types `matrix`.
const MatrixRain = defineAsyncComponent(() => import('@/components/effects/MatrixRain.vue'))

const { matrixActive } = useMatrix()
// Purely decorative, so it's kept off the critical rendering path: skipped entirely
// for reduced-motion (no point fetching ~500KB of three.js for a static frame nobody
// asked to animate), and deferred until the browser is idle for everyone else so it
// doesn't compete with hero content for bandwidth/CPU during first paint.
const showThreeBackground = ref(false)

useKonami(() => setCrt())

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
  <TerminalOverlay />
  <CommandPalette />

  <MatrixRain v-if="matrixActive" />
  <BootSequence />
</template>
