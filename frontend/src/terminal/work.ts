import { noteSlug, type Localised, type WorkPart } from '@/content'
import { resolvePath } from '@/composables/useViewSwing'
import { messages } from '@/i18n/messages'
import { docUrl, isNote, sourceUrl } from '@/lib/source'
import { blank, line, link, pre } from './format'
import { isGame } from './games/scores'
import type { OutputLine } from './types'

/**
 * A case study's `try` as a link: a place on the site as its own URL, anything else as
 * a `?run=` link to the command line, which a link can only run if it is linkable
 * (`work.spec.ts` holds every `try` to that).
 */
export function tryHref(target: string): string {
  const resolved = resolvePath(target)
  if (resolved?.kind === 'section') return `/#${resolved.section.id}`
  if (resolved) return `/${target.replace(/^[~/]+/, '')}`
  return `/?run=${encodeURIComponent(target)}`
}

/** A case study's figure, in the reader's language where it has words in it. */
export function figure(value: string | Localised, t: <T>(value: Localised<T>) => T): string {
  return typeof value === 'string' ? value : t(value)
}

/**
 * How the design link reads: a spec is a note on this site; features-spec and the roadmap
 * are files on GitHub, so the link names the file and promises no note.
 */
export function designLabel(part: WorkPart, t: <T>(value: Localised<T>) => T): string {
  const m = messages.work
  return isNote(part.spec.doc)
    ? `${t(m.design)} → ${noteSlug(part.spec.doc)}`
    : `${t(m.designDoc)} → ${part.spec.doc.split('/').pop()}`
}

/** Whether `try` names a place on the site rather than a command line. */
export function triesPath(target: string): boolean {
  return resolvePath(target) !== undefined
}

/**
 * Whether a phone can follow `try`: a place always, and a command line unless it starts a
 * game, which needs the keyboard the touch layout hasn't got (`wordle daily`). The case
 * study's page reads this and mustn't load the registry to ask it, so `tap.spec.ts`
 * holds it to the touch layout's own rule, `tapRuns`, for every case study.
 */
export function triesOnPhone(target: string): boolean {
  return triesPath(target) || !isGame(target.trim().split(/\s+/)[0] ?? '')
}

/**
 * The one rendering of a case study in the shell: `projects <id>` and `cat projects/<id>.md`.
 * `sha` is for the tests; a build links the commit it came from.
 */
export function workLines(part: WorkPart, t: <T>(value: Localised<T>) => T, sha?: string): OutputLine[] {
  const m = messages.work
  const width = part.numbers.reduce((max, n) => Math.max(max, t(n.label).length), 0)
  return [
    line(t(part.name), 'primary'),
    line(t(part.summary)),
    blank,
    line(t(m.hard), 'accent'),
    ...t(part.hard).map((paragraph) => line(`  ${paragraph}`)),
    ...(part.numbers.length
      ? [blank, ...part.numbers.map((n) => pre(`  ${t(n.label).padEnd(width)}  ${figure(n.value, t)}`, 'muted'))]
      : []),
    blank,
    ...(part.try ? [link(`  ${t(m.tryIt)} → ${part.try}`, tryHref(part.try))] : []),
    ...part.code.map((path) => link(`  ${path}`, sourceUrl(path, sha))),
    link(`  ${designLabel(part, t)}`, docUrl(part.spec, sha)),
    ...(part.decisions ?? []).map((id) => link(`  why ${id}`, `/?run=${encodeURIComponent(`why ${id}`)}`)),
  ]
}
