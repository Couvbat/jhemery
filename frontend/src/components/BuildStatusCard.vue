<script setup lang="ts">
import type { WorkflowRun } from '@/lib/api'
import { useLocale } from '@/i18n'
import { relativeTime } from '@/composables/useGithub'

defineProps<{ runs: WorkflowRun[] }>()

const { t, m } = useLocale()

/** A run's state is `conclusion` once it has one, and `status` until then. */
function stateOf(run: WorkflowRun): string {
  if (run.status !== 'completed') return run.status === 'queued' ? 'queued' : 'running'
  return run.conclusion ?? 'unknown'
}

const LABELS: Record<string, keyof typeof m.build> = {
  queued: 'queued',
  running: 'running',
  success: 'success',
  failure: 'failure',
  cancelled: 'cancelled',
}

function label(run: WorkflowRun): string {
  const state = stateOf(run)
  return t(m.build[LABELS[state] ?? 'unknown'])
}

const TONES: Record<string, string> = {
  success: 'text-primary',
  failure: 'text-red-400',
  cancelled: 'text-muted-foreground',
  running: 'text-yellow-400',
  queued: 'text-muted-foreground',
}

function tone(run: WorkflowRun): string {
  return TONES[stateOf(run)] ?? 'text-muted-foreground'
}

const DOTS: Record<string, string> = {
  success: 'bg-primary',
  failure: 'bg-red-400',
  cancelled: 'bg-muted-foreground',
  running: 'bg-yellow-400 motion-safe:animate-pulse',
  queued: 'bg-muted-foreground motion-safe:animate-pulse',
}

function dot(run: WorkflowRun): string {
  return DOTS[stateOf(run)] ?? 'bg-muted-foreground'
}

/** `1m 12s`, or nothing at all while the run is still going. */
function duration(run: WorkflowRun): string {
  if (run.durationMs === null || run.durationMs < 0) return ''
  const seconds = Math.round(run.durationMs / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}
</script>

<template>
  <div class="rounded border border-border bg-card overflow-hidden">
    <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
      <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
      <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
      <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
      <span class="ml-3 text-xs text-muted-foreground">{{ t(m.build.title) }}</span>
    </div>

    <div class="p-4 font-mono text-xs space-y-1.5">
      <a
        v-for="run in runs"
        :key="run.url"
        :href="run.url"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-2 hover:text-primary transition-colors"
      >
        <span :class="['w-2 h-2 rounded-full shrink-0', dot(run)]" aria-hidden="true"></span>
        <span :class="['shrink-0 w-16', tone(run)]">{{ label(run) }}</span>
        <span class="text-foreground flex-1 truncate">{{ run.name }}</span>
        <span class="text-secondary shrink-0 hidden sm:inline">{{ run.branch }}</span>
        <span class="text-primary shrink-0">{{ run.sha }}</span>
        <span v-if="duration(run)" class="text-muted-foreground shrink-0 hidden md:inline">
          {{ duration(run) }}
        </span>
        <span class="text-muted-foreground shrink-0 hidden sm:inline">
          {{ relativeTime(run.startedAt, t(m.projects.justNow)) }}
        </span>
      </a>
    </div>
  </div>
</template>
