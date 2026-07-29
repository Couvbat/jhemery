<script setup lang="ts">
import { computed } from 'vue'
import type { ContributionDay } from '@/lib/api'
import { useLocale } from '@/i18n'

const props = defineProps<{
  weeks: ContributionDay[][]
  total: number
}>()

const { t, m } = useLocale()

/** GitHub buckets contributions into 5 levels; these are the ASCII stand-ins. */
const LEVEL_CHARS = ['·', '░', '▒', '▓', '█'] as const
const LEVEL_CLASSES = [
  'text-muted-foreground/40',
  'text-primary/40',
  'text-primary/60',
  'text-primary/80',
  'text-primary',
] as const

/**
 * The API sends weeks-of-days (columns). The grid renders rows-of-days so a row is a
 * weekday across the year, matching GitHub's own orientation.
 */
const rows = computed(() => {
  const byWeekday: (ContributionDay | null)[][] = Array.from({ length: 7 }, () => [])
  for (const week of props.weeks) {
    for (let day = 0; day < 7; day++) {
      byWeekday[day]!.push(week[day] ?? null)
    }
  }
  return byWeekday
})

function charFor(day: ContributionDay | null): string {
  if (!day) return ' '
  return LEVEL_CHARS[Math.min(day.level, 4)]!
}

function classFor(day: ContributionDay | null): string {
  if (!day) return ''
  return LEVEL_CLASSES[Math.min(day.level, 4)]!
}

function titleFor(day: ContributionDay | null): string {
  if (!day) return ''
  return `${day.count} — ${day.date}`
}
</script>

<template>
  <div class="rounded border border-border bg-card overflow-hidden">
    <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
      <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
      <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
      <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
      <span class="ml-3 text-xs text-muted-foreground">{{ t(m.projects.contributions) }}</span>
      <span class="ml-auto text-xs text-primary">{{ total }}</span>
    </div>

    <!-- 53 weeks never fits a phone; scroll the grid rather than the page. -->
    <div class="p-4 overflow-x-auto">
      <div class="font-mono text-[10px] leading-[1.15] w-max" role="img"
        :aria-label="`${total} contributions`">
        <div v-for="(row, rowIndex) in rows" :key="rowIndex" class="whitespace-pre">
          <span
            v-for="(day, colIndex) in row"
            :key="colIndex"
            :class="classFor(day)"
            :title="titleFor(day)"
            >{{ charFor(day) }}</span
          >
        </div>
      </div>

      <div class="flex items-center gap-1 mt-3 text-[10px] font-mono text-muted-foreground">
        <span>{{ t(m.projects.less) }}</span>
        <span v-for="(char, i) in LEVEL_CHARS" :key="i" :class="LEVEL_CLASSES[i]">{{ char }}</span>
        <span>{{ t(m.projects.more) }}</span>
      </div>
    </div>
  </div>
</template>
