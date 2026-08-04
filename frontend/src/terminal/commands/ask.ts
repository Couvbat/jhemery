import { prefersReducedMotion } from '@/composables/useCrt'
import { messages as m } from '@/i18n/messages'
import { api, ApiError } from '@/lib/api'
import type { Localised } from '@/content/types'
import { announce } from '../achievements'
import { blank, line, wrap } from '../format'
import type { Command, OutputLine } from '../types'

/** Matches the DTO's `@Length(3, 240)`, so a too-long question never leaves the tab. */
const MIN_LENGTH = 3
const MAX_LENGTH = 240

/** Trails the answer while it streams, dropped once the model is done. */
const CURSOR = '▌'

type T = <V>(value: Localised<V>) => V

/** `ask "where does he work"` — the not-found hint suggests it quoted, so accept it. */
function unquote(value: string): string {
  const quoted = /^(["'])(.*)\1$/.exec(value)
  return quoted ? quoted[2]!.trim() : value
}

function answerLines(answer: string, streaming: boolean): OutputLine[] {
  return wrap(streaming ? `${answer}${CURSOR}` : answer).map((text) => line(text))
}

/**
 * Unconfigured, asleep and unreachable all render the same thing — one degraded
 * path rather than three, and it is the line most visitors will ever see.
 * The busy case gets its own, because "come back in a minute" is different advice.
 */
function degraded(error: unknown, t: T): OutputLine[] {
  // 503 is the backend's "someone else is asking right now"; everything else
  // (502, a network failure, an unset ASK_ENABLED) means the model is not there.
  if (error instanceof ApiError && error.status === 503) {
    return [line(t(m.ask.busy), 'muted')]
  }
  return [line(t(m.ask.asleep), 'muted'), line(t(m.ask.asleepHint), 'muted')]
}

export const askCommands: Command[] = [
  {
    name: 'ask',
    usage: 'ask <question>',
    description: {
      en: 'Ask a local model about me',
      fr: 'Poser une question à un modèle local',
    },
    group: 'live',
    palette: true,
    async run({ args, prompt, print, t, locale, frame, signal }) {
      // With no arguments this prompts, the same way `mail` does — which is what
      // makes it worth putting in the palette at all.
      const question = unquote(
        args.join(' ').trim() || (await prompt(t(m.ask.question))).trim(),
      )

      if (question.length < MIN_LENGTH) {
        return [line('ask: usage — ask <question>', 'error')]
      }
      if (question.length > MAX_LENGTH) {
        return [line(`ask: keep it under ${MAX_LENGTH} characters`, 'error')]
      }

      print([line(t(m.ask.disclaimer), 'muted'), blank])

      const draw = frame()
      draw([line(t(m.ask.thinking), 'muted')])

      // Text appearing character by character is motion, and the rule has no
      // exception for text — buffer the whole thing and print it once instead.
      const animate = !prefersReducedMotion()
      let answer = ''

      try {
        for await (const delta of api.askStream(question, locale, signal)) {
          answer += delta
          if (animate) draw(answerLines(answer, true))
        }
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          // Ctrl+C. Keep whatever arrived; the shell prints its own ^C line.
          draw(answerLines(answer.trim(), false))
          return
        }
        draw(degraded(error, t))
        return
      }

      const text = answer.trim()
      // A stream that ends without a word is a failure the visitor cannot see.
      if (!text) {
        draw(degraded(undefined, t))
        return
      }

      draw(answerLines(text, false))
      // Unlocked on a completed answer rather than on invocation, so a timed-out
      // request does not award it.
      return announce('ask', t)
    },
  },
]
