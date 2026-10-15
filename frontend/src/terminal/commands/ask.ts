import { decorativeMotion } from '@/composables/useMotion'
import { messages as m } from '@/i18n/messages'
import { api } from '@/lib/api'
import { COLD, degradedCopy, modelIsCold } from '@/lib/ask-session'
import type { Localised } from '@/content/types'
import { announce } from '../achievements'
import { blank, fail, line, wrap } from '../format'
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
 * The line for whatever went wrong, by the reason the API names: one wording per piece
 * of advice, shared with the `/lab` panel through `lib/ask-session.ts`.
 */
function degraded(error: unknown, t: T): OutputLine[] {
  return degradedCopy(error).map((words) => line(t(words), 'muted'))
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
    writes: 'server',
    palette: true,
    async run({ args, prompt, print, t, locale, frame, signal }) {
      // With no arguments this prompts, the same way `mail` does — which is what
      // makes it worth putting in the palette at all.
      const question = unquote(
        args.join(' ').trim() || (await prompt(t(m.ask.question))).trim(),
      )

      if (question.length < MIN_LENGTH) {
        return [fail('ask: usage — ask <question>')]
      }
      if (question.length > MAX_LENGTH) {
        return [fail(`ask: keep it under ${MAX_LENGTH} characters`)]
      }

      print([line(t(m.ask.disclaimer), 'muted'), blank])
      // A cold model is the one failure worth warning of before it happens.
      if (await modelIsCold()) print(line(t(COLD), 'warning'))

      const draw = frame()
      draw([line(t(m.ask.thinking), 'muted')])

      // Text appearing character by character is motion, and the rule has no
      // exception for text — with motion paused, buffer the whole thing and print it
      // once instead. `calm` keeps it: the visitor asked for this answer by name.
      const animate = decorativeMotion() !== 'paused'
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
