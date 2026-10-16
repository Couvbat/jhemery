import { decorativeMotion } from '@/composables/useMotion'
import type { LabReport } from '@/lib/api'
import { age, celsius, feedOf, gigabytes, percent, poolLine } from '@/lib/lab'
import { line } from '../format'
import { abortError } from '../timing'
import type { CommandContext, OutputLine } from '../types'
import { ageNow, ramMb, sampleOf, type LabSession } from './session'

/**
 * `glances` inside the lab shell: one redrawn frame of the machine's figures. It
 * refetches every 10 s while open, because the API's own copy changes once a minute and
 * that is often enough to see it move. `q` or Esc leaves it for the shell's prompt, `r`
 * refetches now, and at paused motion it draws once and redraws only on `r`.
 */

export const GLANCES_REFRESH_MS = 10_000

const BAR = 20

function bar(fraction: number): string {
  const filled = Math.round(Math.min(1, Math.max(0, fraction)) * BAR)
  return `[${'|'.repeat(filled)}${' '.repeat(BAR - filled)}]`
}

export function glancesLines(session: LabSession, now = Date.now()): OutputLine[] {
  const { host, locale } = session
  const fr = locale === 'fr'
  const feed = feedOf(session.report)
  const header = `glances · ${host.id} · ${
    feed === 'live' || feed === 'stale'
      ? fr
        ? `instantané vieux de ${age(ageNow(session, now), locale)}`
        : `snapshot ${age(ageNow(session, now), locale)} old`
      : fr
        ? 'flux coupé'
        : 'feed off'
  } · ${fr ? 'q pour quitter, r pour rafraîchir' : 'q to quit, r to refresh'}`
  const sample = sampleOf(session)
  if (!sample) {
    return [
      line(header, 'primary'),
      line(fr ? 'aucune mesure à afficher' : 'nothing to show: no reading for this machine', 'warning'),
    ]
  }
  const row = (label: string, value: string, tone: OutputLine['tone'] = 'default'): OutputLine => ({
    text: `${label.padEnd(6)}${value}`,
    tone,
    pre: true,
  })
  const total = ramMb(host)
  return [
    line(header, feed === 'stale' ? 'warning' : 'primary'),
    ...(sample.cpu !== undefined ? [row('CPU', `${bar(sample.cpu / 100)} ${percent(sample.cpu, locale)}`)] : []),
    ...(sample.memory !== undefined
      ? [
          row(
            'MEM',
            `${bar(sample.memory / 100)} ${percent(sample.memory, locale)}${
              total !== undefined ? ` ${fr ? 'sur' : 'of'} ${gigabytes(total, locale)}` : ''
            }`,
          ),
        ]
      : []),
    ...(sample.load !== undefined ? [row('LOAD', sample.load.toFixed(2))] : []),
    ...(sample.tempC?.cpu !== undefined || sample.tempC?.gpu !== undefined
      ? [
          row(
            'TEMP',
            [
              sample.tempC.cpu !== undefined ? `cpu ${celsius(sample.tempC.cpu)}` : '',
              sample.tempC.gpu !== undefined ? `gpu ${celsius(sample.tempC.gpu)}` : '',
            ]
              .filter(Boolean)
              .join(' · '),
          ),
        ]
      : []),
    ...(sample.pools ?? []).map((pool) => row('POOL', `${bar(pool.used)} ${poolLine(pool, locale)}`)),
    ...(sample.gpu
      ? [
          row(
            'GPU',
            `${bar(sample.gpu.util / 100)} ${percent(sample.gpu.util, locale)} · VRAM ${gigabytes(sample.gpu.vramUsedMb, locale)} / ${gigabytes(sample.gpu.vramTotalMb, locale)}`,
          ),
        ]
      : []),
  ]
}

/**
 * Runs the view until `q` or Esc, refetching through `fetch`, which answers null when the
 * API doesn't. Ctrl+C rejects with an `AbortError`, which ends the whole shell: it is
 * the command's signal, not the view's.
 */
export function glances(
  ctx: CommandContext,
  session: LabSession,
  fetch: () => Promise<LabReport | null>,
): Promise<void> {
  const draw = ctx.frame()
  const paint = () => draw(glancesLines(session))
  paint()

  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setInterval> | undefined
    let release = () => {}
    const finish = (error?: Error) => {
      if (timer !== undefined) clearInterval(timer)
      ctx.signal.removeEventListener('abort', onAbort)
      release()
      if (error) reject(error)
      else resolve()
    }
    const onAbort = () => finish(abortError())
    const refetch = async () => {
      const report = await fetch()
      // A report that failed keeps the one on screen: the view goes on showing the last
      // figures it had, with their age still counting.
      if (report) {
        session.report = report
        session.fetchedAt = Date.now()
      }
      if (!ctx.signal.aborted) paint()
    }

    if (ctx.signal.aborted) return finish(abortError())
    ctx.signal.addEventListener('abort', onAbort, { once: true })
    release = ctx.capture(
      (key) => {
        if (key === 'q' || key === 'Escape') finish()
        else if (key === 'r') void refetch()
      },
      { escape: true },
    )
    if (decorativeMotion() !== 'paused') timer = setInterval(() => void refetch(), GLANCES_REFRESH_MS)
  })
}
