import {
  availability,
  gaming,
  machines,
  music,
  nas,
  pcs,
  peripherals,
  profile,
  projects,
  skills,
  socials,
} from '@/content'
import { hardwareTab, isHardwareTab } from '@/composables/useHardwareTab'
import { useSteam } from '@/composables/useSteam'
import { MARK } from '../ascii'
import { blank, heading, keyValues, line, tags, wrap } from '../format'
import type { Command, OutputLine } from '../types'

/** Whole-number days since the first commit, for the neofetch "uptime" line. */
function uptime(): string {
  const days = Math.floor((Date.now() - new Date(profile.since).getTime()) / 86_400_000)
  const years = Math.floor(days / 365)
  const remainder = days % 365
  return years > 0 ? `${years}y ${remainder}d` : `${days}d`
}

export const contentCommands: Command[] = [
  {
    name: 'about',
    aliases: ['bio'],
    description: { en: 'Who I am', fr: 'Qui je suis' },
    group: 'content',
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
    description: { en: 'Tech I work with', fr: "Technos que j'utilise" },
    group: 'content',
    palette: true,
    run() {
      return [...heading('skills'), ...tags(skills, 'primary')]
    },
  },
  {
    name: 'projects',
    usage: 'projects [--json]',
    description: { en: 'What I have built', fr: "Ce que j'ai construit" },
    group: 'content',
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
    aliases: ['games'],
    description: { en: 'What I play', fr: 'Ce que je joue' },
    group: 'content',
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
        line(t(availability), 'muted'),
        line('run `mail` to send me a message from here.', 'muted'),
      ]
    },
  },
  {
    name: 'neofetch',
    aliases: ['fetch'],
    description: { en: 'System summary', fr: 'Résumé système' },
    group: 'content',
    palette: true,
    run({ t, locale }) {
      // Read-only: the gaming section owns the fetch, this just reflects it if present.
      const steam = useSteam(false).profile.value
      const info: Array<[string, string]> = [
        [`${profile.handle}@${profile.host}`, ''],
        ['OS', 'Portfolio 1.0 (Vue 3 / Vite)'],
        ['Host', profile.domain],
        ['Kernel', 'NestJS 11'],
        ['Uptime', uptime()],
        ['Shell', 'couvsh 1.0'],
        ['DE', 'TailwindCSS 4'],
        ['Theme', 'cyberpunk-dark'],
        ['Locale', locale],
        ['Role', t(profile.role)],
        ['Location', profile.location],
      ]
      if (steam) {
        info.push(['Steam', steam.inGame ? `${steam.name} — ${steam.inGame}` : steam.status])
      }

      const markLines = MARK.split('\n')
      const rows = Math.max(markLines.length, info.length)
      const markWidth = markLines.reduce((max, l) => Math.max(max, l.length), 0)
      const out: OutputLine[] = []

      for (let i = 0; i < rows; i++) {
        const left = (markLines[i] ?? '').padEnd(markWidth + 4)
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
    palette: true,
    run({ t }) {
      return [
        ...heading(profile.name),
        line(`${t(profile.role)} · ${profile.location} · ${profile.email}`, 'accent'),
        blank,
        line('EXPERIENCE', 'primary'),
        line(`  ${profile.employer} — ${t(profile.role)} (2 ${t({ en: 'years', fr: 'ans' })})`),
        line(`  ${t({ en: 'Web apps, REST APIs and internal tools.', fr: 'Applications web, APIs REST et outils internes.' })}`, 'muted'),
        blank,
        line('STACK', 'primary'),
        ...tags(skills, 'muted'),
        blank,
        line('LINKS', 'primary'),
        ...socials.map((s) => ({ text: `  ${s.label.padEnd(11)} ${s.href}`, href: s.href, tone: 'accent' as const, pre: true })),
        blank,
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
