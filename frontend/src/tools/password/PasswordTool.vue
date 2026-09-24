<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useLocale } from '@/i18n'
import { loadTypingWords } from '@/terminal/games/words'
import CopyButton from '../CopyButton.vue'
import ToolFrame from '../ToolFrame.vue'
import {
  entropyBits,
  generatePassphrase,
  generatePassword,
  poolSize,
  strength,
  type PassphraseOptions,
  type PasswordOptions,
  type Strength,
} from './password'

const { t, m, locale } = useLocale()

type Mode = 'password' | 'passphrase'
const mode = ref<Mode>('password')

const options = reactive<PasswordOptions>({
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  ambiguous: true,
})
const phrase = reactive<PassphraseOptions>({
  count: 5,
  separator: '-',
  capitalise: false,
  number: false,
})

/** The typing game's common-word list for the current locale — the same lazy chunk
 *  `wpm` fetches, so a visitor who has played it pays nothing here. */
const words = ref<string[]>([])
const loading = ref(false)
async function ensureWords() {
  if (words.value.length) return
  loading.value = true
  try {
    words.value = await loadTypingWords(locale.value)
  } finally {
    loading.value = false
  }
}

const output = ref('')

async function generate() {
  if (mode.value === 'password') {
    output.value = generatePassword(options)
    return
  }
  await ensureWords()
  output.value = generatePassphrase(words.value, phrase)
}

const bits = computed(() => {
  if (mode.value === 'password') return entropyBits(poolSize(options), options.length)
  // A digit on one of `count` words adds the choice of word and of digit.
  const extra = phrase.number ? Math.log2(10 * phrase.count) : 0
  return entropyBits(words.value.length, phrase.count) + extra
})
const grade = computed<Strength>(() => strength(bits.value))

const GRADE_CLASS: Record<Strength, string> = {
  weak: 'bg-destructive',
  fair: 'bg-warning',
  strong: 'bg-primary',
  excellent: 'bg-accent',
}

// Every knob regenerates: a generator that keeps showing a password built with the
// old rules invites copying the wrong one.
watch([mode, options, phrase], () => void generate())
watch(locale, () => {
  words.value = []
  if (mode.value === 'passphrase') void generate()
})
onMounted(() => void generate())
</script>

<template>
  <ToolFrame title="password.sh">
    <template #status>
      <span v-if="loading">{{ t(m.tools.working) }}</span>
    </template>

    <div class="flex flex-wrap items-center gap-2 text-xs" role="tablist">
      <button
        v-for="option in ['password', 'passphrase'] as const"
        :key="option"
        type="button"
        role="tab"
        :aria-selected="mode === option"
        class="px-3 py-1 rounded border transition-colors"
        :class="mode === option ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'"
        @click="mode = option"
      >
        --{{ t(m.toolPassword[option]) }}
      </button>
    </div>

    <div v-if="mode === 'password'" class="grid gap-4 sm:grid-cols-2">
      <div class="space-y-1">
        <label for="password-length" class="text-xs text-muted-foreground">
          --{{ t(m.toolPassword.length) }} <span class="text-foreground">{{ options.length }}</span>
        </label>
        <input
          id="password-length"
          v-model.number="options.length"
          type="range"
          min="8"
          max="64"
          class="w-full h-9 accent-[var(--neon-green)]"
        />
      </div>
      <fieldset class="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground items-center">
        <label v-for="cls in ['lower', 'upper', 'digits', 'symbols'] as const" :key="cls" class="flex items-center gap-1.5">
          <input v-model="options[cls]" type="checkbox" class="accent-[var(--neon-green)]" />
          <span class="font-mono">{{ t(m.toolPassword[cls]) }}</span>
        </label>
        <label class="flex items-center gap-1.5 basis-full">
          <input v-model="options.ambiguous" type="checkbox" class="accent-[var(--neon-green)]" />
          <span>{{ t(m.toolPassword.ambiguous) }}</span>
        </label>
      </fieldset>
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2">
      <div class="space-y-1">
        <label for="passphrase-count" class="text-xs text-muted-foreground">
          --{{ t(m.toolPassword.words) }} <span class="text-foreground">{{ phrase.count }}</span>
        </label>
        <input
          id="passphrase-count"
          v-model.number="phrase.count"
          type="range"
          min="3"
          max="10"
          class="w-full h-9 accent-[var(--neon-green)]"
        />
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground items-center">
        <label class="flex items-center gap-1.5">
          <span>--{{ t(m.toolPassword.separator) }}</span>
          <select
            v-model="phrase.separator"
            class="h-7 rounded border border-border bg-transparent px-2 text-xs text-foreground focus:border-primary outline-none"
          >
            <option value="-" class="bg-card">-</option>
            <option value=" " class="bg-card">{{ t(m.toolPassword.space) }}</option>
            <option value="." class="bg-card">.</option>
            <option value="_" class="bg-card">_</option>
            <option value="" class="bg-card">{{ t(m.toolPassword.none) }}</option>
          </select>
        </label>
        <label class="flex items-center gap-1.5">
          <input v-model="phrase.capitalise" type="checkbox" class="accent-[var(--neon-green)]" />
          <span>{{ t(m.toolPassword.capitalise) }}</span>
        </label>
        <label class="flex items-center gap-1.5">
          <input v-model="phrase.number" type="checkbox" class="accent-[var(--neon-green)]" />
          <span>{{ t(m.toolPassword.number) }}</span>
        </label>
      </div>
    </div>

    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <output
          class="flex-1 min-h-11 rounded border border-primary/40 bg-black/30 light:bg-muted px-3 py-2 font-mono text-base text-primary break-all select-all"
          aria-live="polite"
          >{{ output || '—' }}</output
        >
        <CopyButton :text="output" />
        <button
          type="button"
          class="h-9 px-3 rounded border border-primary/50 text-primary text-sm hover:bg-primary/10 transition-colors"
          @click="generate"
        >
          {{ t(m.toolPassword.generate) }}
        </button>
      </div>
      <div class="flex items-center gap-3 text-xs text-muted-foreground">
        <div class="flex-1 h-1.5 rounded bg-border/60 overflow-hidden" aria-hidden="true">
          <div
            class="h-full transition-all"
            :class="GRADE_CLASS[grade]"
            :style="{ width: `${Math.min(100, (bits / 128) * 100)}%` }"
          ></div>
        </div>
        <span>{{ t(m.toolPassword.bits).replace('{bits}', String(Math.round(bits))) }}</span>
        <span class="font-semibold text-foreground">{{ t(m.toolPassword[grade]) }}</span>
      </div>
    </div>

    <p class="text-xs text-muted-foreground">{{ t(m.toolPassword.note) }}</p>
  </ToolFrame>
</template>
