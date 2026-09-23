<script setup lang="ts">
import { ref, watch } from 'vue'
import { useLocale } from '@/i18n'
import CopyButton from '../CopyButton.vue'
import ToolFrame from '../ToolFrame.vue'
import { SCHEMES, decode, encode, type Scheme } from './encode'

const { t, m } = useLocale()

const scheme = ref<Scheme>('base64')
const plain = ref('')
const encoded = ref('')
const error = ref<string | null>(null)

/** Whichever side was typed in last is the source of truth; the other follows. */
let editing: 'plain' | 'encoded' = 'plain'

function sync() {
  error.value = null
  try {
    if (editing === 'plain') encoded.value = plain.value ? encode(scheme.value, plain.value) : ''
    else plain.value = encoded.value ? decode(scheme.value, encoded.value) : ''
  } catch {
    error.value = t(m.toolEncode.invalid).replace('{scheme}', scheme.value)
    if (editing === 'encoded') plain.value = ''
  }
}

function onPlain(event: Event) {
  editing = 'plain'
  plain.value = (event.target as HTMLTextAreaElement).value
  sync()
}

function onEncoded(event: Event) {
  editing = 'encoded'
  encoded.value = (event.target as HTMLTextAreaElement).value
  sync()
}

watch(scheme, sync)
</script>

<template>
  <ToolFrame title="encode.sh">
    <div class="flex flex-wrap items-center gap-2 text-xs" role="tablist">
      <span class="text-muted-foreground">--{{ t(m.toolEncode.scheme) }}</span>
      <button
        v-for="option in SCHEMES"
        :key="option"
        type="button"
        role="tab"
        :aria-selected="scheme === option"
        class="px-3 py-1 rounded border transition-colors"
        :class="scheme === option ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'"
        @click="scheme = option"
      >
        {{ option }}
      </button>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <div class="space-y-1">
        <div class="flex items-center justify-between text-xs text-muted-foreground">
          <label for="encode-plain">{{ t(m.tools.input) }}</label>
          <CopyButton :text="plain" />
        </div>
        <textarea
          id="encode-plain"
          :value="plain"
          rows="8"
          spellcheck="false"
          :placeholder="t(m.toolEncode.placeholder)"
          class="w-full rounded border border-border bg-transparent px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none resize-y"
          @input="onPlain"
        ></textarea>
      </div>
      <div class="space-y-1">
        <div class="flex items-center justify-between text-xs text-muted-foreground">
          <label for="encode-encoded">{{ scheme }}</label>
          <CopyButton :text="encoded" />
        </div>
        <textarea
          id="encode-encoded"
          :value="encoded"
          rows="8"
          spellcheck="false"
          :placeholder="t(m.toolEncode.placeholder)"
          :aria-invalid="error ? 'true' : undefined"
          class="w-full rounded border bg-transparent px-3 py-2 font-mono text-sm text-accent placeholder:text-muted-foreground focus:border-primary outline-none resize-y break-all"
          :class="error ? 'border-destructive' : 'border-border'"
          @input="onEncoded"
        ></textarea>
        <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
      </div>
    </div>
  </ToolFrame>
</template>
