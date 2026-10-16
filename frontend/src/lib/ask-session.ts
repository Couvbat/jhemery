import type { Locale, Localised } from '@/content/types'
import { messages as m } from '@/i18n/messages'
import { api, ApiError, type AskMeta } from './api'

/**
 * What `ask` says when it can't answer, shared by the terminal's `ask` and the *Ask the
 * lab* panel on `/lab`, so the two can't drift (`docs/superpowers/specs/2026-10-15-ask-my-lab-design.md`
 * §4, §5). Every failure used to read "asleep", the sixth question in an hour included:
 * the API now names the reason, and each reads as the advice it calls for.
 */

/** The DTO's `@Length(3, 240)`, so a question the API would refuse never leaves the tab. */
export const QUESTION_MIN = 3
export const QUESTION_MAX = 240

/** What is wrong with a question before it is sent, or null when nothing is. */
export function questionProblem(question: string): 'short' | 'long' | null {
  const length = question.trim().length
  if (length < QUESTION_MIN) return 'short'
  if (length > QUESTION_MAX) return 'long'
  return null
}

/** The API's closed set, mirrored from `backend/src/ask/ask.failure.ts`. */
export type AskReason =
  | 'unconfigured'
  | 'busy'
  | 'warming'
  | 'unreachable'
  | 'refused'
  | 'upstream'
  | 'timeout'
  | 'empty'
  | 'silent'

/** Each reason as `systemctl status ask` puts it: *last failure 2 min ago: …*. */
export const REASON_WORDS: Record<AskReason, Localised> = {
  unconfigured: { en: 'no model is wired up', fr: 'aucun modèle n’est branché' },
  busy: { en: 'another question held the slot', fr: 'une autre question occupait la place' },
  warming: { en: 'the model was still loading', fr: 'le modèle chargeait encore' },
  unreachable: { en: 'the API couldn’t reach the model’s machine', fr: 'l’API n’a pas pu joindre la machine du modèle' },
  refused: { en: 'the model host’s edge refused the API', fr: 'la bordure de l’hôte du modèle a refusé l’API' },
  upstream: { en: 'the model’s machine answered with an error', fr: 'la machine du modèle a répondu par une erreur' },
  timeout: { en: 'no first word in 20 s', fr: 'aucun premier mot en 20 s' },
  empty: { en: 'the model answered nothing', fr: 'le modèle n’a rien répondu' },
  silent: { en: 'nothing came back in time', fr: 'rien n’est revenu à temps' },
}

const NOT_ANSWERING: Localised = {
  en: 'the model’s machine isn’t answering the site right now.',
  fr: 'la machine du modèle ne répond pas au site en ce moment.',
}

const WAKING: Localised = {
  en: 'the model was asleep and is waking up — ask again in a minute.',
  fr: 'le modèle dormait et se réveille — reposez la question dans une minute.',
}

const NO_MODEL: Localised = {
  en: 'there’s no model wired up here.',
  fr: 'aucun modèle n’est branché ici.',
}

/** The 429, told apart at last: the minutes when the API says them, the hour when it doesn't. */
function limited(retryAfter: number | undefined): Localised {
  if (retryAfter === undefined) {
    return {
      en: 'that’s five questions this hour — the limit resets within the hour.',
      fr: 'c’est cinq questions cette heure-ci — la limite repart dans l’heure.',
    }
  }
  const minutes = Math.max(1, Math.ceil(retryAfter / 60))
  return {
    en: `that’s five questions this hour — the limit resets in ${minutes} min.`,
    fr: `c’est cinq questions cette heure-ci — la limite repart dans ${minutes} min.`,
  }
}

function isReason(value: unknown): value is AskReason {
  return typeof value === 'string' && Object.hasOwn(REASON_WORDS, value)
}

/**
 * The lines to show, in order. Every one but the 429's ends by pointing at `mail`, which
 * reaches the human whatever the model is doing; and an error with no reason (a network
 * failure, or an API from before reasons) reads as it always did.
 */
