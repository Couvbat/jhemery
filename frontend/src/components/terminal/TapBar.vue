<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useLocale } from '@/i18n'
import { tapCommands, type TapCommand } from '@/terminal/tap'

/**
 * Where the prompt would be, in the touch layout (features-spec §9): one scrolling row of
 * buttons in `help`'s groups. A command with arguments opens a row of its own lines in
 * place of the first, so the row stays thirty buttons long rather than a hundred and
 * thirty. Every line here is one a `?run=` link could run (`terminal/tap.ts`), and the
 * overlay runs it through `runLink()`.
 */
const props = defineProps<{
  /** A command is running: a tap would be ignored, and the stop button is up. */
  running: boolean
}>()
const emit = defineEmits<{ run: [line: string]; stop: [] }>()

const { t, m } = useLocale()
const groups = tapCommands()

/** The command whose lines are showing, or null for the commands. */
const opened = ref<TapCommand | null>(null)
const rowEl = ref<HTMLElement | null>(null)
/** The commands' row was scrolled here, so coming back from a command's lines lands where it left. */
let rowScroll = 0

const BUTTON =
  'shrink-0 min-h-11 px-3 rounded border font-mono text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-disabled:opacity-50'

function tap(command: TapCommand) {
  if (command.lines.length === 1) return run(command.lines[0]!)
  rowScroll = rowEl.value?.scrollLeft ?? 0
  opened.value = command
  void nextTick(() => {
    if (rowEl.value) rowEl.value.scrollLeft = 0
    rowEl.value?.querySelector<HTMLElement>('[data-line]')?.focus()
  })
}

function back() {
  const name = opened.value?.name
  opened.value = null
  void nextTick(() => {
    if (rowEl.value) rowEl.value.scrollLeft = rowScroll
    rowEl.value?.querySelector<HTMLElement>(`[data-command="${name}"]`)?.focus()
  })
}

function run(line: string) {
  // `aria-disabled` rather than `disabled`: a disabled button drops focus to <body>, out of
  // reach of the overlay's Escape. The shell would ignore the tap anyway.
  if (props.running) return
  emit('run', line)
}
</script>

<template>
  <nav
    :aria-label="t(m.tapShell.commands)"
    class="flex items-center gap-2 py-2 pl-4 border-t border-border bg-card/50 shrink-0"
  >
    <button
      v-if="running"
      type="button"
      :class="[BUTTON, 'border-destructive/60 text-destructive bg-background']"
      :aria-label="t(m.tapShell.stopLabel)"
      @click="emit('stop')"
    >
      <span aria-hidden="true">■</span> {{ t(m.tapShell.stop) }}
    </button>

    <div ref="rowEl" class="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto overscroll-x-contain pr-4" data-testid="tap-row">
      <template v-if="opened">
        <button
          type="button"
          :class="[BUTTON, 'border-border text-muted-foreground bg-background']"
          :aria-label="t(m.tapShell.back)"
          @click="back"
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          v-for="line in opened.lines"
          :key="line"
          type="button"
          data-line
          :class="[BUTTON, 'border-primary/40 text-foreground bg-background hover:border-primary']"
          :aria-disabled="running"
          @click="run(line)"
        >
          {{ line }}
        </button>
      </template>

      <template v-else>
        <div
          v-for="group in groups"
          :key="group.group"
          role="group"
          :aria-label="t(group.label)"
          class="flex shrink-0 items-center gap-2"
        >
          <span aria-hidden="true" class="pl-1 text-[10px] uppercase tracking-wider text-muted-foreground">{{ t(group.label) }}</span>
          <button
            v-for="command in group.commands"
            :key="command.name"
            type="button"
            :data-command="command.name"
            :class="[BUTTON, 'border-primary/40 text-foreground bg-background hover:border-primary']"
            :aria-disabled="running && command.lines.length === 1"
            :aria-label="command.lines.length > 1 ? t(m.tapShell.more).replace('{command}', command.name).replace('{n}', String(command.lines.length)) : undefined"
            @click="tap(command)"
          >
            {{ command.lines.length === 1 ? command.lines[0] : command.name
            }}<span v-if="command.lines.length > 1" aria-hidden="true" class="text-muted-foreground"> …</span>
          </button>
        </div>
      </template>
    </div>
  </nav>
</template>
