import type { Localised } from '@/content/types'
import { api, type HealthReport, type UnitHealth } from '@/lib/api'
import { blank, line, segmented } from '../format'
import type { Command, CommandContext, OutputLine, Tone } from '../types'

/**
 * `systemctl status` over `GET /health`. The unit list is kept here too, in the
 * backend's order, because the one case that matters most is the one where the API
 * cannot say what its units are: with it down, every unit reads `unknown`, which is
 * the true answer, and the table still has every row.
 */
export const UNITS: Array<{ unit: string; description: Localised }> = [
  { unit: 'steam', description: { en: 'Steam activity', fr: 'Activité Steam' } },
  { unit: 'github', description: { en: 'GitHub commits, heatmap and builds', fr: 'Commits, carte et builds GitHub' } },
  { unit: 'weather', description: { en: 'The weather where Jules is', fr: 'La météo là où est Jules' } },
  { unit: 'markets', description: { en: 'Crypto prices', fr: 'Cours des cryptos' } },
  { unit: 'presence', description: { en: 'How many people are here', fr: 'Combien de personnes sont là' } },
  { unit: 'stats', description: { en: 'Shell session counter', fr: 'Compteur de sessions du shell' } },
  { unit: 'guestbook', description: { en: 'The guestbook', fr: 'Le livre d’or' } },
  { unit: 'rooms', description: { en: 'Watch parties and radio', fr: 'Soirées vidéo et radio' } },
  { unit: 'jobs', description: { en: 'The owner’s downloader', fr: 'Le téléchargeur du propriétaire' } },
  { unit: 'ask', description: { en: 'The local model behind `ask`', fr: 'Le modèle local derrière `ask`' } },
  { unit: 'contact', description: { en: 'Mail from the contact form', fr: 'Le courrier du formulaire' } },
  { unit: 'mcp', description: { en: 'The read-only MCP endpoint', fr: 'Le point MCP en lecture seule' } },
]

const REASONS: Record<NonNullable<UnitHealth['reason']>, Localised> = {
  unconfigured: { en: 'not configured on this server', fr: 'non configuré sur ce serveur' },
  disabled: { en: 'switched off', fr: 'désactivé' },
  'missing-binary': { en: 'its binary is missing', fr: 'son binaire est absent' },
}
/** The one unit whose "off" has a better word. */
const ASLEEP: Localised = { en: 'the model is asleep', fr: 'le modèle dort' }

const DETAILS: Record<string, Localised> = {
  online: { en: '{n} here now', fr: '{n} ici en ce moment' },
  rooms: { en: '{n} rooms open', fr: '{n} salles ouvertes' },
  jobs: { en: '{n} jobs known', fr: '{n} tâches connues' },
  sessions: { en: '{n} sessions', fr: '{n} sessions' },
}

