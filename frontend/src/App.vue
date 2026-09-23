<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import NavBar from '@/components/NavBar.vue'
import BootSequence from '@/components/BootSequence.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import TerminalLauncher from '@/components/terminal/TerminalLauncher.vue'
import { useKonami } from '@/composables/useKonami'
import { restoreCrt, setCrt } from '@/composables/useCrt'
import { useMatrix } from '@/composables/useMatrix'
import { terminalOpen } from '@/composables/useTerminalShell'
import { installViewSwing, untilSettled, useViewSwing } from '@/composables/useViewSwing'
import { track } from '@/lib/analytics'
import { unlock } from '@/terminal/achievements'
import AchievementToast from '@/components/AchievementToast.vue'
// Imported eagerly, unlike MatrixRain: a couple of KB, and a chunk fetched on the
// first unlock would land after the toast that triggered it had already gone.
import ConfettiBurst from '@/components/effects/ConfettiBurst.vue'
// Polls the guestbook on a slow interval, so it stays off the critical path.
const GuestbookTicker = defineAsyncComponent(() => import('@/components/GuestbookTicker.vue'))

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

// The prism swing between views (features-spec §11). The router drives the clock;
// the stage below only binds its values as CSS custom properties, its `<Transition>`
// ends when that clock does (`untilSettled`), and `ThreeBackground` reads the same
// clock for the wireframes. Under reduced motion the `<Transition>` puts no classes
// on and the composable never starts a tween, so the pages swap instantly.
installViewSwing(useRouter())
const { swing, swingDirection, swinging, leaveScroll } = useViewSwing()
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const stageStyle = computed(() => ({
  '--swing': String(swing.value),
  '--swing-dir': String(swingDirection.value),
  '--leave-scroll': `${-leaveScroll.value}px`,
}))

// Once true, stays true — TerminalOverlay is mounted for the rest of the session
// (its own internal `open`/Transition handles every close/reopen after that) so
// its async chunk is fetched exactly once, the first time it's actually needed.
const terminalEverOpened = ref(false)
watch(terminalOpen, (isOpen) => {
  if (!isOpen) return
  terminalEverOpened.value = true
  // Pageviews alone say nothing about whether anyone finds the terminal — the one
  // thing here worth measuring. No-op when analytics is unconfigured.
  track('terminal-opened')
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

  <!--
    The fixed chrome (navbar, launcher, toasts) sits outside the stage on purpose:
    the visitor does not turn, the world does. Nothing inside a view may be
    `position: fixed` — a transformed ancestor becomes its containing block.
  -->
  <div class="view-stage" :class="{ 'is-swinging': swinging }" :style="stageStyle">
    <div class="view-prism">
      <RouterView v-slot="{ Component }">
        <Transition name="view" :css="!reducedMotion" @enter="untilSettled" @leave="untilSettled">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </div>
  </div>

  <TerminalLauncher />
  <TerminalOverlay v-if="terminalEverOpened" />
  <CommandPalette />
  <AchievementToast />
  <ConfettiBurst />
  <GuestbookTicker />

  <MatrixRain v-if="matrixActive" />
  <BootSequence />
</template>
