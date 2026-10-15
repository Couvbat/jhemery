import type { LabNode } from '@/content/lab'
import type { Locale, Localised } from '@/content/types'
import type { LabMachine, LabReport, LabSnapshot } from './api'

/**
 * The lab snapshot, read: a node's state and its figures, in both languages. `/lab`, the
 * `lab` command and the lab shell all format through here, so they can't disagree about
 * poseidon's uptime. Pure: a report in, words out.
 */

/**
 * What the feed as a whole is worth: `live` (fresh), `stale` (five minutes without a
 * push), `empty` (on, but nothing pushed yet), `off` (the API isn't configured for it) or
 * `unreachable` (the API didn't answer). Null is how a caller says the API didn't answer.
 */
export type LabFeed = 'live' | 'stale' | 'empty' | 'off' | 'unreachable'

export function feedOf(report: LabReport | null | undefined): LabFeed {
  if (!report) return 'unreachable'
  if (!report.configured) return 'off'
  if (!report.snapshot) return 'empty'
  return report.stale ? 'stale' : 'live'
}

/** The snapshot when there is one worth reading, stale or not. */
export function snapshotOf(report: LabReport | null | undefined): LabSnapshot | null {
  return report?.configured ? report.snapshot : null
}

/**
 * A node's state. `none` is for the two nodes that have no status: the visitor and the
 * private network, which the map draws but never measures.
 */
export type NodeState = 'up' | 'down' | 'degraded' | 'stale' | 'nodata' | 'none'

export const STATE_WORDS: Record<Exclude<NodeState, 'none'>, Localised> = {
  up: { en: 'up', fr: 'en ligne' },
  down: { en: 'down', fr: 'hors ligne' },
  degraded: { en: 'degraded', fr: 'dégradé' },
  stale: { en: 'stale', fr: 'périmé' },
  nodata: { en: 'no data', fr: 'pas de données' },
}

const UNHEALTHY_POOL = new Set(['DEGRADED', 'FAULTED', 'OFFLINE', 'UNAVAIL'])

export function machineState(machine: LabMachine | undefined): NodeState {
  if (!machine) return 'nodata'
  if (!machine.up) return 'down'
  return machine.pools?.some((pool) => pool.health && UNHEALTHY_POOL.has(pool.health)) ? 'degraded' : 'up'
}

/**
 * Only what was measured. The site and Cloudflare are up because this page came
 * through them; the API is up when it answered. Everything on the lab's side reads the
 * snapshot, and with the snapshot stale it is all `stale`, never `down`: the API can't
 * tell a sleeping lab from a broken push. `undefined` is a report not asked for yet,
 * which says nothing about the API either way.
 */
export function nodeState(node: LabNode, report: LabReport | null | undefined): NodeState {
  if (node.kind === 'visitor' || node.kind === 'private') return 'none'
  if (node.id === 'o2switch-site' || node.id === 'cloudflare') return 'up'
  if (node.id === 'o2switch-api') return report === undefined ? 'nodata' : report ? 'up' : 'down'

  const snapshot = snapshotOf(report)
  if (!snapshot) return 'nodata'
  if (feedOf(report) === 'stale') return 'stale'

  if (node.kind === 'machine') return machineState(snapshot.machines.find((m) => m.id === node.id))
  const service = snapshot.services.find((s) => s.id === node.id)
  if (service) return service.status === 'up' ? 'up' : service.status === 'down' ? 'down' : 'degraded'
  switch (node.id) {
    case 'tunnel':
      return snapshot.tunnel ? (snapshot.tunnel.healthy ? 'up' : 'down') : 'nodata'
    case 'ollama':
      return snapshot.models ? (snapshot.models.runtime === 'up' ? 'up' : 'down') : 'nodata'
    // A fresh snapshot is the agent's own heartbeat.
    case 'lab-agent':
      return 'up'
    case 'glances':
      return snapshot.machines.some((m) => m.cpu !== undefined) ? 'up' : 'nodata'
    default:
      return 'nodata'
  }
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

function decimal(n: number, digits: number, locale: Locale): string {
  const text = String(Math.round(n * 10 ** digits) / 10 ** digits)
  return locale === 'fr' ? text.replace('.', ',') : text
}

/** `8 %`, `99.2 %` (`99,2 %` in French). */
export function percent(n: number, locale: Locale, digits = 0): string {
  return `${decimal(n, digits, locale)} %`
}

export function celsius(n: number): string {
  return `${Math.round(n)} °C`
}

export function millis(n: number): string {
  return `${Math.round(n)} ms`
}

/** `10 GB`, `2.1 GB` (`2,1 Go` in French). */
export function gigabytes(mb: number, locale: Locale): string {
  const gb = mb / 1024
  return `${decimal(gb, gb >= 10 ? 0 : 1, locale)} ${locale === 'fr' ? 'Go' : 'GB'}`
}

/** An uptime at a glance: `12 days`, `5 h`, `3 min`. */
export function uptime(seconds: number, locale: Locale): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h`
  const days = Math.floor(hours / 24)
  return locale === 'fr' ? `${days} jours` : `${days} days`
}

/** A snapshot's age: `42 s`, `3 min`, `3 h`, `2 d` (`2 j`). */
export function age(ms: number, locale: Locale): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.floor(hours / 24)} ${locale === 'fr' ? 'j' : 'd'}`
}

