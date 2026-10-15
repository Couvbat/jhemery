<script setup lang="ts">
import { computed } from 'vue'
import { findLabNode, labLinks, servicesOn, type LabNode } from '@/content/lab'
import { machines } from '@/content/hardware'
import CodeText from '@/components/CodeText.vue'
import { useLocale } from '@/i18n'
import type { LabReport } from '@/lib/api'
import {
  celsius,
  gigabytes,
  nodeFigures,
  nodeState,
  percent,
  poolLine,
  snapshotOf,
  STATE_WORDS,
  uptime,
  uptimeSummary,
  type NodeState,
} from '@/lib/lab'
import { labLabels as labels, linkWords } from './labels'

/**
 * One node of the map: a real element, read in request-path order, with its status as a
 * word beside its dot and never as colour alone. A machine's card is larger and holds
 * the services that run on it, each a card of its own.
 */
const props = defineProps<{ node: LabNode; report: LabReport | null | undefined }>()
const { t, locale } = useLocale()

const state = computed<NodeState>(() => nodeState(props.node, props.report))
const tone: Record<NodeState, string> = {
  up: 'text-primary',
  down: 'text-destructive',
  degraded: 'text-warning',
  stale: 'text-warning',
  nodata: 'text-muted-foreground',
  none: 'text-muted-foreground',
}

const figures = computed(() => nodeFigures(props.node, props.report, locale.value))
const machine = computed(() =>
  props.node.kind === 'machine' ? snapshotOf(props.report)?.machines.find((m) => m.id === props.node.id) : undefined,
)
const inside = computed(() => (props.node.kind === 'machine' ? servicesOn(props.node.id) : []))
const models = computed(() => (props.node.id === 'ollama' ? snapshotOf(props.report)?.models : undefined))

/** One line of specs from `hardware.ts`: the CPU, the GPU and the memory. */
const specs = computed(() => {
  const found = machines.find((m) => m.name === props.node.machine)
  if (!found) return ''
  return found.specs
    .filter((spec) => ['CPU', 'GPU', 'RAM'].includes(spec.key))
    .map((spec) => spec.value)
    .join(' · ')
})

/** What it reaches, in words, so nothing is said by a wire alone. */
const reaches = computed(() =>
  labLinks
    .filter((link) => link.from === props.node.id)
    .map((link) => {
      const target = findLabNode(link.to)
      const text = t(linkWords[link.kind]).replace('{name}', target?.name ?? link.to)
      return link.label ? `${text} (${t(link.label)})` : text
    }),
)

const history = computed(() => {
  const report = props.report
  return report?.configured ? report.history[props.node.id] : undefined
})
const summary = computed(() => uptimeSummary(history.value, locale.value))

function dayLabel(index: number, value: number | null): string {
  const date = new Date(Date.now() - (29 - index) * 86_400_000).toISOString().slice(0, 10)
  const text = value === null ? t(labels.noDay) : percent(value * 100, locale.value, value === 1 ? 0 : 1)
  return t(labels.dayCell).replace('{date}', date).replace('{value}', text)
}

const whyHref = computed(() =>
  props.node.decision ? `/?run=${encodeURIComponent(`why ${props.node.decision}`)}` : undefined,
)
const showsHistory = computed(() => props.node.kind === 'service' || props.node.kind === 'machine' || props.node.id === 'tunnel')
</script>

