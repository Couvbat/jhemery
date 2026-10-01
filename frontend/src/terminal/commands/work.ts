import { decisions, findDecision, profile, type Decision, type Localised } from '@/content'
import { prefersReducedMotion } from '@/composables/useCrt'
import { previewTheme, useTheme } from '@/composables/useTheme'
import { findTheme } from '@/lib/themes'
import { docUrl } from '@/lib/source'
import { achievementList, unlockedCount } from '../achievements'
import { blank, fail, line, link, pre } from '../format'
import { closest } from '../fuzzy'
import { sleep } from '../timing'
import type { Command, CommandContext, OutputLine, OutputSegment } from '../types'

const PULL = 'https://github.com/Couvbat/jhemery/pull'

/** A line of differently-toned runs that still wraps, unlike `segmented()`'s grid rows. */
function prose(parts: OutputSegment[]): OutputLine {
  return { text: parts.map((part) => part.text).join(''), segments: parts }
}

function decisionLines(decision: Decision, t: <T>(value: Localised<T>) => T): OutputLine[] {
  return [
    line(t(decision.topic), 'primary'),
    blank,
    prose([{ text: `  ${t({ en: 'chose', fr: 'choisi' })}  `, tone: 'muted' }, { text: t(decision.chose) }]),
    ...decision.rejected.map((option) =>
      prose([
        { text: `  ✗ ${t(option.what)}`, tone: 'warning' },
        { text: ` — ${t(option.because)}`, tone: 'muted' },
      ]),
    ),
    ...(decision.hindsight
      ? [prose([{ text: `  ${t({ en: 'hindsight', fr: 'avec le recul' })}  `, tone: 'muted' }, { text: t(decision.hindsight), tone: 'accent' }])]
      : []),
    blank,
    ...(decision.pr ? [link(`  PR #${decision.pr}`, `${PULL}/${decision.pr}`)] : []),
    link(`  ${t({ en: 'read the design', fr: 'lire la conception' })} → ${decision.source.doc.split('/').pop()}`, docUrl(decision.source)),
  ]
}

function listing(t: <T>(value: Localised<T>) => T): OutputLine[] {
  const width = decisions.reduce((max, d) => Math.max(max, d.id.length), 0)
  return [
    line(t({ en: 'Why the site is built the way it is:', fr: 'Pourquoi le site est fait ainsi :' }), 'primary'),
    blank,
    ...decisions.map((d) => pre(`  ${d.id.padEnd(width)}  ${t(d.topic)}`)),
    blank,
    line(t({ en: 'why <topic> — what was chosen, and what was turned down', fr: 'why <sujet> — ce qui a été choisi, et ce qui a été écarté' }), 'muted'),
  ]
}

/**
 * The stops of `tour`, in order. A `run` stop is a command line run inside the tour,
 * so it must be one a link could run itself: `tour.spec.ts` holds every one to
 * `isLinkable`, since `?run=tour` is the one link to put in a bio. Three stops are not
 * commands: a scheme shown for a moment and put back, the `curl` hint, which only means
 * something in a real terminal, and the achievement count. No game (it would hold the keyboard and turn the
 * output's announcements off for the rest of the walk) and no hidden command (naming
 * one hands out an easter egg).
 */
export const TOUR_STOPS: Array<
  | { caption: Localised; run: string; then?: Localised }
  | { caption: Localised; show: 'scheme' | 'curl' | 'count' }
> = [
  {
    caption: {
      en: 'This is a shell: the whole site is in here too. A summary first.',
      fr: 'Ceci est un shell : tout le site s’y trouve aussi. Un résumé d’abord.',
    },
    run: 'neofetch',
  },
  {
    caption: {
      en: 'Every colour comes from a scheme, and there are eleven.',
      fr: 'Chaque couleur vient d’un thème, et il y en a onze.',
    },
    show: 'scheme',
  },
  {
    caption: { en: 'There are games.', fr: 'Il y a des jeux.' },
    run: 'games',
    then: {
      en: 'wordle daily gives everyone the same word each day, in either language.',
      fr: 'wordle daily donne à tous le même mot chaque jour, dans les deux langues.',
    },
  },
  {
    caption: {
      en: 'The CV also answers a real terminal. Try this one in yours:',
      fr: 'Le CV répond aussi à un vrai terminal. Essayez ceci dans le vôtre :',
    },
    show: 'curl',
  },
  {
    caption: {
      en: 'Some things are only found by looking around.',
      fr: 'Certaines choses ne se trouvent qu’en fouinant.',
    },
    show: 'count',
  },
]

