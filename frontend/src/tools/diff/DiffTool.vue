<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocale } from '@/i18n'
import { diffTrimmed, tooBigToDiff, unifiedDiff, unifiedHunks } from '@/terminal/diff'
import CopyButton from '../CopyButton.vue'
import ToolFrame from '../ToolFrame.vue'

const { t, m } = useLocale()

const left = ref('cat about.txt\nls -a\ncat .secret\n')
const right = ref('cat about.txt\nls -la\ncat .secret\ncat .env\n')

/** Lines, without the phantom empty last line a trailing newline would add. */
const lines = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')

const a = computed(() => lines(left.value))
const b = computed(() => lines(right.value))
const tooBig = computed(() => tooBigToDiff(a.value, b.value))

// The same `diffLines` the terminal's `diff` command runs, with the shared head and
// tail trimmed first, so the page and the shell cannot disagree about a change.
const hunks = computed(() => (tooBig.value ? [] : unifiedHunks(diffTrimmed(a.value, b.value))))
const text = computed(() => (tooBig.value ? '' : unifiedDiff(a.value, b.value, { from: t(m.toolDiff.from), to: t(m.toolDiff.to) })))

const counts = computed(() => {
  const ops = hunks.value.flatMap((hunk) => hunk.ops)
  return { add: ops.filter((op) => op.kind === 'add').length, remove: ops.filter((op) => op.kind === 'remove').length }
})

const TONE = { same: 'text-muted-foreground', add: 'text-success bg-success/10', remove: 'text-destructive bg-destructive/10' } as const
const SIGN = { same: ' ', add: '+', remove: '-' } as const
</script>

<template>
  <ToolFrame title="diff.sh">
    <template #status>
      <span v-if="tooBig" class="text-destructive">{{ t(m.toolDiff.tooBig) }}</span>
      <span v-else-if="!hunks.length" class="text-primary">{{ t(m.toolDiff.identical) }}</span>
      <span v-else class="font-mono">
        <span class="text-success">+{{ counts.add }}</span> <span class="text-destructive">−{{ counts.remove }}</span>
      </span>
    </template>

    <div class="grid gap-4 md:grid-cols-2">
      <div class="space-y-1">
        <label for="diff-from" class="text-xs text-muted-foreground">--{{ t(m.toolDiff.from) }}</label>
        <textarea
          id="diff-from"
          v-model="left"
          rows="10"
          spellcheck="false"
          class="w-full rounded border border-border bg-transparent px-3 py-2 font-mono text-sm text-foreground focus:border-primary outline-none resize-y"
        ></textarea>
      </div>
      <div class="space-y-1">
        <label for="diff-to" class="text-xs text-muted-foreground">--{{ t(m.toolDiff.to) }}</label>
        <textarea
          id="diff-to"
          v-model="right"
          rows="10"
          spellcheck="false"
          class="w-full rounded border border-border bg-transparent px-3 py-2 font-mono text-sm text-foreground focus:border-primary outline-none resize-y"
        ></textarea>
      </div>
    </div>

    <div v-if="hunks.length" class="space-y-1">
      <div class="flex items-center justify-between text-xs text-muted-foreground">
        <span>diff -u</span>
        <CopyButton :text="text" />
      </div>
      <pre
        data-testid="diff-output"
        class="rounded border border-border bg-black/30 light:bg-muted py-2 font-mono text-sm overflow-x-auto"
      ><template v-for="(hunk, h) in hunks" :key="h"><span class="block px-3 text-accent">{{ hunk.header }}</span><span v-for="(op, i) in hunk.ops" :key="i" :class="['block px-3', TONE[op.kind]]">{{ SIGN[op.kind] }}{{ op.text }}</span></template></pre>
    </div>

    <p class="text-xs text-muted-foreground">{{ t(m.toolDiff.note) }}</p>
  </ToolFrame>
</template>