<template>
  <div
    :id="`lab-${node.id}`"
    :data-node="node.id"
    :data-state="state"
    :class="[
      'lab-card relative rounded border bg-card/90 font-mono text-xs space-y-1.5',
      node.kind === 'machine' ? 'p-3 md:p-4 border-primary/40' : 'p-2.5 border-border',
      node.kind === 'private' ? 'border-dashed' : '',
    ]"
  >
    <p class="flex flex-wrap items-baseline justify-between gap-x-2">
      <span :class="['font-bold text-foreground', node.kind === 'machine' ? 'text-sm md:text-base' : 'text-sm']">{{
        node.name
      }}</span>
      <span v-if="state !== 'none'" :class="['inline-flex items-center gap-1.5', tone[state]]" data-testid="lab-state">
        <span class="lab-dot inline-block w-2 h-2 rounded-full bg-current" aria-hidden="true"></span>{{
          t(STATE_WORDS[state])
        }}
      </span>
    </p>
    <p class="text-muted-foreground"><CodeText :text="t(node.role)" /></p>
    <p v-if="figures.length && node.kind !== 'machine'" class="text-foreground">{{ figures.join(' · ') }}</p>

    <dl v-if="machine?.up" class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-foreground">
      <template v-if="machine.cpu !== undefined">
        <dt class="text-muted-foreground">CPU</dt>
        <dd>
          {{ percent(machine.cpu, locale) }}<template v-if="machine.tempC?.cpu !== undefined"> · {{ celsius(machine.tempC.cpu) }}</template
          ><template v-if="machine.load !== undefined"> · {{ t(labels.load) }} {{ machine.load }}</template>
        </dd>
      </template>
      <template v-if="machine.memory !== undefined">
        <dt class="text-muted-foreground">{{ t(labels.memory) }}</dt>
        <dd>{{ percent(machine.memory, locale) }}</dd>
      </template>
      <template v-if="machine.gpu">
        <dt class="text-muted-foreground">GPU</dt>
        <dd>
          {{ percent(machine.gpu.util, locale) }}<template v-if="machine.tempC?.gpu !== undefined"> · {{ celsius(machine.tempC.gpu) }}</template>
          · {{ t(labels.vram).replace('{value}', `${gigabytes(machine.gpu.vramUsedMb, locale)} / ${gigabytes(machine.gpu.vramTotalMb, locale)}`) }}
        </dd>
      </template>
      <template v-if="machine.uptimeSeconds !== undefined">
        <dt class="text-muted-foreground">uptime</dt>
        <dd>{{ uptime(machine.uptimeSeconds, locale) }}</dd>
      </template>
      <template v-if="machine.containers !== undefined">
        <dt class="text-muted-foreground">docker</dt>
        <dd>{{ t(labels.containers).replace('{n}', String(machine.containers)) }}</dd>
      </template>
    </dl>
    <ul v-if="machine?.up && machine.pools?.length" class="space-y-1" :aria-label="t(labels.pools)">
      <li v-for="pool in machine.pools" :key="pool.name" class="space-y-0.5">
        <p :class="pool.health && pool.health !== 'ONLINE' ? 'text-warning' : 'text-foreground'">{{ poolLine(pool, locale) }}</p>
        <span class="block h-1 rounded-full bg-muted overflow-hidden" aria-hidden="true">
          <span class="block h-full bg-accent" :style="{ width: `${Math.round(pool.used * 100)}%` }"></span>
        </span>
      </li>
    </ul>
    <p v-if="specs" class="text-muted-foreground/80">{{ specs }}</p>

    <template v-if="models && models.runtime === 'up'">
      <p class="text-foreground">
        {{ models.resident.length ? t(labels.models).replace('{value}', models.resident.map((m) => m.name).join(', ')) : t(labels.noneLoaded) }}
      </p>
      <p class="text-muted-foreground">{{ t(labels.installed).replace('{n}', String(models.installed.length)) }}</p>
    </template>

    <ul v-if="reaches.length" class="text-muted-foreground">
      <li v-for="text in reaches" :key="text">→ {{ text }}</li>
    </ul>

    <details v-if="node.stack.length || node.why || showsHistory" class="group">
      <summary class="cursor-pointer text-primary/80 hover:text-primary select-none">{{ t(labels.more) }}</summary>
      <div class="mt-1.5 space-y-1.5">
        <p v-if="node.stack.length"><span class="text-muted-foreground">{{ t(labels.stack) }}:</span> {{ node.stack.join(' · ') }}</p>
        <p v-if="node.why" class="text-foreground/90"><CodeText :text="t(node.why)" /></p>
        <p v-if="whyHref"><a :href="whyHref" class="text-primary hover:underline"><CodeText :text="t(labels.whyLink).replace('{name}', node.decision!)" /></a></p>
        <div v-if="showsHistory">
          <p class="text-muted-foreground" aria-hidden="true">{{ t(labels.history) }}</p>
          <p class="flex gap-px h-3" aria-hidden="true">
            <span
              v-for="(day, i) in history ?? Array(30).fill(null)"
              :key="i"
              :title="dayLabel(i, day)"
              :class="[
                'flex-1 rounded-[1px]',
                day === null ? 'bg-muted' : day >= 0.99 ? 'bg-primary/70' : day >= 0.9 ? 'bg-warning/80' : 'bg-destructive/80',
              ]"
            ></span>
          </p>
          <p class="sr-only">{{ summary }}</p>
        </div>
      </div>
    </details>

    <ul
      v-if="inside.length"
      :class="['grid gap-2 pt-1 sm:grid-cols-2 sm:items-start', inside.length > 2 ? 'xl:grid-cols-3' : '']"
      :aria-label="t(labels.runsHere)"
    >
      <li v-for="service in inside" :key="service.id">
        <LabNodeCard :node="service" :report="report" />
      </li>
    </ul>
  </div>
</template>
