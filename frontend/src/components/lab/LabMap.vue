<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { labLinks, labNodes, labTiers, type LabLinkKind } from '@/content/lab'
import { useLocale } from '@/i18n'
import type { LabReport } from '@/lib/api'
import LabNodeCard from './LabNodeCard.vue'
import { labLabels as labels, wireWords } from './labels'
import { relativeTo, wirePath } from './wires'

/**
 * The map: HTML cards in one ordered list per tier, left to right along the request
 * path, with one `aria-hidden` SVG of wires behind them. The list is the content and
 * the SVG decoration, so a screen reader reads the nodes in order and each card's text
 * says what it reaches. No graph library and no force layout: the tiers are content, and
 * a hand-placed diagram reads better than a simulated one at this size.
 *
 * The wires are recomputed from the cards' rectangles whenever any of them changes size
 * (a disclosure opening, the figures arriving, the layout folding to one column below
 * `md`), so the SVG never has to know the layout.
 */
const props = defineProps<{ report: LabReport | null | undefined }>()
const { t } = useLocale()

const tiers = Array.from({ length: labTiers }, (_, tier) => labNodes.filter((node) => node.tier === tier && !node.on))
const kinds: LabLinkKind[] = ['public', 'tunnel', 'restricted', 'private', 'push']

const container = ref<HTMLElement>()
const size = ref({ width: 0, height: 0 })
const wires = ref<Array<{ key: string; d: string; kind: LabLinkKind }>>([])

function measure() {
  const root = container.value
  if (!root) return
  const box = root.getBoundingClientRect()
  size.value = { width: Math.round(box.width), height: Math.round(box.height) }
  wires.value = labLinks.flatMap((link) => {
    const from = root.querySelector(`[data-node="${link.from}"]`)
    const to = root.querySelector(`[data-node="${link.to}"]`)
    if (!from || !to) return []
    const d = wirePath(relativeTo(from.getBoundingClientRect(), box), relativeTo(to.getBoundingClientRect(), box))
    return [{ key: `${link.from}>${link.to}`, d, kind: link.kind }]
  })
}

let observer: ResizeObserver | undefined
let frame = 0
// One measure per frame however many cards report a change in it.
const schedule = () => {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    measure()
  })
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver === 'undefined' || !container.value) return
  observer = new ResizeObserver(schedule)
  observer.observe(container.value)
  for (const card of container.value.querySelectorAll('.lab-card')) observer.observe(card)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (frame) cancelAnimationFrame(frame)
})

watch(
  () => props.report,
  () => void nextTick(schedule),
)
</script>

<template>
  <div class="space-y-4">
    <div ref="container" class="relative" data-testid="lab-map">
      <svg
        class="absolute inset-0 pointer-events-none overflow-visible"
        :width="size.width"
        :height="size.height"
        :viewBox="`0 0 ${size.width || 1} ${size.height || 1}`"
        aria-hidden="true"
      >
        <template v-for="wire in wires" :key="wire.key">
          <path :d="wire.d" :class="['lab-wire', `lab-wire--${wire.kind}`]" />
          <path v-if="wire.kind === 'public'" :d="wire.d" class="lab-packet" pathLength="100" />
        </template>
      </svg>

      <div
        class="relative grid gap-6 md:gap-x-10 md:gap-y-12 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
      >
        <section
          v-for="(nodes, tier) in tiers"
          :key="tier"
          :aria-labelledby="`lab-tier-${tier}`"
          :class="['flex flex-col gap-2', tier === labTiers - 1 ? 'md:col-span-4' : '']"
        >
          <h2 :id="`lab-tier-${tier}`" class="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {{ tier }} · {{ t(labels.tiers[tier]!) }}
          </h2>
          <ol
            :class="[
              'space-y-4',
              tier === labTiers - 1
                ? 'md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-6 md:space-y-0 md:items-start'
                : 'md:my-auto',
            ]"
          >
            <li v-for="node in nodes" :key="node.id" :class="node.kind === 'machine' || tier !== labTiers - 1 ? '' : 'md:col-span-2 md:max-w-sm'">
              <LabNodeCard :node="node" :report="report" />
            </li>
          </ol>
        </section>
      </div>
    </div>

    <ul class="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-muted-foreground" :aria-label="t(labels.legend)">
      <li v-for="kind in kinds" :key="kind" class="inline-flex items-center gap-2">
        <svg width="28" height="8" aria-hidden="true"><path d="M1 4 H27" :class="['lab-wire', `lab-wire--${kind}`]" /></svg>
        {{ t(wireWords[kind]) }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.lab-wire {
  fill: none;
  stroke-width: 1.5;
}
.lab-wire--public {
  stroke: var(--primary);
  opacity: 0.55;
}
.lab-wire--tunnel {
  stroke: var(--accent);
  opacity: 0.6;
}
.lab-wire--restricted {
  stroke: var(--warning);
  stroke-dasharray: 6 4;
  opacity: 0.75;
}
.lab-wire--private {
  stroke: var(--muted-foreground);
  stroke-dasharray: 2 4;
  opacity: 0.7;
}
.lab-wire--push {
  stroke: var(--secondary);
  stroke-dasharray: 8 4;
  opacity: 0.75;
}

/*
 * A packet along each public wire, at *full* motion only: a short dash walking the path.
 * CSS, so a hidden tab costs nothing. At *calm* the wires are still and at *paused*
 * nothing moves, which `data-motion` on the root says for both; the OS setting says it
 * for itself.
 */
.lab-packet {
  fill: none;
  stroke: var(--primary);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 2 98;
  animation: lab-packet 2.8s linear infinite;
}
@keyframes lab-packet {
  from {
    stroke-dashoffset: 100;
  }
  to {
    stroke-dashoffset: 0;
  }
}
:global([data-motion]) .lab-packet {
  display: none;
}
@media (prefers-reduced-motion: reduce) {
  .lab-packet {
    display: none;
  }
}
</style>
