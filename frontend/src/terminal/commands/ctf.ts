import { messages } from '@/i18n/messages'
import { announce } from '../achievements'
import {
  capturedFlag,
  currentStage,
  decryptFinale,
  hintFor,
  solvedCount,
  stages,
  submitFlag,
  type Stage,
  type Verdict,
} from '../ctf'
import { blank, line, pre, segmented } from '../format'
import type { Command, CommandContext, OutputLine } from '../types'

const m = messages.ctf

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))
}

const numberOf = (stage: Stage) => stages.indexOf(stage) + 1

/** What `flag` and `decrypt` print for a verdict — one place, so they read the same. */
function report(verdict: Verdict, t: CommandContext['t']): OutputLine[] {
  switch (verdict.kind) {
    case 'malformed':
      return [line(t(m.malformed), 'error')]
    case 'already':
      return [line(fill(t(m.already), { n: numberOf(verdict.stage) }), 'muted')]
    case 'order':
      return [
        line(fill(t(m.order), { n: numberOf(verdict.current) }), 'warning'),
        line(`${t(m.hint)}: ${t(hintFor(verdict.current))}`, 'muted'),
      ]
    case 'wrong': {
      const out = [line(t(m.wrong), 'error')]
      // The ladder: a sharper hint after three misses, and again after six.
      if (verdict.current && (verdict.misses === 3 || verdict.misses === 6)) {
        out.push(line(t(m.nudge), 'muted'), line(`  ${t(hintFor(verdict.current))}`, 'accent'))
      }
      return out
    }
    case 'solved':
      return [
        line(`🚩 ${fill(t(m.solved), { n: numberOf(verdict.stage), title: t(verdict.stage.title) })}`, 'success'),
        line(t(verdict.stage.reward), 'accent'),
        ...(verdict.next ? [] : [blank, line(t(m.complete), 'primary')]),
        ...announce('firstBlood', t),
      ]
  }
}

export const ctfCommands: Command[] = [
  {
    // Not hidden: like `achievements`, it is a signpost — the thing robots.txt and
    // `.secret` point at. It never names a flag you have not found.
    name: 'ctf',
    aliases: ['flags'],
    description: { en: 'The capture-the-flag chain', fr: 'La chaîne de capture de flags' },
    group: 'fun',
    palette: true,
    linkable: true,
    run({ t }) {
      const current = currentStage()
      const width = stages.reduce((max, stage) => {
        const shown = capturedFlag(stage.id) ? t(stage.title) : '???'
        return Math.max(max, shown.length)
      }, 3)

      const out: OutputLine[] = [
        line(`🏁 ${fill(t(m.board), { n: solvedCount.value, total: stages.length })}`, 'accent'),
        blank,
      ]
      for (const stage of stages) {
        const flag = capturedFlag(stage.id)
        const n = String(numberOf(stage)).padStart(2)
        if (flag) {
          out.push(
            segmented([
              { text: `  ✓ ${n}  ${t(stage.title).padEnd(width)}  `, tone: 'success' },
              { text: flag, tone: 'muted' },
            ]),
          )
        } else if (stage === current) {
          out.push(
            segmented([
              { text: `  ▸ ${n}  ${'???'.padEnd(width)}  `, tone: 'primary' },
              { text: `${t(m.hint)}: ${t(hintFor(stage))}` },
            ]),
          )
        } else {
          out.push(pre(`  · ${n}  ???`, 'muted'))
        }
      }
      out.push(blank, line(current ? t(m.submit) : t(m.complete), 'muted'))
      return out
    },
  },
  {
    name: 'flag',
    usage: 'flag CTF{…}',
    description: { en: 'Submit a CTF flag', fr: 'Soumettre un flag' },
    group: 'fun',
    hidden: true,
    async run({ args, t }) {
      if (!args[0]) return [line(t(m.usage), 'error')]
      return report(await submitFlag(args.join('')), t)
    },
  },
  {
    name: 'decrypt',
    description: { en: 'Open the last stage', fr: 'Ouvrir la dernière étape' },
    group: 'fun',
    hidden: true,
    async run({ t, locale }) {
      const result = await decryptFinale()
      if (result.kind === 'corrupt') return [line(t(m.corrupt), 'error')]
      if (result.kind === 'missing') {
        return [
          line(fill(t(m.missing), { n: 7 - result.missing.length }), 'error'),
          line(`  ${t(m.missingStages)} ${result.missing.map(numberOf).join(', ')}`, 'muted'),
        ]
      }

      const { payoff, verdict } = result
      return [
        ...payoff[locale].map((text) => (text ? pre(text, 'accent') : blank)),
        blank,
        pre(`final flag: ${payoff.flag}`, 'primary'),
        blank,
        ...(verdict.kind === 'already' ? [line(t(m.reopened), 'muted')] : report(verdict, t)),
      ]
    },
  },
]
