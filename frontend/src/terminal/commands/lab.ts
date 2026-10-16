import { labNodes } from '@/content/lab'
import type { Localised } from '@/content/types'
import { api, type LabReport } from '@/lib/api'
import { feedLine, feedOf, nodeFigures, nodeState, snapshotOf, STATE_WORDS, type NodeState } from '@/lib/lab'
import { blank, fail, line, link, segmented } from '../format'
import type { Command, OutputLine, Tone } from '../types'

/**
 * `lab`: the lab map as a table (`docs/superpowers/specs/2026-10-15-lab-map-design.md`).
 * It formats through `lib/lab.ts`, as `/lab` and the lab shell do, so all three agree.
 * Off the curl pages: those are snapshots served all year, and this is live.
 */

const TONES: Record<Exclude<NodeState, 'none'>, Tone> = {
  up: 'success',
  down: 'error',
  degraded: 'warning',
  stale: 'warning',
  nodata: 'muted',
}

const SPECS: Localised = {
  en: '`hardware nas` has the machines’ specs.',
  fr: '`hardware nas` donne les caractéristiques des machines.',
}

/** The API's answer, or null when it gave none: the one case the table still has to say. */
export async function fetchLab(): Promise<LabReport | null> {
  try {
    return await api.lab()
  } catch {
    return null
  }
}

export const lab: Command = {
  name: 'lab',
  usage: 'lab [--json]',
  description: { en: 'The homelab behind this site, live', fr: 'Le homelab derrière ce site, en direct' },
  manual: {
    description: {
      en: [
        'The machines and services behind the site and its model, each with its status and one live figure, read from the snapshot the lab pushes to the API once a minute. Nothing here reaches into the lab.',
        'The same data, drawn as a map, is at /lab.',
      ],
      fr: [
        'Les machines et les services derrière le site et son modèle, chacun avec son état et un chiffre en direct, lus dans l’instantané que le labo envoie à l’API une fois par minute. Rien ici n’entre dans le labo.',
        'Les mêmes données, dessinées en carte, sont sur /lab.',
      ],
    },
    options: {
      '--json': {
        en: 'The snapshot itself as JSON, for `jq` or another program: `lab --json | jq .machines`.',
        fr: 'L’instantané lui-même en JSON, pour `jq` ou un autre programme : `lab --json | jq .machines`.',
      },
    },
    examples: [{ command: 'lab' }, { command: 'lab --json | jq .machines' }],
    seeAlso: ['hardware(1)', 'systemctl(1)'],
  },
  group: 'live',
  writes: 'none',
  linkable: true,
  palette: true,
  complete: ({ index }) => (index === 0 ? ['--json'] : []),
  async run({ args, t, locale, print, tty }) {
    if (tty) print(line(t({ en: 'asking the API…', fr: 'interrogation de l’API…' }), 'muted'))
    const report = await fetchLab()
    const feed = feedOf(report)

    if (args.includes('--json')) {
      const snapshot = snapshotOf(report)
      if (!snapshot) return [fail(`lab: ${feedLine(report, locale)}`)]
      return JSON.stringify(snapshot, null, 2)
        .split('\n')
        .map((text) => ({ text, tone: 'muted' as const, pre: true }))
    }

    if (feed === 'off' || feed === 'unreachable' || feed === 'empty') {
      return [line(`${feedLine(report, locale)} — ${t(SPECS)}`, 'muted')]
    }

    const nodes = labNodes.filter((node) => node.kind !== 'visitor' && node.kind !== 'private')
    const width = Math.max(...nodes.map((node) => node.id.length))
    const words = nodes.map((node) => nodeState(node, report))
    const wordWidth = Math.max(...words.map((state) => (state === 'none' ? 0 : t(STATE_WORDS[state]).length)))
    const out: OutputLine[] = nodes.map((node, i) => {
      const state = words[i]!
      if (state === 'none') return line(node.id, 'muted')
      const tone = TONES[state]
      return segmented([
        { text: state === 'up' ? '● ' : '○ ', tone },
        { text: node.id.padEnd(width + 2) },
        { text: t(STATE_WORDS[state]).padEnd(wordWidth + 2), tone },
        { text: nodeFigures(node, report, locale).join(' · '), tone: 'muted' },
      ])
    })
    out.push(blank, line(feedLine(report, locale), feed === 'live' ? 'muted' : 'warning'))
    out.push(link('map: /lab', '/lab'))
    return out
  },
}

export const labCommands: Command[] = [lab]
