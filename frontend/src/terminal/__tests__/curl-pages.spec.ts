import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => true,
}))

import { profile } from '@/content'
import type { Locale, Localised } from '@/content/types'
import { setLocale } from '@/i18n'
import { toAnsi } from '../ansi'
import { gameCommands } from '../commands/games'
import { allCommands, isLinkable } from '../registry'
import type { Command, OutputLine } from '../types'
import { runCommand } from './context'

/**
 * The curl pages: `curl jhemery.xyz/neofetch` in a real terminal gets this command's
 * output as a text file, `public/run/<locale>/<name>.txt`, which `.htaccess` serves to
 * curl, wget and httpie (and only them) by `Accept-Language`. The files are generated
 * here, not by the build: they are snapshots, written by
 *
 *   npx vitest run src/terminal/__tests__/curl-pages.spec.ts -u
 *
 * and committed. CI never writes snapshots, so a change to a command's output or the
 * content fails this spec until the pages are regenerated.
 *
 * Which commands: anything a link could run with no arguments (`isLinkable`), that isn't
 * hidden, live (a page can't be live) or a game (by module, so a new game is left out
 * without anyone remembering to). And none of these:
 */
const EXCLUDED: Record<string, string> = {
  curl: 'the visitor’s own requests',
  ctf: 'per-visitor progress',
  achievements: 'per-visitor progress',
  games: 'per-visitor scores',
  tour: 'walks other commands with pauses',
  // Its durations are clocks, so the two-clock rule would drop the current role; the bare
  // host already serves `resume.txt`, which the build dates afresh on every deploy.
  resume: 'the bare host is the résumé',
  help: 'help.txt is a generated index of these pages instead',
}

const ORIGIN = `https://${profile.domain}`
const LOCALES: Locale[] = ['en', 'fr']
/** Two clocks years apart: a line that differs between them is a clock (an uptime, a duration) and is dropped. */
const CLOCKS = [new Date('2026-10-01T12:00:00Z'), new Date('2031-03-15T08:30:00Z')]
// From the working directory: under jsdom `import.meta.url` is an http: URL.
const pagesDir = join(process.cwd(), 'public/run/')

const games = new Set(gameCommands.map((c) => c.name))
const pages = allCommands()
  .filter((c) => !c.hidden && c.group !== 'live' && !games.has(c.name) && !(c.name in EXCLUDED) && isLinkable(c, []))
  .sort((a, b) => a.name.localeCompare(b.name))

const footer = (name: string, locale: Locale): string => {
  const t = <T,>(value: Localised<T>) => value[locale]
  return toAnsi(
    [
      { text: '' },
      {
        text: t({
          en: `curl ${profile.domain}/help for the other pages · live in a browser: ${ORIGIN}/?run=${name}`,
          fr: `curl ${profile.domain}/help pour les autres pages · en direct dans un navigateur : ${ORIGIN}/?run=${name}`,
        }),
        tone: 'muted',
      },
      { text: '' },
    ],
    { origin: ORIGIN },
  )
}

/** The command's output with every line that depends on the clock left out. */
async function stableOutput(command: Command, locale: Locale): Promise<OutputLine[]> {
  setLocale(locale)
  const runs: OutputLine[][] = []
  for (const clock of CLOCKS) {
    vi.setSystemTime(clock)
    const { lines, ran } = await runCommand(command, [], { locale, interactive: false })
    // A page is one command's own output: nothing it runs inside itself would be in it.
    expect(ran, `${command.name} runs other commands`).toEqual([])
    runs.push(lines)
  }
  const [a, b] = runs as [OutputLine[], OutputLine[]]
  expect(b.length, `${command.name} prints a different number of lines on another day`).toBe(a.length)
  return a.flatMap((row, i) => (row.text === b[i]!.text ? [row] : steadyColumns(row, b[i]!.text)))
}

/**
 * What stays of a row that differs between the clocks: the columns before the change,
 * cut at the last gap of two spaces. So neofetch's Tux keeps every row while its Uptime
 * goes, and a sentence with a date in it goes whole.
 */
function steadyColumns(row: OutputLine, other: string): OutputLine[] {
  let same = 0
  while (same < row.text.length && row.text[same] === other[same]) same++
  const gap = [...row.text.slice(0, same).matchAll(/ {2,}/g)].at(-1)
  const kept = gap ? row.text.slice(0, gap.index).trimEnd() : ''
  if (!kept) return []
  let room = kept.length
  const segments = row.segments?.flatMap((segment) => {
    const text = segment.text.slice(0, Math.max(0, room))
    room -= segment.text.length
    return text ? [{ ...segment, text }] : []
  })
  return [{ ...row, text: kept, segments }]
}

afterAll(() => {
  vi.useRealTimers()
  setLocale('en')
})

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
})

describe('curl pages', () => {
  it('has about a dozen pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(10)
  })

  for (const locale of LOCALES) {
    it.each(pages.map((c) => [c.name, c] as const))(`${locale}/%s.txt is the command’s output`, async (name, command) => {
      const page = `${toAnsi(await stableOutput(command, locale), { origin: ORIGIN })}\n${footer(name, locale)}`
      // A committed file can't know its commit, so it links master; and no flag, ever.
      expect(page).not.toMatch(/CTF\{/)
      for (const [, ref] of page.matchAll(/\/blob\/([^/\s]+)\//g)) expect(ref).toBe('master')
      await expect(page).toMatchFileSnapshot(`${pagesDir}${locale}/${name}.txt`)
    })

    it(`${locale}/help.txt lists them`, async () => {
      const t = <T,>(value: Localised<T>) => value[locale]
      const targets = [profile.domain, ...pages.map((c) => `${profile.domain}/${c.name}`)]
      const pad = Math.max(...targets.map((target) => `  curl ${target}`.length))
      const row = (target: string, what: string): OutputLine => {
        const left = `  curl ${target}`.padEnd(pad)
        return { text: `${left}  ${what}`, segments: [{ text: left, tone: 'accent' }, { text: `  ${what}` }] }
      }
      const lines: OutputLine[] = [
        { text: t({ en: 'What a terminal can read here:', fr: 'Ce qu’un terminal peut lire ici :' }), tone: 'primary' },
        { text: '' },
        row(profile.domain, t({ en: 'the résumé', fr: 'le CV' })),
        ...pages.map((c) => row(`${profile.domain}/${c.name}`, t(c.description))),
      ]
      const page = `${toAnsi(lines, { origin: ORIGIN })}\n${footer('help', locale)}`
      await expect(page).toMatchFileSnapshot(`${pagesDir}${locale}/help.txt`)
    })
  }

  it.each(LOCALES)('leaves no orphan in %s: every file is a page', (locale) => {
    const files = readdirSync(`${pagesDir}${locale}`).sort()
    expect(files).toEqual([...pages.map((c) => `${c.name}.txt`), 'help.txt'].sort())
  })
})
