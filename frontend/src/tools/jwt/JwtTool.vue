<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLocale } from '@/i18n'
import CopyButton from '../CopyButton.vue'
import ToolFrame from '../ToolFrame.vue'
import { relative } from '../time/time'
import { decodeJwt, timeClaims, validity } from './jwt'

const { t, m, locale } = useLocale()

const input = ref('')
// Read once per paste rather than ticking: whether a token has expired is worth
// knowing at the moment it is looked at, not as a countdown.
const now = ref(new Date())
watch(input, () => {
  now.value = new Date()
})

const decoded = computed(() => (input.value.trim() ? decodeJwt(input.value) : null))

const error = computed(() => {
  const d = decoded.value
  if (!d || d.ok) return null
  if (d.error === 'segments') return t(m.toolJwt.segments)
  const segment = t(d.segment === 'header' ? m.toolJwt.header : m.toolJwt.payload)
  return t(d.error === 'base64' ? m.toolJwt.base64 : m.toolJwt.json).replace('{segment}', segment)
})

const pretty = (value: unknown) => JSON.stringify(value, null, 2)

const times = computed(() => {
  const d = decoded.value
  if (!d?.ok) return []
  return timeClaims(d.payload).map(({ claim, date }) => ({
    label: t(m.toolJwt[claim]),
    date: new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'medium' }).format(date),
    relative: relative(date, now.value, locale.value),
  }))
})

const state = computed(() => {
  const d = decoded.value
  if (!d?.ok) return null
  const v = validity(d.payload, now.value)
  const label = { expired: m.toolJwt.expired, 'not-yet': m.toolJwt.notYet, valid: m.toolJwt.valid, 'no-expiry': m.toolJwt.noExpiry }[v]
  return { text: t(label), bad: v === 'expired' || v === 'not-yet' }
})

const unsigned = computed(() => {
  const d = decoded.value
  return d?.ok && String(d.header.alg).toLowerCase() === 'none'
})
</script>

<template>
  <ToolFrame title="jwt.sh">
    <template #status>
      <span v-if="state" :class="state.bad ? 'text-destructive' : 'text-primary'">{{ state.text }}</span>
      <span v-else-if="error" class="text-destructive">{{ error }}</span>
    </template>

    <div class="space-y-1">
      <label for="jwt-input" class="text-xs text-muted-foreground">--{{ t(m.toolJwt.input) }}</label>
      <textarea
        id="jwt-input"
        v-model="input"
        rows="4"
        spellcheck="false"
        :placeholder="t(m.toolJwt.placeholder)"
        :aria-invalid="error ? 'true' : undefined"
        class="w-full rounded border bg-transparent px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none resize-y break-all"
        :class="error ? 'border-destructive' : 'border-border'"
      ></textarea>
    </div>

    <p class="text-xs text-muted-foreground">{{ t(m.toolJwt.decodeOnly) }}</p>

    <template v-if="decoded?.ok">
      <!-- The token itself, one colour per part, so a reader can see where each ends. -->
      <p class="font-mono text-xs break-all rounded border border-border p-3" data-testid="jwt-parts">
        <span class="text-accent">{{ decoded.segments[0] }}</span><span class="text-muted-foreground">.</span
        ><span class="text-primary">{{ decoded.segments[1] }}</span><span class="text-muted-foreground">.</span
        ><span class="text-muted-foreground">{{ decoded.segments[2] }}</span>
      </p>

      <p v-if="unsigned" class="text-xs text-warning border border-warning/40 rounded p-2">{{ t(m.toolJwt.unsigned) }}</p>

      <div class="grid gap-4 md:grid-cols-2">
        <div v-for="part in (['header', 'payload'] as const)" :key="part" class="space-y-1">
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <span :class="part === 'header' ? 'text-accent' : 'text-primary'">{{ t(m.toolJwt[part]) }}</span>
            <CopyButton :text="pretty(decoded[part])" />
          </div>
          <pre
            class="rounded border border-border bg-black/30 light:bg-muted px-3 py-2 font-mono text-xs overflow-x-auto"
            :class="part === 'header' ? 'text-accent' : 'text-primary'"
          >{{ pretty(decoded[part]) }}</pre>
        </div>
      </div>

      <dl v-if="times.length" class="grid gap-x-4 gap-y-1 text-xs font-mono sm:grid-cols-[auto_1fr_auto]">
        <template v-for="row in times" :key="row.label">
          <dt class="text-muted-foreground">{{ row.label }}</dt>
          <dd class="text-foreground">{{ row.date }}</dd>
          <dd class="text-muted-foreground">{{ row.relative }}</dd>
        </template>
      </dl>
    </template>
  </ToolFrame>
</template>