export function degradedCopy(error: unknown): Localised[] {
  if (error instanceof ApiError) {
    if (error.status === 429) return [limited(error.retryAfter)]
    const reason = isReason(error.reason) ? error.reason : undefined
    if (reason === 'busy' || (!reason && error.status === 503)) return [m.ask.busy]
    switch (reason) {
      case 'unreachable':
      case 'refused':
      case 'upstream':
        return [NOT_ANSWERING, m.ask.asleepHint]
      case 'warming':
      case 'timeout':
      case 'empty':
      case 'silent':
        return [WAKING, m.ask.asleepHint]
      case 'unconfigured':
        return [NO_MODEL, m.ask.asleepHint]
    }
  }
  return [m.ask.asleep, m.ask.asleepHint]
}

/** How one question went: what arrived, its meta, and whether it failed or was cancelled. */
export interface AskOutcome {
  answer: string
  meta?: AskMeta
  /** Cancelled (Ctrl+C, or the page left): keep what arrived and say nothing more. */
  aborted: boolean
  /** No answer: the error, or `undefined` for a stream that ended without a word. */
  failed: boolean
  error?: unknown
}

/**
 * Runs one question: streams it, accumulates the answer, keeps the meta. `onAnswer` hears
 * the answer so far after each delta, for a caller that draws it as it comes. Shared by
 * `ask` in the terminal and the `/lab` panel, so the two can't drift.
 */
export async function runAsk(
  question: string,
  locale: Locale,
  { signal, onAnswer }: { signal?: AbortSignal; onAnswer?: (answer: string) => void } = {},
): Promise<AskOutcome> {
  let answer = ''
  let meta: AskMeta | undefined
  try {
    for await (const event of api.askStream(question, locale, signal)) {
      if ('delta' in event) {
        answer += event.delta
        onAnswer?.(answer)
      } else {
        meta = event.meta
      }
    }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return { answer: answer.trim(), meta, aborted: true, failed: false }
    return { answer: answer.trim(), meta, aborted: false, failed: true, error }
  }
  const text = answer.trim()
  // A stream that ends without a word is a failure the visitor cannot see.
  return text ? { answer: text, meta, aborted: false, failed: false } : { answer: '', meta, aborted: false, failed: true }
}

function seconds(ms: number, locale: Locale): string {
  const text = String(Math.round(ms / 100) / 10)
  return `${locale === 'fr' ? text.replace('.', ',') : text} s`
}

/**
 * The line under an answer: `gemma4:e4b · 38 tok/s · first token 0.4 s · poseidon · RTX 3080`,
 * with `~` before the rate when the runtime gave no count and the deltas were counted.
 */
export function metaLine(meta: AskMeta, locale: Locale): string {
  const fr = locale === 'fr'
  const rate =
    meta.tokensPerSecond === null
      ? []
      : [`${meta.approx ? '~' : ''}${fr ? String(meta.tokensPerSecond).replace('.', ',') : meta.tokensPerSecond} tok/s`]
  return [
    meta.model,
    ...rate,
    `${fr ? 'premier jeton' : 'first token'} ${seconds(meta.firstTokenMs, locale)}`,
    ...(meta.label ? [meta.label] : []),
  ].join(' · ')
}

/** Where a source goes: a route as it is, a command line as the `?run=` link that runs it. */
export function sourceHref(target: string): string {
  return target.startsWith('/') ? target : `/?run=${encodeURIComponent(target)}`
}

export const READ_MORE: Localised = { en: 'read more:', fr: 'pour aller plus loin :' }

export const COLD: Localised = {
  en: 'the model isn’t loaded, so the first answer may not come in time.',
  fr: 'le modèle n’est pas chargé, la première réponse risque de ne pas arriver à temps.',
}

/** How long the pre-check may take before it is skipped: never a delay worth noticing. */
export const COLD_CHECK_MS = 800

/**
 * Whether the lab says the model runtime is up with nothing resident, which is the case
 * where the first answer is a cold load and may miss the deadline. One read of a route
 * the API serves from memory; a failed, slow or stale read says nothing rather than
 * delay the question.
 */
export async function modelIsCold(timeoutMs = COLD_CHECK_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const report = await Promise.race([
      api.lab(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs)
      }),
    ])
    if (!report?.configured || !report.snapshot || report.stale) return false
    const models = report.snapshot.models
    return models?.runtime === 'up' && models.resident.length === 0
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