/** `42s`, `3 min`, `2h 05`: a cache age or an uptime, at a glance. */
export function span(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ${String(minutes % 60).padStart(2, '0')}`
  return `${Math.floor(hours / 24)}d`
}

type Row = { unit: string; health: UnitHealth | null }

function note(row: Row, t: CommandContext['t']): string {
  const h = row.health
  if (!h) return t({ en: 'the API did not answer', fr: 'l’API n’a pas répondu' })
  if (h.state === 'inactive') return t(h.unit === 'ask' ? ASLEEP : REASONS[h.reason ?? 'disabled'])
  const parts: string[] = []
  for (const [key, n] of Object.entries(h.detail ?? {})) {
    const template = DETAILS[key]
    if (template) parts.push(t(template).replace('{n}', String(n)))
  }
  if (h.cacheAge !== undefined) {
    parts.push(
      h.cacheAge === null
        ? t({ en: 'nothing cached yet', fr: 'rien en cache' })
        : t({ en: 'cached {age} ago', fr: 'en cache depuis {age}' }).replace('{age}', span(h.cacheAge)),
    )
  }
  return parts.join(' · ')
}

function look(row: Row): { dot: string; state: string; tone: Tone } {
  if (!row.health) return { dot: '?', state: 'unknown', tone: 'warning' }
  return row.health.state === 'active'
    ? { dot: '●', state: 'active (running)', tone: 'success' }
    : { dot: '○', state: 'inactive (dead)', tone: 'muted' }
}

function rows(report: HealthReport | null): Row[] {
  const known = UNITS.map(({ unit }) => ({ unit, health: report?.units.find((u) => u.unit === unit) ?? null }))
  // A unit the backend has and this list does not still gets a row.
  const extra = (report?.units ?? []).filter((u) => !UNITS.some((known) => known.unit === u.unit))
  return [...known, ...extra.map((health) => ({ unit: health.unit, health }))]
}

async function fetchReport(): Promise<HealthReport | null> {
  try {
    return await api.health()
  } catch {
    return null
  }
}

function list(report: HealthReport | null, t: CommandContext['t']): OutputLine[] {
  const all = rows(report)
  const width = Math.max(...all.map((r) => `${r.unit}.service`.length))
  const out: OutputLine[] = all.map((row) => {
    const { dot, state, tone } = look(row)
    return segmented([
      { text: `${dot} `, tone },
      { text: `${row.unit}.service`.padEnd(width + 2) },
      { text: state.padEnd(18), tone },
      { text: note(row, t), tone: 'muted' },
    ])
  })
  const active = all.filter((r) => r.health?.state === 'active').length
  out.push(
    blank,
    line(
      report
        ? t({
            en: `${all.length} units: ${active} active, ${all.length - active} inactive · API up ${span(report.uptime * 1000)}`,
            fr: `${all.length} unités : ${active} actives, ${all.length - active} inactives · API lancée depuis ${span(report.uptime * 1000)}`,
          })
        : t({
            en: 'the API did not answer, so every unit reads unknown — which is the true answer.',
            fr: 'l’API n’a pas répondu, donc chaque unité est inconnue — ce qui est la vérité.',
          }),
      report ? 'muted' : 'warning',
    ),
  )
  return out
}

function detail(row: Row, t: CommandContext['t']): OutputLine[] {
  const { dot, state, tone } = look(row)
  const description = UNITS.find((u) => u.unit === row.unit)?.description
  const enabled = row.health ? (row.health.state === 'active' ? 'enabled' : 'disabled') : 'unknown'
  const why = note(row, t)
  return [
    segmented([
      { text: `${dot} `, tone },
      { text: `${row.unit}.service`, tone: 'primary' },
      { text: description ? ` - ${t(description)}` : '' },
    ]),
    line(`     Loaded: loaded (/etc/systemd/system/${row.unit}.service; ${enabled}; preset: disabled)`, 'muted'),
    segmented([
      { text: '     Active: ', tone: 'muted' },
      { text: state, tone },
      { text: why ? ` — ${why}` : '', tone: 'muted' },
    ]),
  ]
}

const VERBS = ['status', 'list-units', 'start', 'stop', 'restart', 'reload', 'enable', 'disable']

export const systemctl: Command = {
  name: 'systemctl',
  usage: 'systemctl [status [<unit>]]',
  description: { en: 'What the API behind this site is running', fr: 'Ce que fait tourner l’API de ce site' },
  group: 'live',
  palette: true,
  linkable: true,
  complete: ({ index, args }) =>
    index === 0 ? VERBS : index === 1 && args[0] !== 'list-units' ? UNITS.map((u) => `${u.unit}.service`) : [],
  async run({ args, t, print }) {
    const [verb = 'status', target] = args
    if (!VERBS.includes(verb)) return [line(`Unknown command verb ${verb}.`, 'error')]

    const unit = target?.replace(/\.service$/, '')
    if (verb !== 'status' && verb !== 'list-units') {
      // Every write verb, refused the way systemd refuses a user without polkit rights.
      return [
        line(`Failed to ${verb} ${unit ?? '(no unit)'}.service: Access denied`, 'error'),
        line(t({ en: 'these units belong to someone else. `systemctl status` is all yours.', fr: 'ces unités appartiennent à quelqu’un d’autre. `systemctl status` est à vous.' }), 'muted'),
      ]
    }

    print(line(t({ en: 'asking the API…', fr: 'interrogation de l’API…' }), 'muted'))
    const report = await fetchReport()
    if (!unit) return list(report, t)

    const row = rows(report).find((r) => r.unit === unit)
    if (!row) return [line(`Unit ${unit}.service could not be found.`, 'error')]
    return detail(row, t)
  },
}
