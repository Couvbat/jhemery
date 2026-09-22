<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocale } from '@/i18n'
import CopyButton from '../CopyButton.vue'
import ToolFrame from '../ToolFrame.vue'
import {
  ZONES,
  dayOfYear,
  inZone,
  isoWeek,
  parseInstant,
  relative,
  toEpochSeconds,
  toIso,
  toLocal,
} from './time'

const { t, m, locale } = useLocale()

const input = ref('now')
/** Re-read on every "now" press: the tool is a converter, not a clock. */
const now = ref(new Date())

const instant = computed(() => parseInstant(input.value, now.value))
const invalid = computed(() => input.value.trim() !== '' && !instant.value)

function reset() {
  now.value = new Date()
  input.value = 'now'
}

const rows = computed(() => {
  const date = instant.value
  if (!date) return []
  const week = isoWeek(date)
  return [
    { label: 'epoch (s)', value: String(toEpochSeconds(date)) },
    { label: 'epoch (ms)', value: String(date.getTime()) },
    { label: 'ISO 8601', value: toIso(date) },
    { label: t(m.toolTime.local), value: toLocal(date, locale.value) },
    { label: t(m.toolTime.relative), value: relative(date, now.value, locale.value) },
    {
      label: t(m.toolTime.week),
      value: `${week.year}-W${String(week.week).padStart(2, '0')} · ${t(m.toolTime.day)} ${dayOfYear(date)}`,
    },
  ]
})

const zones = computed(() =>
  instant.value ? ZONES.map((zone) => ({ zone, ...inZone(instant.value!, zone, locale.value) })) : [],
)
</script>

<template>
  <ToolFrame title="time.sh">
    <div class="space-y-1">
      <label for="time-input" class="text-xs text-muted-foreground">--{{ t(m.toolTime.input) }}</label>
      <div class="flex items-center gap-2">
        <input
          id="time-input"
          v-model="input"
          type="text"
          spellcheck="false"
          :placeholder="t(m.toolTime.placeholder)"
          :aria-invalid="invalid ? 'true' : undefined"
          class="w-full h-9 rounded border bg-transparent px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none"
          :class="invalid ? 'border-destructive' : 'border-border'"
        />
        <button
          type="button"
          class="h-9 px-3 rounded border border-primary/50 text-primary text-sm hover:bg-primary/10 transition-colors"
          @click="reset"
        >
          {{ t(m.toolTime.now) }}
        </button>
      </div>
      <p v-if="invalid" class="text-xs text-destructive">{{ t(m.toolTime.invalid) }}</p>
    </div>

    <dl v-if="rows.length" class="space-y-2">
      <div
        v-for="row in rows"
        :key="row.label"
        class="flex items-center gap-2 rounded border border-border/60 bg-black/30 px-3 py-2"
      >
        <dt class="w-24 shrink-0 text-xs text-muted-foreground">{{ row.label }}</dt>
        <dd class="flex-1 font-mono text-sm text-primary break-all">{{ row.value }}</dd>
        <CopyButton :text="row.value" />
      </div>
    </dl>

    <div v-if="zones.length" class="space-y-2">
      <p class="text-xs text-muted-foreground">{{ t(m.toolTime.zones) }}</p>
      <ul class="grid gap-1 sm:grid-cols-3 text-xs">
        <li
          v-for="z in zones"
          :key="z.zone"
          class="flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1"
        >
          <span class="text-muted-foreground truncate">{{ z.zone.replace('_', ' ') }}</span>
          <span class="font-mono text-foreground whitespace-nowrap">{{ z.time }}</span>
          <span class="font-mono text-accent whitespace-nowrap">{{ z.offset }}</span>
        </li>
      </ul>
    </div>
  </ToolFrame>
</template>
