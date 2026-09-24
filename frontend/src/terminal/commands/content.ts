import {
  gaming,
  isExternal,
  machines,
  music,
  nas,
  pcs,
  peripherals,
  profile,
  projects,
  skillNames,
  skills,
  socials,
} from '@/content'
import { hardwareTab, isHardwareTab } from '@/composables/useHardwareTab'
import { useSteam } from '@/composables/useSteam'
import { uptime } from '@/composables/useStatus'
import { useStats } from '@/composables/useStats'
import { useTheme } from '@/composables/useTheme'
import { MARK } from '../ascii'
import { blank, heading, keyValues, line, segmented, tags, wrap } from '../format'
import type { Command, OutputLine } from '../types'
import { swatches } from './theme'

/** The printable résumé `vite-plugins/resume.ts` emits, in the reader's language. */
export function resumeHtmlPath(locale: string): string {
  return locale === 'fr' ? '/resume.fr.html' : '/resume.html'
}

// `uptime` moved to `composables/useStatus` once the footer's status ticker needed
// it too; re-exported here so `neofetch`'s neighbours keep importing it from where
// they always did.
export { uptime }

export const contentCommands: Command[] = [
  {
    name: 'about',
    aliases: ['bio'],
    description: { en: 'Who I am', fr: 'Qui je suis' },
    group: 'content',
    linkable: true,
    palette: true,
    run({ t }) {
      return [
        ...heading(profile.name),
        line(`${t(profile.role)} @ ${profile.employer} — ${profile.location}`, 'accent'),
        blank,
        ...t(profile.bio).flatMap((paragraph) => [
          ...wrap(paragraph).map((text) => line(text)),
          blank,
        ]),
        line(`🌐 ${t(profile.languages)}`, 'muted'),
      ]
    },
  },
  {
    name: 'skills',
    usage: 'skills [--why]',
    description: { en: 'Tech I work with', fr: "Technos que j'utilise" },
    group: 'content',
    linkable: true,
    palette: true,
    complete: ({ index }) => (index === 0 ? ['--why'] : []),
    run({ args, t }) {
      if (!args.includes('--why')) {
        return [
          ...heading('skills'),
          ...tags(skillNames, 'primary'),
          blank,
          line(t({ en: '`skills --why` shows where each one is used.', fr: '`skills --why` montre où chacune sert.' }), 'muted'),
        ]
      }

      // The evidence, one row per place: the reader can follow every link and check.
      const evidenced = skills.filter((skill) => skill.usedIn?.length)
      const width = evidenced.reduce((max, skill) => Math.max(max, skill.name.length), 0)
      const out: OutputLine[] = [...heading('skills --why'), blank]
      for (const skill of evidenced) {
        skill.usedIn!.forEach((evidence, i) => {
          const name = (i === 0 ? skill.name : '').padEnd(width)
          out.push(
            isExternal(evidence.where)
              ? { text: `${name}  → ${t(evidence.what)}`, href: evidence.where, tone: 'accent', pre: true }
              : segmented([
                  { text: `${name}  → `, tone: 'primary' },
                  { text: t(evidence.what) },
                  { text: `  (cd ${evidence.where})`, tone: 'muted' },
                ]),
          )
        })
      }
      out.push(
        blank,
        line(
          t({
            en: `${skills.length - evidenced.length} more with nothing in this repo to show for them — see \`skills\`.`,
            fr: `${skills.length - evidenced.length} autres sans rien à montrer dans ce dépôt — voir \`skills\`.`,
          }),
          'muted',
        ),
      )
      return out
    },
  },
  {
    name: 'projects',
    usage: 'projects [--json]',
    description: { en: 'What I have built', fr: "Ce que j'ai construit" },
    group: 'content',
    linkable: true,
    palette: true,
    run({ args, t }) {
      if (args.includes('--json')) {
        const payload = projects.map((p) => ({
          name: p.name,
          status: p.status,
          stack: p.stack,
          repo: p.repo,
          description: t(p.description),
        }))
        return JSON.stringify(payload, null, 2)
          .split('\n')
          .map((text) => ({ text, tone: 'muted' as const, pre: true }))
      }

      const out: OutputLine[] = [...heading('projects'), blank]
      for (const project of projects) {
        out.push(line(`${project.name}  [${project.status}]`, 'primary'))
        out.push(...wrap(t(project.description), 72).map((text) => line(`  ${text}`)))
        out.push(line(`  ${project.stack.join(' · ')}`, 'muted'))
        if (project.repo) out.push({ text: `  ${project.repo}`, href: project.repo, tone: 'accent' })
        out.push(blank)
      }
      return out
    },
  },
  {
    name: 'music',
    description: { en: 'What I produce', fr: 'Ce que je produis' },
    group: 'content',
    linkable: true,
    palette: true,
    run({ t }) {
      return [
        ...heading('music'),
        ...wrap(t(music.blurb)).map((text) => line(text)),
        blank,
        line('genres', 'muted'),
        ...tags(music.genres),
        blank,
        line('tools', 'muted'),
        ...tags(music.tools, 'muted'),
        blank,
        { text: music.playlistUrl, href: music.playlistUrl, tone: 'accent' },
        line("run `play` to start it here.", 'muted'),
      ]
    },
  },
  {
    name: 'gaming',
    // `games` used to land here; it now lists the playable ones, which is what a
    // terminal that has games in it should answer. The listing points back here.
    description: { en: 'What I play', fr: 'Ce que je joue' },
    group: 'content',
    linkable: true,
    palette: true,
    run({ t }) {
      return [
        ...heading('gaming'),
        ...wrap(t(gaming.blurb)).map((text) => line(text)),
        blank,
        line('genres', 'muted'),
        ...tags(gaming.genres, 'secondary'),
        blank,
        line('run `steam` for live activity.', 'muted'),
      ]
    },
  },
  {
    name: 'hardware',
    usage: 'hardware [pc|nas|peripherals]',
    description: { en: 'My machines', fr: 'Mes machines' },
    group: 'content',
    linkable: true,
    palette: true,
    run({ args }) {
      const requested = args[0]?.toLowerCase()

      if (requested !== undefined && !isHardwareTab(requested)) {
        return [line(`hardware: unknown group \`${args[0]}\``, 'error')]
      }

      // Keep the rendered section's tab strip in sync with what was asked for.
      if (requested) hardwareTab.value = requested

      if (requested === 'peripherals') {
        return [...heading('peripherals'), ...keyValues(peripherals, 'accent')]
      }

      const selected = requested === 'nas' ? nas : requested === 'pc' ? pcs : machines
      const out: OutputLine[] = [...heading('hardware'), blank]
      for (const machine of selected) {
        out.push(line(`${machine.name.toLowerCase()}@${machine.category} — ${machine.os}`, 'primary'))
        out.push(...keyValues(machine.specs, 'muted'))
        out.push(blank)
      }
      return out
    },
  },
  {
    name: 'contact',
    aliases: ['links'],
    description: { en: 'How to reach me', fr: 'Comment me joindre' },
    group: 'content',
    linkable: true,
    palette: true,
    run({ t }) {
      return [
        ...heading('contact'),
        ...socials.map((s) => ({
          text: `${s.label.padEnd(11)}  ${s.handle}`,
          href: s.href,
          tone: 'accent' as const,
        })),
        blank,
        line(t(profile.availability.note), profile.availability.open ? 'success' : 'muted'),
        line('run `mail` to send me a message from here.', 'muted'),
      ]
    },
  },
  {
    name: 'neofetch',
    aliases: ['fetch'],
    description: { en: 'System summary', fr: 'Résumé système' },
    group: 'content',
    linkable: true,
    palette: true,
    run({ t, locale }) {
      // Read-only: the gaming section owns the fetch, this just reflects it if present.
      const steam = useSteam(false).profile.value
      const theme = useTheme().theme.value
      const info: Array<[string, string]> = [
        [`${profile.handle}@${profile.host}`, ''],
        ['OS', 'Portfolio 1.0 (Vue 3 / Vite)'],
        ['Host', profile.domain],
        ['Kernel', 'NestJS 11'],
        ['Uptime', uptime()],
        ['Shell', 'couvsh 1.0'],
        ['DE', 'TailwindCSS 4'],
        ['Theme', `${theme.name} [${theme.mode}]`],
        ['Locale', locale],
        ['Role', t(profile.role)],
        ['Location', profile.location],
        [
          'Status',
          `${profile.availability.open ? t({ en: 'open', fr: 'disponible' }) : t({ en: 'closed', fr: 'indisponible' })} — ${t(profile.availability.note)}`,
        ],
      ]
      if (steam) {
        info.push(['Steam', steam.inGame ? `${steam.name} — ${steam.inGame}` : steam.status])
      }
      // Recorded by `primeOverlay()` when this session opened the shell, so by
      // the time anyone can type `neofetch` the number is already there. Omitted
      // rather than zeroed when the backend is unreachable.
      const sessions = useStats().sessions.value
      if (sessions !== null) {
        info.push(['Sessions', `${sessions.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB')} ${t({ en: 'shells opened', fr: 'shells ouverts' })}`])
      }

      const markLines = MARK.split('\n')
      // The real thing ends on a strip of the terminal's colours, one row below the
      // info; this one is the current scheme's.
      const swatchRow = info.length + 1
      const rows = Math.max(markLines.length, swatchRow + 1)
      const markWidth = markLines.reduce((max, l) => Math.max(max, l.length), 0)
      const out: OutputLine[] = []

      for (let i = 0; i < rows; i++) {
        const left = (markLines[i] ?? '').padEnd(markWidth + 4)
        if (i === swatchRow) {
          out.push(segmented([{ text: left, tone: 'primary' }, ...swatches(theme)]))
          continue
        }
        const entry = info[i]
        if (!entry) {
          out.push({ text: left, tone: 'primary', pre: true })
          continue
        }
        const [key, value] = entry
        out.push({
          text: `${left}${value ? `${key}: ${value}` : key}`,
          tone: value ? 'default' : 'accent',
          pre: true,
        })
      }
      return out
    },
  },
  {
    name: 'resume',
    aliases: ['cv'],
    description: { en: 'Condensed résumé', fr: 'CV condensé' },
    group: 'content',
    linkable: true,
    palette: true,
    run({ t, locale }) {
      return [
        ...heading(profile.name),
        line(`${t(profile.role)} · ${profile.location} · ${profile.email}`, 'accent'),
        blank,
        line('EXPERIENCE', 'primary'),
        line(`  ${profile.employer} — ${t(profile.role)} (2 ${t({ en: 'years', fr: 'ans' })})`),
        line(`  ${t({ en: 'Web apps, REST APIs and internal tools.', fr: 'Applications web, APIs REST et outils internes.' })}`, 'muted'),
        blank,
        line('STACK', 'primary'),
        ...tags(skillNames, 'muted'),
        blank,
        line('LINKS', 'primary'),
        ...socials.map((s) => ({ text: `  ${s.label.padEnd(11)} ${s.href}`, href: s.href, tone: 'accent' as const, pre: true })),
        blank,
        line(t(profile.availability.note), profile.availability.open ? 'success' : 'muted'),
        {
          text: t({ en: 'printable: ', fr: 'à imprimer : ' }) + resumeHtmlPath(locale),
          href: resumeHtmlPath(locale),
          tone: 'accent',
        },
        line(`tip: curl ${profile.domain}`, 'muted'),
      ]
    },
  },
  {
    name: 'curl',
    usage: `curl ${profile.domain}`,
    description: {
      en: 'Fetch the résumé (as a real curl would)',
      fr: 'Récupérer le CV (comme un vrai curl)',
    },
    group: 'content',
    linkable: true,
    palette: true,
    async run(ctx) {
      const target = ctx.args[0]
        ?.toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')

      const isSelf =
        !target || target === profile.domain || /^localhost(:\d+)?$/.test(target)

      if (!isSelf) {
        return [
          line(`curl: (6) Could not resolve host: ${ctx.args[0]}`, 'error'),
          line(
            'this is a terminal inside a browser tab, not a real shell — it can only',
            'muted',
          ),
          line('reach this site. try it in an actual terminal on your machine.', 'muted'),
        ]
      }

      ctx.print([
        line(`$ curl ${profile.domain}`, 'muted'),
        line(
          '(same response a real curl gets — a browser tab cannot open a raw socket,',
          'muted',
        ),
        line(' so this reuses the résumé data instead of actually connecting)', 'muted'),
        blank,
      ])
      await ctx.run('resume')
    },
  },
]
