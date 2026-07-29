<script setup lang="ts">
import { defineAsyncComponent, onMounted } from 'vue'
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

useKonami(() => setCrt())

onMounted(restoreCrt)
</script>

<template>
  <ThreeBackground />
  <NavBar />
  <RouterView />

  <TerminalLauncher />
  <TerminalOverlay />
  <CommandPalette />

  <MatrixRain v-if="matrixActive" />
  <BootSequence />
</template>
