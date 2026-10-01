import { describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => true,
}))

import { julesManual } from '@/content'
import { setLocale } from '@/i18n'
import { completeInput, useTerminal } from '@/composables/useTerminal'
import { findPage, flagsOf, manualFor, renderManual, sectionOf } from '../manual'
import { allCommands, resolve } from '../registry'
import { runCommand } from './context'

const pages = allCommands().map((c) => [c.name, c] as const)

describe('every command has a page', () => {
  it.each(pages)('%s: NAME, SYNOPSIS, EXAMPLES and SEE ALSO, in both languages', (_name, command) => {
    for (const locale of ['en', 'fr'] as const) {
      const t = <T,>(value: { en: T; fr: T }) => value[locale]
      const text = renderManual(manualFor(command), t).map((l) => l.text)
      const headings = text.filter((l) => /^[A-ZÀ-Ý ]+$/.test(l))
      expect(headings, locale).toEqual(
        expect.arrayContaining(locale === 'en' ? ['NAME', 'SYNOPSIS', 'EXAMPLES', 'SEE ALSO'] : ['NOM', 'SYNOPSIS', 'EXEMPLES', 'VOIR AUSSI']),
      )
    }
  })

  // The part that can't be generated: what each flag does.
  it.each(pages.filter(([, c]) => flagsOf(c).length))('%s: OPTIONS for every flag in its usage, in both languages', (_name, command) => {
    for (const flag of flagsOf(command)) {
      const text = command.manual?.options?.[flag]
      expect(text?.en.trim(), `${command.name} ${flag}`).toBeTruthy()
      expect(text?.fr.trim(), `${command.name} ${flag}`).toBeTruthy()
    }
  })

  it('finds the flags a usage names, and nothing else', () => {
    expect(flagsOf(resolve('ls')!)).toEqual(['-a'])
    expect(flagsOf(resolve('head')!)).toEqual(['-n', '-N'])
    expect(flagsOf(resolve('help')!)).toEqual(['--all'])
    expect(flagsOf(resolve('jq')!)).toEqual([])
  })

  it('puts the games and the fun in section 6', () => {
    expect(sectionOf(resolve('snake')!)).toBe(6)
    expect(sectionOf(resolve('ls')!)).toBe(1)
  })

  it('resolves every SEE ALSO, the oblique ones included', () => {
    const refs = [...allCommands().map((c) => manualFor(c)), julesManual()].flatMap((page) => page.seeAlso)
    for (const ref of refs) {
      const [, name, section] = /^(.+)\((\d)\)$/.exec(ref) ?? []
      expect(name, ref).toBeDefined()
      expect(findPage(name!, Number(section), allCommands()), ref).toBeDefined()
    }
    expect(manualFor(resolve('ls')!).seeAlso).toContain('sl(6)')
  })

  it('has a page for the person, built from the résumé’s content', () => {
    const page = julesManual(new Date('2026-10-01'))
    expect(page.sections!.map((s) => s.heading.en)).toEqual(['Experience', 'Education', 'Skills', 'Projects', 'Contact'])
    expect(page.sections![0]!.lines.en[0]).toMatch(/^In-Leed — Full-Stack Developer \(Nov 2023 – present, /)
  })
})

describe('man', () => {
  const man = resolve('man')!

  it('is its own command now, not an alias of help', () => {
    expect(man.name).toBe('man')
    expect(resolve('help')!.aliases ?? []).not.toContain('man')
  })

  it('asks which page with none, and says there is none for an unknown one', async () => {
    expect((await runCommand(man, [])).lines[0]).toMatchObject({ text: 'What manual page do you want?', stderr: true })
    expect((await runCommand(man, ['nope'])).lines[0]).toMatchObject({ text: 'No manual entry for nope', stderr: true })
    expect((await runCommand(man, ['6', 'ls'])).lines[0]!.text).toBe('No manual entry for ls in section 6')
  })

  it('prints the page whole when nobody is reading it a screen at a time', async () => {
    const { lines } = await runCommand(man, ['ls'], { interactive: false })
    expect(lines[0]!.text).toMatch(/^LS\(1\)/)
    expect(lines.at(-1)!.text).toMatch(/LS\(1\)$/)
  })

  it('completes the visible pages and jules, and the sections, but no hidden page', () => {
    const offered = man.complete!({ args: [''], index: 0, word: '' })
    expect(offered).toEqual(expect.arrayContaining(['ls', 'jules', '1', '6']))
    expect(offered).not.toContain('vim')
    expect(man.complete!({ args: ['6', ''], index: 1, word: '' })).toContain('snake')
    expect(man.complete!({ args: ['6', ''], index: 1, word: '' })).not.toContain('ls')
  })
})

describe('--help and -<Tab>', () => {
  const { buffer, clearBuffer, run } = useTerminal()

  it('prints the usage for --help as the first argument, and leaves it alone anywhere else', async () => {
    setLocale('en')
    clearBuffer()
    await run('ls --help')
    expect(buffer.value.filter((l) => !l.prompt)[0]!.text).toBe('usage: ls [-a] [path]')
    clearBuffer()
    await run('echo hi --help')
    expect(buffer.value.at(-1)!.text).toBe('hi --help')
  })

  it('completes a flag, and lists what each does when several are left', () => {
    clearBuffer()
    expect(completeInput('grep -').value).toBe('grep -')
    const listed = buffer.value.slice(-4).map((l) => l.text)
    expect(listed).toContainEqual(expect.stringMatching(/^-i\s+Ignore case\.$/))
    expect(listed).toHaveLength(4)
    expect(completeInput('curl -').value).toBe('curl -I ')
  })
})
