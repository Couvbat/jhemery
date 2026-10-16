import { gaming, profile } from '@/content'
import type { Localised } from '@/content/types'
import { fetchSteam, formatPlaytime, useSteam } from '@/composables/useSteam'
import { fetchCommits, relativeTime, shortRepo, useGithub } from '@/composables/useGithub'
import { fetchWeather, useWeather } from '@/composables/useWeather'
import { decorativeMotion } from '@/composables/useMotion'
import { messages as m } from '@/i18n/messages'
import {
  api,
  ApiError,
  type MarketQuote,
  type WeatherCondition,
  type WeatherReport,
} from '@/lib/api'
import { announce } from '../achievements'
import { blank, fail, heading, line, link, pre } from '../format'
import { formatChange, formatPrice, sparkline } from '../sparkline'
import { sleep } from '../timing'
import type { Command, CommandContext, OutputLine } from '../types'
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
  if (!now) return [fail('weather: no current conditions')]

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

/**
 * What `sign` says when the guestbook reads entries first
 * (`docs/superpowers/specs/2026-10-15-guestbook-moderation-design.md`, *The signer's side*).
 */
const SIGN_WORDS = {
  received: {
    en: '✓ received. a local model reads every entry before it shows — usually a few seconds.',
    fr: '✓ reçu. un modèle local lit chaque message avant qu’il apparaisse — en général quelques secondes.',
  },
  reading: { en: 'reading', fr: 'lecture' },
  published: { en: '✓ it’s up — `guestbook` to see it.', fr: '✓ il est en ligne — `guestbook` pour le voir.' },
  held: {
    en: 'held for Jules to read; it will show if it’s fine.',
    fr: 'gardé pour que Jules le lise ; il apparaîtra s’il est correct.',
  },
  asleep: {
    en: 'the model is asleep. it will show within 30 minutes either way.',
    fr: 'le modèle dort. il apparaîtra dans les 30 minutes de toute façon.',
  },
} satisfies Record<string, Localised>

/** How often, and how long, `sign` asks after a pending entry. */
export const VERDICT_POLL_MS = 2_000
export const VERDICT_WAIT_MS = 20_000

/**
 * Asks after the entry every 2 s for up to 20 s, in a frame: the dots move only while
 * motion is allowed. A failed poll counts as no news, never as a verdict.
 */
async function waitForVerdict(ctx: CommandContext, id: string): Promise<OutputLine[]> {
  const draw = ctx.frame()
  const moving = decorativeMotion() !== 'paused'
  for (let waited = VERDICT_POLL_MS; waited <= VERDICT_WAIT_MS; waited += VERDICT_POLL_MS) {
    const dots = moving ? '.'.repeat(1 + ((waited / VERDICT_POLL_MS) % 3)) : '…'
    draw([line(`${ctx.t(SIGN_WORDS.reading)}${dots}`, 'muted')])
    await sleep(VERDICT_POLL_MS, ctx.signal)
    const status = await api
      .guestbookStatus(id)
      .then((reply) => reply.status)
      .catch(() => undefined)
    if (status === 'published') {
      draw([line(ctx.t(SIGN_WORDS.published), 'success')])
      return []
    }
    if (status === 'held') {
      draw([line(ctx.t(SIGN_WORDS.held), 'muted')])
      return []
    }
  }
  draw([line(ctx.t(SIGN_WORDS.asleep), 'muted')])
  return []
}

export const liveCommands: Command[] = [
  {
    name: 'steam',
    aliases: ['playing'],
    description: { en: 'Live Steam activity', fr: 'Activité Steam en direct' },
    group: 'live',
    writes: 'none',
    linkable: true,
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
    writes: 'none',
    linkable: true,
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
    writes: 'none',
    linkable: true,
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

      // Open-Meteo's data is CC BY 4.0: the credit goes where the data is shown.
      return [
        ...heading(data.location ?? 'weather'),
        blank,
        ...weatherReport(data, t),
        blank,
        link('weather data by Open-Meteo.com', 'https://open-meteo.com/'),
      ]
    },
  },
  {
    name: 'btc',
    aliases: ['stonks', 'crypto'],
    description: { en: 'Crypto prices, 7-day trend', fr: 'Cours crypto, tendance 7 jours' },
    group: 'live',
    writes: 'none',
    linkable: true,
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
      // CoinGecko's free API asks for this credit wherever its prices appear.
      out.push(link('data provided by CoinGecko', 'https://www.coingecko.com/en/api'))
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
    writes: 'none',
    linkable: true,
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
        return [fail('guestbook unavailable')]
      }
    },
  },
  {
    name: 'sign',
    usage: 'sign <message>',
    description: { en: 'Leave a message in the guestbook', fr: 'Laisser un message' },
    group: 'live',
    writes: 'server',
    async run(ctx) {
      const { args, prompt, print, t, locale } = ctx
      // One pair of outer quotes is the shell's, not the message's: `sign "great site; love
      // it"` is how the shell says to pass an operator on, so it must not post the quotes.
      const message = args.join(' ').trim().replace(/^(["'])([\s\S]*)\1$/, '$2').trim()
      if (!message) return [fail('sign: usage — sign <message>')]

      // Said before anything is asked: what signing publishes, and where the rules are.
      print(
        link(
          t({
            en: 'signing is public: every visitor sees your name and message. the rules: /legal#guestbook',
            fr: 'signer est public : tout visiteur voit votre nom et votre message. les règles : /legal#guestbook',
          }),
          '/legal#guestbook',
        ),
      )
      const name = (await prompt('your name:')).trim()
      if (!name) return [fail('sign: a name is required')]

      print(line('signing…', 'muted'))
      let signed: Awaited<ReturnType<typeof api.sign>>
      try {
        signed = await api.sign(name, message, locale)
      } catch (error) {
        const detail = error instanceof ApiError ? error.message : 'request failed'
        return [fail(`sign: ${detail}`)]
      }
      // The achievement is for an accepted entry, whether or not it is up yet.
      const toast = announce('sign', t)
      if ('status' in signed && signed.status === 'pending') {
        print(line(t(SIGN_WORDS.received), 'success'))
        return [...(await waitForVerdict(ctx, signed.id)), ...toast]
      }
      return [line('✓ signed. run `guestbook` to see it.', 'success'), ...toast]
    },
  },
  {
    name: 'mail',
    aliases: ['sendmail', 'write'],
    description: { en: 'Send me a message', fr: 'M’envoyer un message' },
    group: 'live',
    writes: 'server',
    palette: true,
    async run({ prompt, print, t }) {
      print([
        line(`composing a message to ${profile.email}`, 'muted'),
        line(t(m.contact.notice), 'muted'),
        line('ctrl+c at any point to abort', 'muted'),
        blank,
      ])

      const name = (await prompt('name:')).trim()
      if (!name) return [fail('mail: name is required')]

      const email = (await prompt('email:')).trim()
      if (!EMAIL_PATTERN.test(email)) {
        return [fail(`mail: \`${email}\` is not a valid address`)]
      }

      const subject = (await prompt('subject (optional):')).trim()
      const message = (await prompt('message:')).trim()
      if (!message) return [fail('mail: message is required')]

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
          fail(`mail: ${detail}`),
          line(`you can always reach me at ${profile.email}`, 'muted'),
        ]
      }
    },
  },
]
