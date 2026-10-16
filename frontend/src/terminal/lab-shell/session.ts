import { machines } from '@/content/hardware'
import type { LabNode } from '@/content/lab'
import type { Locale, Localised, Machine } from '@/content/types'
import type { LabMachine, LabReport } from '@/lib/api'
import { age, feedOf, poolLine, snapshotOf, uptime } from '@/lib/lab'
import { line } from '../format'
import type { OutputLine } from '../types'

/**
 * The lab shell's state (`docs/superpowers/specs/2026-10-15-lab-shell-design.md`): which
 * machine the prompt is on, the report everything reads, and the language. The report is
 * the one `GET /lab` answered, so `uptime` here and poseidon's card on `/lab` agree.
 */

/** The one account on the lab's machines. The site's own is `couvbat`; the lab's is the owner's. */
export const LAB_USER = 'jules'

export interface LabSession {
  host: LabNode
  report: LabReport | null
  /** When the report arrived, so an age read later counts the time since. */
  fetchedAt: number
  locale: Locale
}

export const tr = (session: LabSession, value: Localised): string => value[session.locale]

/** The machine's specs in `content/hardware.ts`. */
export function specsOf(host: LabNode): Machine | undefined {
  return machines.find((machine) => machine.name === host.machine)
}

export function spec(host: LabNode, key: string): string | undefined {
  return specsOf(host)?.specs.find((each) => each.key === key)?.value
}

/** Its RAM in MB, read off the spec sheet's `16 GB DDR4 …`. */
export function ramMb(host: LabNode): number | undefined {
  const match = /(\d+)\s*GB/.exec(spec(host, 'RAM') ?? '')
  return match ? Number(match[1]) * 1024 : undefined
}

/**
 * The machine's sample, or undefined when there is no reading to give: no snapshot, or
 * the machine down in it. A stale snapshot still reads, as `/lab` reads it, with the
 * banner saying how old it is.
 */
export function sampleOf(session: LabSession): LabMachine | undefined {
  const sample = snapshotOf(session.report)?.machines.find((m) => m.id === session.host.id)
  return sample?.up ? sample : undefined
}

/** The report's age now: what it was when it arrived, plus the time since. */
export function ageNow(session: LabSession, now = Date.now()): number {
  const report = session.report
  return (report?.configured ? (report.ageMs ?? 0) : 0) + Math.max(0, now - session.fetchedAt)
}

const SIMULATED: Localised = {
  en: 'simulated shell — the numbers are real, the shell isn’t.',
  fr: 'shell simulé — les chiffres sont vrais, le shell ne l’est pas.',
}

const SPECS_ONLY: Localised = {
  en: 'live feed off — what follows are specs, not readings',
  fr: 'flux en direct coupé — ce qui suit, ce sont des caractéristiques, pas des mesures',
}

const DOWN: Localised = {
  en: 'down at the last snapshot — what follows are specs, not readings',
  fr: 'hors ligne au dernier instantané — ce qui suit, ce sont des caractéristiques, pas des mesures',
}

const EXIT: Localised = { en: '`exit` to leave', fr: '`exit` pour sortir' }

/** The message of the day: what `ssh` prints on arrival and `cat /etc/motd` prints again. */
export function motd(session: LabSession): OutputLine[] {
  const { host, locale } = session
  const specs = specsOf(host)
  const model = spec(host, 'Model') ?? spec(host, 'Motherboard')
  const sample = sampleOf(session)
  const feed = feedOf(session.report)
  const ago = age(ageNow(session), locale)

  const figures = sample
    ? [
        ...(sample.uptimeSeconds !== undefined ? [`up ${uptime(sample.uptimeSeconds, locale)}`] : []),
        ...(sample.load !== undefined ? [`load ${sample.load.toFixed(2)}`] : []),
        ...(sample.pools ?? []).map((pool) => `pool ${poolLine(pool, locale)}`),
      ]
    : []
  const reading = sample
    ? line(figures.join(' · '))
    : line(tr(session, snapshotOf(session.report) ? DOWN : SPECS_ONLY), 'warning')
  const when =
    feed === 'live'
      ? line(`${locale === 'fr' ? `instantané vieux de ${ago}` : `snapshot ${ago} old`} · ${tr(session, EXIT)}`, 'muted')
      : feed === 'stale'
        ? line(
            `${locale === 'fr' ? `instantané vieux de ${ago} — le labo dort peut-être` : `snapshot ${ago} old — the lab may be asleep`} · ${tr(session, EXIT)}`,
            'warning',
          )
        : line(tr(session, EXIT), 'muted')

  return [
    line(tr(session, SIMULATED), 'accent'),
    line([host.id, specs?.os, model].filter(Boolean).join(' · '), 'primary'),
    reading,
    when,
  ]
}
