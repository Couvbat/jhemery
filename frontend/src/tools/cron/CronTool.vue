<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocale } from '@/i18n'
import ToolFrame from '../ToolFrame.vue'
import { relative } from '../time/time'
import { describeCron, nextRuns, parseCron } from './cron'

const { t, m, locale } = useLocale()

const PRESETS = ['*/15 * * * *', '0 9 * * 1-5', '30 2 * * 0', '0 0 1 * *', '0 0 1 * 1', '@hourly']

const input = ref('0 9 * * 1-5')
const now = ref(new Date())
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

const parsed = computed(() => parseCron(input.value))

const error = computed(() => {
  const r = parsed.value
  if (r.ok || !input.value.trim()) return null
  if (r.reason === 'count') return t(m.toolCron.count).replace('{n}', String(r.count))
  if (r.reason === 'reboot') return t(m.toolCron.reboot)
  return t(m.toolCron[r.reason]).replace('{token}', r.token).replace('{field}', t(m.toolCron[r.field]))
})

const sentence = computed(() => (parsed.value.ok ? describeCron(parsed.value.schedule, locale.value) : ''))

const runs = computed(() => {
  if (!parsed.value.ok) return []
  const format = new Intl.DateTimeFormat(locale.value, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return nextRuns(parsed.value.schedule, now.value).map((date) => ({
    when: format.format(date),
    relative: relative(date, now.value, locale.value),
  }))
})

function use(preset: string) {
  input.value = preset
  now.value = new Date()
}
</script>

<template>
  <ToolFrame title="cron.sh">
    <template #status>
      <span v-if="error" class="text-destructive">{{ error }}</span>
    </template>

    <div class="space-y-1">
      <label for="cron-input" class="text-xs text-muted-foreground">--{{ t(m.toolCron.input) }}</label>
      <input
        id="cron-input"
        v-model="input"
        spellcheck="false"
        autocomplete="off"
        :aria-invalid="error ? 'true' : undefined"
        class="w-full rounded border bg-transparent px-3 py-2 font-mono text-base text-foreground focus:border-primary outline-none"
        :class="error ? 'border-destructive' : 'border-border'"
      />
      <p class="font-mono text-[11px] text-muted-foreground">
        ┬ {{ t(m.toolCron.minute) }} · {{ t(m.toolCron.hour) }} · {{ t(m.toolCron.day) }} · {{ t(m.toolCron.month) }} ·
        {{ t(m.toolCron.weekday) }}
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2 text-xs">
      <span class="text-muted-foreground">{{ t(m.toolCron.presets) }}</span>
      <button
        v-for="preset in PRESETS"
        :key="preset"
        type="button"
        class="px-2 py-0.5 rounded border font-mono transition-colors"
        :class="input === preset ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'"
        @click="use(preset)"
      >
        {{ preset }}
      </button>
    </div>

    <p v-if="sentence" data-testid="cron-sentence" class="text-lg text-primary">{{ sentence }}</p>

    <div v-if="parsed.ok" class="space-y-1">
      <p class="text-xs text-muted-foreground">{{ t(m.toolCron.next).replace('{zone}', zone) }}</p>
      <ol v-if="runs.length" class="font-mono text-sm space-y-0.5">
        <li v-for="run in runs" :key="run.when" class="flex flex-wrap gap-x-4">
          <span class="text-foreground">{{ run.when }}</span>
          <span class="text-muted-foreground">{{ run.relative }}</span>
        </li>
      </ol>
      <p v-else class="text-sm text-warning">{{ t(m.toolCron.never) }}</p>
    </div>

    <p class="text-xs text-muted-foreground">{{ t(m.toolCron.note) }}</p>
  </ToolFrame>
</template>