/** The scheme the tour shows, or the second when the visitor already wears the first. */
const SCHEMES = ['gruvbox', 'nord'] as const
const STOP_MS = 6000
const SCHEME_MS = 3000

async function tourStop(ctx: CommandContext, stop: (typeof TOUR_STOPS)[number], still: boolean): Promise<void> {
  const { t, print, signal } = ctx
  print([blank, line(`» ${t(stop.caption)}`, 'accent')])
  if ('run' in stop) {
    await ctx.run(stop.run)
    if (stop.then) print(line(`  ${t(stop.then)}`, 'muted'))
    return
  }
  if (stop.show === 'curl') {
    print(pre(`  curl ${profile.domain}`, 'primary'))
    return
  }
  if (stop.show === 'count') {
    print(
      line(
        t({
          en: `  ${unlockedCount()} of ${achievementList.length} achievements found so far; \`achievements\` lists them, and \`help\` lists the commands, though not all of them.`,
          fr: `  ${unlockedCount()} succès sur ${achievementList.length} trouvés jusqu’ici ; \`achievements\` les liste, et \`help\` liste les commandes, mais pas toutes.`,
        }),
      ),
    )
    return
  }
  // A scheme shown, not saved, and put back however the tour ends. Under reduced motion
  // a whole-page repaint is exactly the kind of change to leave out.
  if (still) {
    print(line(`  ${t({ en: '`theme` lists them.', fr: '`theme` les liste.' })}`, 'muted'))
    return
  }
  const id = SCHEMES.find((scheme) => scheme !== useTheme().chosen.value.id)!
  const name = findTheme(id)!.name
  print(line(`  ${t({ en: `Here is ${name}, for a moment.`, fr: `Voici ${name}, un instant.` })}`, 'muted'))
  const restore = previewTheme(id)
  try {
    await sleep(SCHEME_MS, signal)
  } finally {
    restore?.()
  }
  print(line(`  ${t({ en: '…and back. `theme` lists them all.', fr: '…et retour. `theme` les liste tous.' })}`, 'muted'))
}

export const workCommands: Command[] = [
  {
    name: 'why',
    usage: 'why [topic]',
    description: {
      en: 'What the site chose, and what it turned down',
      fr: 'Ce que le site a choisi, et ce qu’il a écarté',
    },
    group: 'content',
    writes: 'none',
    linkable: true,
    palette: true,
    complete: ({ index }) => (index === 0 ? decisions.map((d) => d.id) : []),
    run({ args, t }) {
      const [topic] = args
      if (!topic) return listing(t)
      const decision = findDecision(topic)
      if (decision) return decisionLines(decision, t)
      const hint = closest(topic, decisions.map((d) => d.id))
      return [
        fail(`why: ${topic}: ${t({ en: 'no such topic', fr: 'sujet inconnu' })}`),
        line(
          hint
            ? `${t({ en: 'did you mean', fr: 'vouliez-vous dire' })} \`why ${hint}\`?`
            : t({ en: '`why` lists them all.', fr: '`why` les liste tous.' }),
          'muted',
        ),
      ]
    },
  },
  {
    name: 'tour',
    description: { en: 'A one-minute walk through the site', fr: 'Une visite du site en une minute' },
    group: 'content',
    // The scheme it shows is put back, so it leaves nothing changed.
    writes: 'none',
    linkable: true,
    palette: true,
    async run(ctx) {
      // Under reduced motion it prints everything at once rather than pacing itself.
      const still = prefersReducedMotion()
      for (const [i, stop] of TOUR_STOPS.entries()) {
        if (i > 0 && !still) await sleep(STOP_MS, ctx.signal)
        await tourStop(ctx, stop, still)
      }
      ctx.print([blank, line(ctx.t({ en: 'End of the tour. Ctrl+C stops one, `tour` starts another.', fr: 'Fin de la visite. Ctrl+C en arrête une, `tour` en relance une.' }), 'muted')])
    },
  },
]
