<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, useId } from 'vue'
import CodeText from '@/components/CodeText.vue'
import { decorativeMotion } from '@/composables/useMotion'
import type { Localised } from '@/content/types'
import { useLocale } from '@/i18n'
import type { AskMeta } from '@/lib/api'
import {
  COLD,
  degradedCopy,
  metaLine,
  modelIsCold,
  QUESTION_MAX,
  questionProblem,
  READ_MORE,
  runAsk,
  sourceHref,
} from '@/lib/ask-session'
import { unlock } from '@/terminal/achievements'
import { askLabels as labels, askSuggestions } from './labels'

/**
 * *Ask the lab* (`docs/superpowers/specs/2026-10-15-ask-my-lab-design.md` §5): the
 * rendered `ask` widget the `ask` spec deferred, on `/lab`. An ordinary form on a page, so
 * phones get it: §10 keeps the *terminal's prompt* off phones because a fixed input fights
 * the virtual keyboard, and that reasoning doesn't reach a form in the page's flow. The
 * same endpoint and the same limit as the terminal, so the two share the five questions
 * by construction, and the same runner and copy (`lib/ask-session.ts`), so they can't
 * drift. It lives in `LabView`'s chunk; the home page pays nothing.
 */

const { t, m, locale } = useLocale()
const id = useId()

const question = ref('')
const input = ref<HTMLInputElement | null>(null)
const asking = ref(false)
const answer = ref('')
const meta = shallowRef<AskMeta | undefined>()
const failure = shallowRef<Localised[]>([])
const problem = ref<'short' | 'long' | null>(null)
const cold = ref(false)
let controller: AbortController | null = null

/** Fills the box and nothing more: sending spends one of the five. */
function suggest(words: Localised) {
  question.value = t(words)
  problem.value = null
  input.value?.focus()
}

async function send() {
  const asked = question.value.trim()
  problem.value = questionProblem(asked)
  if (problem.value || asking.value) return

  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal
  asking.value = true
  answer.value = ''
  meta.value = undefined
  failure.value = []
  cold.value = await modelIsCold()

  // Text appearing word by word is motion: paused, the answer is buffered and shown once.
  const animate = decorativeMotion() !== 'paused'
  const outcome = await runAsk(asked, locale.value, {
    signal,
    onAnswer: (sofar) => {
      if (animate) answer.value = sofar
    },
  })
  if (signal.aborted) return
  asking.value = false
  if (outcome.failed) {
    answer.value = ''
    failure.value = degradedCopy(outcome.error)
    return
  }
  answer.value = outcome.answer
  meta.value = outcome.meta
  // On a completed answer, as in the terminal: a timed-out question doesn't award it.
  unlock('ask')
}

onBeforeUnmount(() => controller?.abort())

const problemText = computed(() => (problem.value ? t(labels[problem.value]) : ''))
</script>

<template>
  <section :aria-labelledby="`${id}-heading`" class="max-w-3xl space-y-3 border border-border rounded bg-card/60 p-4 font-mono text-sm" data-api="/ask" data-testid="ask-the-lab">
    <h2 :id="`${id}-heading`" class="text-accent text-base"><span aria-hidden="true">## </span>{{ t(labels.heading) }}</h2>
    <p class="text-xs text-muted-foreground"><CodeText :text="t(labels.intro)" /></p>

    <form class="flex flex-col sm:flex-row gap-2" novalidate @submit.prevent="send">
      <label :for="`${id}-question`" class="sr-only">{{ t(labels.label) }}</label>
      <input
        :id="`${id}-question`"
        ref="input"
        v-model="question"
        type="text"
        name="question"
        :maxlength="QUESTION_MAX"
        autocomplete="off"
        :placeholder="t(labels.label)"
        :aria-invalid="problem ? 'true' : undefined"
        :aria-describedby="problem ? `${id}-problem` : undefined"
        class="flex-1 min-h-11 rounded border border-border bg-background px-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="ask-input"
      />
      <button
        type="submit"
        :disabled="asking"
        class="min-h-11 rounded border border-primary/60 px-4 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="ask-send"
      >
        {{ asking ? t(labels.asking) : t(labels.send) }}
      </button>
    </form>
    <p v-if="problem" :id="`${id}-problem`" class="text-xs text-warning" role="alert">{{ problemText }}</p>

    <div class="space-y-1.5">
      <p class="text-xs text-muted-foreground">{{ t(labels.suggestions) }}</p>
      <ul class="flex flex-wrap gap-2">
        <li v-for="words in askSuggestions" :key="words.en">
          <button
            type="button"
            class="min-h-11 sm:min-h-0 rounded border border-border px-2 py-1 text-xs text-foreground hover:border-accent hover:text-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="ask-suggestion"
            @click="suggest(words)"
          >
            {{ t(words) }}
          </button>
        </li>
      </ul>
    </div>

    <p class="text-xs text-muted-foreground"><CodeText :text="t(m.ask.disclaimer)" /></p>
    <p v-if="cold" class="text-xs text-warning">{{ t(COLD) }}</p>

    <div role="log" :aria-label="t(labels.answer)" aria-live="polite" class="space-y-2" data-testid="ask-answer">
      <p v-if="answer" class="text-foreground whitespace-pre-wrap">{{ answer }}</p>
      <p v-for="words in failure" :key="words.en" class="text-muted-foreground"><CodeText :text="t(words)" /></p>
      <template v-if="meta">
        <p class="text-xs text-muted-foreground" data-testid="ask-meta">{{ metaLine(meta, locale) }}</p>
        <div v-if="meta.sources.length" class="text-xs">
          <p class="text-muted-foreground">{{ t(READ_MORE) }}</p>
          <ul>
            <li v-for="source in meta.sources" :key="source.target">
              <a :href="sourceHref(source.target)" class="text-accent underline underline-offset-2 hover:text-primary">{{ source.title }}</a>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </section>
</template>
