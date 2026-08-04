import { gaming, profile } from '@/content'
import type { Localised } from '@/content/types'
import { fetchSteam, formatPlaytime, useSteam } from '@/composables/useSteam'
import { fetchCommits, relativeTime, shortRepo, useGithub } from '@/composables/useGithub'
import { fetchWeather, useWeather } from '@/composables/useWeather'
import {
  api,
  ApiError,
  type MarketQuote,
  type WeatherCondition,
  type WeatherReport,
} from '@/lib/api'
import { announce } from '../achievements'
import { blank, heading, line, pre } from '../format'
import { formatChange, formatPrice, sparkline } from '../sparkline'
import type { Command, OutputLine } from '../types'
import { ART_WIDTH, compass, weatherArt, windArrow } from '../weather-art'
import { cacheGuestbookEntries, filenameFor } from './guestbook-fs'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CONDITION_LABELS: Record<WeatherCondition, Localised<string>> = {
  clear: { en: 'Clear', fr: 'Dégagé' },
  cloudy: { en: 'Cloudy', fr: 'Nuageux' },
  fog: { en: 'Fog', fr: 'Brouillard' },
  drizzle: { en: 'Drizzle', fr: 'Bruine' },
  rain: { en: 'Rain', fr: 'Pluie' },
  snow: { en: 'Snow', fr: 'Neige' },
  thunder: { en: 'Thunderstorm', fr: 'Orage' },
}

const WEEKDAYS: Record<string, Localised<string>> = {
  0: { en: 'Sun', fr: 'dim' },
  1: { en: 'Mon', fr: 'lun' },
  2: { en: 'Tue', fr: 'mar' },
  3: { en: 'Wed', fr: 'mer' },
  4: { en: 'Thu', fr: 'jeu' },
  5: { en: 'Fri', fr: 'ven' },
  6: { en: 'Sat', fr: 'sam' },
}

type TFunction = <T>(value: Localised<T>) => T

/**
 * The glyph on the left, the readings on the right — wttr.in's layout, which
 * works because every glyph is the same width. Rows past the art's height are
 * indented to match, so a fourth reading still lines up under the third.
 */
function weatherReport(data: WeatherReport, t: TFunction): OutputLine[] {
  const now = data.now
  if (!now) return [line('weather: no current conditions', 'error')]

  const art = weatherArt(now.condition, now.isDay)
  const details = [
    t(CONDITION_LABELS[now.condition]),
    `${now.temperature}°C  (${t({ en: 'feels', fr: 'ressenti' })} ${now.apparent}°C)`,
    `${windArrow(now.windDirection)} ${now.windSpeed} km/h ${compass(now.windDirection)}`,
    `${t({ en: 'humidity', fr: 'humidité' })} ${now.humidity}%  ·  ${now.precipitation} mm`,
  ]

  const merged: string[] = []
  for (let i = 0; i < Math.max(art.length, details.length); i++) {
    const left = art[i] ?? ' '.repeat(ART_WIDTH)
    merged.push(`${left}  ${details[i] ?? ''}`.replace(/\s+$/, ''))
  }
  // A glyph shorter than five rows (a clear night) would otherwise leave blank
  // lines hanging under the readings.
  while (merged.length && !merged[merged.length - 1]) merged.pop()

  const rows: OutputLine[] = merged.map((text, i) => pre(text, i === 0 ? 'primary' : 'default'))

  const forecast = (data.forecast ?? []).slice(1)
  if (forecast.length) {
    rows.push(blank)
    for (const day of forecast) {
      const weekday = t(WEEKDAYS[String(new Date(day.date).getDay())]!)
      rows.push(
        pre(
          `${weekday}  ${String(day.min).padStart(5)}°  →${String(day.max).padStart(5)}°  ${t(CONDITION_LABELS[day.condition])}`,
          'muted',
        ),
      )
    }
  }

  return rows
}

/** Ticker and price on one row, the week's shape on the next. */
function quoteLines(quote: MarketQuote): OutputLine[] {
  const up = (quote.change24h ?? 0) >= 0
  return [
    pre(
      `${quote.symbol.padEnd(5)}${formatPrice(quote.price, quote.currency).padStart(12)}   ${
        up ? '▲' : '▼'
      } ${formatChange(quote.change24h)}`,
      'primary',
    ),
    pre(`     ${sparkline(quote.sparkline)}`, up ? 'success' : 'error'),
    blank,
  ]
}

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
    name: 'weather',
    aliases: ['wttr'],
    description: { en: 'Current conditions where I am', fr: 'La météo là où je suis' },
    group: 'live',
    palette: true,
    async run({ print, t }) {
      print(line('fetching…', 'muted'))
      await fetchWeather()

      const { report } = useWeather(false)
      const data = report.value
      if (!data?.configured || !data.now) {
        return [
          line('weather: unavailable', 'muted'),
          line('(the station is unconfigured, or the sky is unreachable)', 'muted'),
        ]
      }

      return [...heading(data.location ?? 'weather'), blank, ...weatherReport(data, t)]
    },
  },
  {
    name: 'btc',
    aliases: ['stonks', 'crypto'],
    description: { en: 'Crypto prices, 7-day trend', fr: 'Cours crypto, tendance 7 jours' },
    group: 'live',
    palette: true,
    async run({ print, t }) {
      print(line('fetching…', 'muted'))

      // No client-side cache, unlike the page cards: running this is an explicit
      // request for the current price, and the backend already holds a five-minute
      // one that absorbs the repeats.
      let data
      try {
        data = await api.markets()
      } catch {
        data = { configured: false } as const
      }

      if (!data.configured || !data.quotes?.length) {
        return [
          line('btc: quotes unavailable', 'muted'),
          line('(the ticker is off, or the exchange is not answering)', 'muted'),
        ]
      }

      const out: OutputLine[] = [...heading('markets'), blank]
      for (const quote of data.quotes) out.push(...quoteLines(quote))
      out.push(
        line(
          t({
            en: 'not financial advice. it is a wireframe website.',
            fr: "ceci n'est pas un conseil financier. c'est un site en fil de fer.",
          }),
          'muted',
        ),
      )
      return out
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
