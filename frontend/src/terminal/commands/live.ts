import { gaming, profile } from '@/content'
import { fetchSteam, formatPlaytime, useSteam } from '@/composables/useSteam'
import { fetchCommits, relativeTime, shortRepo, useGithub } from '@/composables/useGithub'
import { api, ApiError } from '@/lib/api'
import { announce } from '../achievements'
import { blank, heading, line } from '../format'
import type { Command, OutputLine } from '../types'
import { cacheGuestbookEntries, filenameFor } from './guestbook-fs'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const liveCommands: Command[] = [
  {
    name: 'steam',
    aliases: ['playing'],
    description: { en: 'Live Steam activity', fr: 'Activité Steam en direct' },
    group: 'live',
    palette: true,
    async run({ print, t }) {
      print(line('fetching…', 'muted'))
      await fetchSteam()

      const { profile: steamProfile, games } = useSteam(false)
      const out: OutputLine[] = [...heading('steam')]

      if (steamProfile.value) {
        const p = steamProfile.value
        out.push(line(`${p.name} — ${p.inGame ? `in-game: ${p.inGame}` : p.status}`, 'primary'))
        out.push(blank)
      } else {
        out.push(line('live activity unavailable — showing the static log', 'muted'))
        out.push(blank)
      }

      const rows = games.value?.length
        ? games.value.map((g) => ({
            name: g.name,
            status: formatPlaytime(g.playtime2Weeks || g.playtimeForever),
          }))
        : gaming.fallbackGames.map((g) => ({ name: g.name, status: t(g.status) }))

      const width = rows.reduce((max, r) => Math.max(max, r.name.length), 0)
      out.push(
        ...rows.map((r) => ({
          text: `▸ ${r.name.padEnd(width)}  ${r.status}`,
          tone: 'default' as const,
          pre: true,
        })),
      )
      return out
    },
  },
  {
    name: 'gitlog',
    aliases: ['git log', 'commits'],
    description: { en: 'Recent public commits', fr: 'Commits publics récents' },
    group: 'live',
    palette: true,
    async run({ print }) {
      print(line('fetching…', 'muted'))
      await fetchCommits()

      const { commits } = useGithub(false)
      if (!commits.value?.length) {
        return [line('no recent activity available', 'muted')]
      }

      return commits.value.map((c) => ({
        text: `${c.sha}  ${c.message}  (${shortRepo(c.repo)}, ${relativeTime(c.date)})`,
        href: c.url,
        tone: 'default' as const,
      }))
    },
  },
  {
    name: 'guestbook',
    aliases: ['gb'],
    description: { en: 'Read what visitors left', fr: 'Lire les messages des visiteurs' },
    group: 'live',
    palette: true,
    async run({ print }) {
      print(line('fetching…', 'muted'))
      try {
        const data = await api.guestbook()
        if (!data.enabled) return [line('the guestbook is closed', 'muted')]
        if (!data.entries?.length) {
          cacheGuestbookEntries([])
          return [line('nobody has signed yet. `sign <message>` to be first.', 'muted')]
        }

        cacheGuestbookEntries(data.entries)

        const out: OutputLine[] = [...heading('guestbook/'), blank]
        for (const entry of data.entries) {
          out.push({
            text: `-rw-r--r--  ${new Date(entry.date).toISOString().slice(0, 10)}  ${filenameFor(entry)}`,
            tone: 'primary',
            pre: true,
          })
        }
        out.push(
          blank,
          line('`cat guestbook/<file>` to read one.', 'muted'),
        )
        return out
      } catch {
        return [line('guestbook unavailable', 'error')]
      }
    },
  },
  {
    name: 'sign',
    usage: 'sign <message>',
    description: { en: 'Leave a message in the guestbook', fr: 'Laisser un message' },
    group: 'live',
    async run({ args, prompt, print, t }) {
      const message = args.join(' ').trim()
      if (!message) return [line('sign: usage — sign <message>', 'error')]

      const name = (await prompt('your name:')).trim()
      if (!name) return [line('sign: a name is required', 'error')]

      print(line('signing…', 'muted'))
      try {
        await api.sign(name, message)
        return [line('✓ signed. run `guestbook` to see it.', 'success'), ...announce('sign', t)]
      } catch (error) {
        const detail = error instanceof ApiError ? error.message : 'request failed'
        return [line(`sign: ${detail}`, 'error')]
      }
    },
  },
  {
    name: 'mail',
    aliases: ['sendmail', 'write'],
    description: { en: 'Send me a message', fr: 'M’envoyer un message' },
    group: 'live',
    palette: true,
    async run({ prompt, print, t }) {
      print([
        line(`composing a message to ${profile.email}`, 'muted'),
        line('ctrl+c at any point to abort', 'muted'),
        blank,
      ])

      const name = (await prompt('name:')).trim()
      if (!name) return [line('mail: name is required', 'error')]

      const email = (await prompt('email:')).trim()
      if (!EMAIL_PATTERN.test(email)) {
        return [line(`mail: \`${email}\` is not a valid address`, 'error')]
      }

      const subject = (await prompt('subject (optional):')).trim()
      const message = (await prompt('message:')).trim()
      if (!message) return [line('mail: message is required', 'error')]

      print([
        blank,
        line('─ preview ─────────────────', 'muted'),
        line(`from:    ${name} <${email}>`),
        line(`subject: ${subject || '(none)'}`),
        line(`body:    ${message}`),
        line('───────────────────────────', 'muted'),
      ])

      const confirm = (await prompt('send? [y/N]')).trim().toLowerCase()
      if (confirm !== 'y' && confirm !== 'yes') {
        return [line('aborted — nothing was sent', 'muted')]
      }

      print(line('sending…', 'muted'))
      try {
        await api.contact({ name, email, subject: subject || undefined, message })
        return [line('✓ sent. I will get back to you shortly.', 'success'), ...announce('mail', t)]
      } catch (error) {
        const detail = error instanceof ApiError ? error.message : 'request failed'
        return [
          line(`mail: ${detail}`, 'error'),
          line(`you can always reach me at ${profile.email}`, 'muted'),
        ]
      }
    },
  },
]
