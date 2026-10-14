<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useLocale } from '@/i18n'
import CopyButton from '../CopyButton.vue'
import ToolFrame from '../ToolFrame.vue'
import { browserEnvironment } from './environment'
import {
  GROUPS,
  NOT_AVAILABLE,
  ROWS,
  combinedHash,
  feeds,
  readLater,
  readNow,
  type Group,
  type Reading,
  type Verdict,
} from './fingerprint'

const { t, m } = useLocale()

/** What has been read so far; a row not in it yet is still rendering. */
const list = shallowRef<Reading[]>([])
const busy = ref(false)
/** Rows the visitor unticked: left out of the hash, to show what each one does to it. */
const excluded = reactive(new Set<string>())
const hash = ref<string | null>(null)
const noCrypto = ref(false)
let subtle: SubtleCrypto | undefined

/** Guards against a slow render from an earlier read landing after a newer one. */
let generation = 0

// Read when the panel opens and on "read again", never before: nothing else on the
// site reads these, and a page that only lists the tools must not either.
async function read() {
  const mine = ++generation
  const env = browserEnvironment()
  subtle = env.subtle
  noCrypto.value = !subtle
  list.value = readNow(env)
  busy.value = true
  try {
    const later = await readLater(env)
    if (mine === generation) list.value = [...list.value, ...later]
  } finally {
    if (mine === generation) busy.value = false
  }
}

onMounted(read)

const byId = computed(() => new Map(list.value.map((r) => [r.id, r])))

const groups = computed(() =>
  (Object.keys(GROUPS) as Group[]).map((group) => ({
    group,
    rows: ROWS.filter((row) => row.group === group).map((row) => ({ row, reading: byId.value.get(row.id) })),
  })),
)

const fed = computed(() => list.value.filter((r) => feeds(r) && !excluded.has(r.id)))
const available = computed(() => list.value.filter(feeds).length)

let hashing = 0
watch(
  [fed, busy],
  async () => {
    // Once every row is in: a hash that changed as each render landed would read as
    // the browser changing.
    if (busy.value) return
    const mine = ++hashing
    const result = await combinedHash(fed.value, subtle)
    if (mine === hashing) hash.value = result
  },
  { immediate: true },
)

function toggle(id: string) {
  if (excluded.has(id)) excluded.delete(id)
  else excluded.add(id)
}

const fedText = computed(() =>
  t(m.toolFingerprint.fed)
    .replace('{n}', String(fed.value.length))
    .replace('{total}', String(available.value)),
)

const VERDICT_TONE: Record<Verdict, string> = {
  common: 'text-primary border-primary/40',
  rare: 'text-warning border-warning/40',
  none: 'text-destructive border-destructive/40',
}
</script>

<template>
  <ToolFrame title="fingerprint.sh">
    <template #status>
      <span>{{ busy ? t(m.toolFingerprint.reading) : t(m.toolFingerprint.sent) }}</span>
    </template>

    <p class="text-xs text-muted-foreground">{{ t(m.toolFingerprint.intro) }}</p>

    <div class="space-y-1">
      <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{{ t(m.toolFingerprint.hash) }}</span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="px-2 py-0.5 text-xs font-mono rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors disabled:opacity-50"
            :disabled="busy"
            @click="read"
          >
            {{ t(m.toolFingerprint.again) }}
          </button>
          <CopyButton :text="hash ?? ''" />
        </div>
      </div>
      <p
        data-testid="fingerprint-hash"
        class="font-mono text-xs break-all rounded border border-border/60 bg-black/30 light:bg-muted px-3 py-2 min-h-8"
        :class="hash ? 'text-primary' : 'text-muted-foreground'"
      >
        {{ hash ?? (noCrypto ? t(m.toolFingerprint.noCrypto) : '—') }}
      </p>
      <p class="text-xs text-muted-foreground">{{ fedText }} {{ t(m.toolFingerprint.same) }}</p>
      <p class="text-xs text-muted-foreground">{{ t(m.toolFingerprint.noScore) }}</p>
    </div>

    <div v-for="{ group, rows } in groups" :key="group" class="space-y-2">
      <p class="text-[0.65rem] uppercase tracking-wider text-accent">{{ t(GROUPS[group]) }}</p>
      <ul class="space-y-2">
        <li
          v-for="{ row, reading: got } in rows"
          :key="row.id"
          :data-row="row.id"
          class="rounded border border-border/60 px-3 py-2 space-y-1"
        >
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label class="flex items-center gap-2 text-foreground">
              <input
                type="checkbox"
                class="accent-[var(--neon-green)]"
                :checked="!!got && feeds(got) && !excluded.has(row.id)"
                :disabled="!got || !feeds(got)"
                :aria-label="t(m.toolFingerprint.inHash).replace('{label}', t(row.label))"
                @change="toggle(row.id)"
              />
              <span>{{ t(row.label) }}</span>
            </label>
            <code class="text-[0.7rem] text-muted-foreground break-all">{{ row.source }}</code>
            <span
              class="ml-auto rounded border px-1.5 text-[0.65rem] uppercase tracking-wider whitespace-nowrap"
              :class="VERDICT_TONE[row.verdict]"
            >
              {{ t(m.toolFingerprint[row.verdict]) }}
            </span>
          </div>
          <p
            data-testid="fingerprint-value"
            class="font-mono text-sm break-all"
            :class="got?.value ? 'text-primary' : 'text-muted-foreground'"
          >
            {{ got ? (got.value ?? t(NOT_AVAILABLE)) : t(m.toolFingerprint.reading) }}
          </p>
          <p class="text-xs text-muted-foreground">{{ t(row.use) }}</p>
        </li>
      </ul>
    </div>
  </ToolFrame>
</template>
