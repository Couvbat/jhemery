import { findLabNode, labLinks } from '@/content/lab'
import type { Locale, Localised } from '@/content/types'
import type { HealthReport, LabReport } from './api'
import { age, feedOf, snapshotOf, uptime } from './lab'
import { millis } from './xray-data'

/**
 * X-ray's *this visit's path* (`docs/superpowers/specs/2026-10-15-xray-data-layer-design.md`
 * §3): the hops this visit's requests took, to the site, its API and the lab. The facts
 * come from `content/lab.ts`, so the panel and `/lab` can't tell two stories; the figures
 * from what the page already has. Pure: readings in, hops out.
 */

/** What `/cdn-cgi/trace` may leave behind: these three, and nothing else. */
export interface Trace {
  colo?: string
  http?: string
  tls?: string
}

/**
 * Each kept key with the only shape its value may take. A value that doesn't match is
 * dropped too, so a page that isn't the trace (the SPA fallback, in dev) reads as nothing.
 */
const KEPT: Record<keyof Trace, RegExp> = {
  colo: /^[A-Z]{3}$/,
  http: /^http\/[\d.]+$/,
  tls: /^(?:TLSv[\d.]+|off)$/,
}

/**
 * Reads Cloudflare's trace, keeping `colo`, `http` and `tls` and dropping every other line
 * before anything stores or renders it. The response also carries the visitor's address
 * and country, and screens get shared: the same rule that keeps `du ~` from printing secrets.
 */
export function parseTrace(text: string): Trace {
  const trace: Trace = {}
  for (const row of text.split('\n')) {
    const at = row.indexOf('=')
    if (at < 1) continue
    const key = row.slice(0, at).trim() as keyof Trace
    const value = row.slice(at + 1).trim()
    if (Object.hasOwn(KEPT, key) && KEPT[key].test(value)) trace[key] = value
  }
  return trace
}

/** The trace's words as people write them: `HTTP/3`, `TLS 1.3`. */
function protocols(trace: Trace): string[] {
  return [
    ...(trace.http ? [trace.http.toUpperCase()] : []),
    ...(trace.tls && trace.tls !== 'off' ? [trace.tls.replace('TLSv', 'TLS ')] : []),
  ]
}

export type HopId = 'visitor' | 'site' | 'api' | 'model' | 'lab'

export interface Hop {
  id: HopId
  /** The hop itself: who hands the request to whom. */
  path: string
  /** What was measured on it, when anything was. */
  detail?: string
}

export interface PathReadings {
  /** The trace once read, null when it couldn't be, undefined while it is on its way. */
  trace: Trace | null | undefined
  /** The newest API round trip this page made, from Resource Timing. */
  apiMs?: number
  health?: HealthReport | null
  lab?: LabReport | null
}

const name = (id: string) => findLabNode(id)?.name ?? id
const role = (id: string, locale: Locale) => findLabNode(id)?.role[locale] ?? ''
const say = (locale: Locale, words: Localised) => words[locale]

/**
 * The hops, in order. The model's only while `ask` is on, since that is the only request
 * that takes it; the lab's only when the API takes its pushes.
 */
export function pathHops(readings: PathReadings, locale: Locale): Hop[] {
  const fr = locale === 'fr'
  const you = fr ? 'vous' : 'you'
  const trace = readings.trace
  const visitor: Hop =
    trace === undefined
      ? { id: 'visitor', path: `${you} → Cloudflare`, detail: fr ? 'lecture de la trace…' : 'reading the trace…' }
      : trace?.colo
        ? { id: 'visitor', path: [`${you} → Cloudflare`, `colo ${trace.colo}`, ...protocols(trace)].join(', ') }
        : {
            id: 'visitor',
            path: fr ? `${you} → ce serveur` : `${you} → this server`,
            detail: fr ? 'pas derrière Cloudflare ici' : 'not behind Cloudflare here',
          }

  const hops: Hop[] = [
    visitor,
    {
      id: 'site',
      path: `${name('cloudflare')} → ${name('o2switch-site')}: ${role('o2switch-site', locale)}`,
      detail: fr ? 'fichiers statiques' : 'static files',
    },
  ]

  const apiFigures = [
    ...(readings.apiMs !== undefined ? [`${fr ? 'dernier aller-retour' : 'last round trip'} ${millis(readings.apiMs)}`] : []),
    ...(readings.health ? [`${fr ? 'en service depuis' : 'up'} ${uptime(readings.health.uptime, locale)}`] : []),
  ]
  hops.push({
    id: 'api',
    path: `${fr ? 'l’API' : 'the API'}: ${name('cloudflare')} → ${name('o2switch-api')}, ${role('o2switch-api', locale)}`,
    ...(apiFigures.length ? { detail: apiFigures.join(' · ') } : {}),
  })

  if (readings.health?.units.some((unit) => unit.unit === 'ask' && unit.state === 'active')) {
    const rule = labLinks.find((link) => link.kind === 'restricted')
    const models = snapshotOf(readings.lab)?.models
    const ollama = findLabNode('ollama')
    hops.push({
      id: 'model',
      path: [
        'NestJS',
        fr ? 'la règle restreinte de Cloudflare' : 'Cloudflare’s restricted rule',
        name('tunnel'),
        `${name('ollama')} ${fr ? 'sur' : 'on'} ${ollama?.on ?? ''}`.trim(),
      ].join(' → '),
      detail: models
        ? models.runtime === 'up'
          ? say(locale, { en: 'the model runtime is up', fr: 'le moteur du modèle tourne' })
          : say(locale, { en: 'the model runtime is down', fr: 'le moteur du modèle est arrêté' })
        : rule?.label?.[locale],
    })
  }

  const lab = readings.lab
  if (lab?.configured) {
    const push = labLinks.find((link) => link.kind === 'push')
    hops.push({
      id: 'lab',
      path: `${fr ? 'le labo' : 'the lab'} → ${fr ? 'l’API' : 'the API'}: ${push?.label?.[locale] ?? ''}`,
      detail:
        feedOf(lab) === 'empty'
          ? fr
            ? 'aucun envoi pour l’instant'
            : 'no push yet'
          : fr
            ? `dernier envoi il y a ${age(lab.ageMs ?? 0, locale)}`
            : `last push ${age(lab.ageMs ?? 0, locale)} ago`,
    })
  }
  return hops
}