/** `tank ONLINE, 61 % used`, or the fill alone when only Glances saw the pool. */
export function poolLine(pool: NonNullable<LabMachine['pools']>[number], locale: Locale): string {
  const fill = `${percent(pool.used * 100, locale)} ${locale === 'fr' ? 'occupé' : 'used'}`
  return pool.health ? `${pool.name} ${pool.health}, ${fill}` : `${pool.name}, ${fill}`
}

/** The card's one or two live figures: CPU and temperature for a machine, latency for a service. */
export function nodeFigures(node: LabNode, report: LabReport | null | undefined, locale: Locale): string[] {
  const snapshot = snapshotOf(report)
  if (!snapshot) return []
  if (node.kind === 'machine') {
    const machine = snapshot.machines.find((m) => m.id === node.id)
    if (!machine?.up) return []
    return [
      ...(machine.cpu !== undefined ? [`CPU ${percent(machine.cpu, locale)}`] : []),
      ...(machine.tempC?.cpu !== undefined ? [celsius(machine.tempC.cpu)] : []),
    ]
  }
  const service = snapshot.services.find((s) => s.id === node.id)
  if (service?.status === 'maintenance') return ['maintenance']
  if (service?.latencyMs !== undefined) return [millis(service.latencyMs)]
  if (node.id === 'tunnel' && snapshot.tunnel) {
    const n = snapshot.tunnel.connections
    return [locale === 'fr' ? `${n} connexion${n > 1 ? 's' : ''}` : `${n} connection${n === 1 ? '' : 's'}`]
  }
  if (node.id === 'ollama' && snapshot.models?.runtime === 'up') {
    const n = snapshot.models.resident.length
    return [locale === 'fr' ? `${n} chargé${n > 1 ? 's' : ''}` : `${n} loaded`]
  }
  return []
}

/** The 30 days' average, over the days there is data for. Null with no data at all. */
export function uptimeAverage(days: readonly (number | null)[] | undefined): number | null {
  const known = (days ?? []).filter((d): d is number => d !== null)
  return known.length ? known.reduce((sum, d) => sum + d, 0) / known.length : null
}

/** What the 30-day bar says, for whoever can't see it: `30-day uptime 99.2 %`. */
export function uptimeSummary(days: readonly (number | null)[] | undefined, locale: Locale): string {
  const average = uptimeAverage(days)
  if (average === null) return locale === 'fr' ? 'aucune donnée sur 30 jours' : 'no data in 30 days'
  const value = percent(average * 100, locale, average === 1 ? 0 : 1)
  return locale === 'fr' ? `disponibilité sur 30 jours : ${value}` : `30-day uptime ${value}`
}

/** One line on what the colours are worth right now, for the strip above the map and the command. */
export function feedLine(report: LabReport | null | undefined, locale: Locale): string {
  const fr = locale === 'fr'
  const ago = age(report?.configured ? (report.ageMs ?? 0) : 0, locale)
  switch (feedOf(report)) {
    case 'unreachable':
      return fr ? 'l’API ne répond pas' : 'the API can’t be reached'
    case 'off':
      return fr ? 'les données en direct sont coupées ici' : 'live data is off here'
    case 'empty':
      return fr ? 'le labo n’a encore rien envoyé' : 'the lab hasn’t reported yet'
    case 'stale':
      return fr ? `vu pour la dernière fois il y a ${ago} — le labo dort peut-être` : `last seen ${ago} ago — the lab may be asleep`
    case 'live':
      return fr ? `en direct · instantané vieux de ${ago}` : `live · snapshot ${ago} old`
  }
}
