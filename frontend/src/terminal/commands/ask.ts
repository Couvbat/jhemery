import { decorativeMotion } from '@/composables/useMotion'
import { messages as m } from '@/i18n/messages'
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
import type { AskMeta } from '@/lib/api'
import type { Locale, Localised } from '@/content/types'
import { announce } from '../achievements'
import { blank, fail, line, link, wrap } from '../format'
import type { Command, OutputLine } from '../types'

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

/**
 * Under the answer, muted: which model wrote it and how fast, then the pages it drew from
 * as links, the way `why` prints its own. The sources come from retrieval, not from the
 * model's text, so none is a page that doesn't exist.
 */
function work(meta: AskMeta | undefined, locale: Locale, t: T): OutputLine[] {
  if (!meta) return []
  return [
    blank,
    line(metaLine(meta, locale), 'muted'),
    ...(meta.sources.length
      ? [line(t(READ_MORE), 'muted'), ...meta.sources.map((source) => link(`  ${source.title}`, sourceHref(source.target)))]
      : []),
  ]
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

      // The DTO's limits, shared with the `/lab` panel so the two refuse the same things.
      const problem = questionProblem(question)
      if (problem === 'short') return [fail('ask: usage — ask <question>')]
      if (problem === 'long') return [fail(`ask: keep it under ${QUESTION_MAX} characters`)]

      print([line(t(m.ask.disclaimer), 'muted'), blank])
      // A cold model is the one failure worth warning of before it happens.
      if (await modelIsCold()) print(line(t(COLD), 'warning'))

      const draw = frame()
      draw([line(t(m.ask.thinking), 'muted')])

      // Text appearing character by character is motion, and the rule has no
      // exception for text — with motion paused, buffer the whole thing and print it
      // once instead. `calm` keeps it: the visitor asked for this answer by name.
      const animate = decorativeMotion() !== 'paused'
      const outcome = await runAsk(question, locale, {
        signal,
        onAnswer: (answer) => {
          if (animate) draw(answerLines(answer, true))
        },
      })

      if (outcome.aborted) {
        // Ctrl+C. Keep whatever arrived; the shell prints its own ^C line.
        draw(answerLines(outcome.answer, false))
        return
      }
      if (outcome.failed) {
        draw(degraded(outcome.error, t))
        return
      }

      draw([...answerLines(outcome.answer, false), ...work(outcome.meta, locale, t)])
      // Unlocked on a completed answer rather than on invocation, so a timed-out
      // request does not award it.
      return announce('ask', t)
    },
  },
]
