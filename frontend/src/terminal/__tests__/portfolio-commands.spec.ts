import { describe, expect, it, vi } from 'vitest'
import { now, profile, skills } from '@/content'
import { contentCommands } from '../commands/content'
import { resolveFileLines } from '../commands/files'
import { runCommand } from './context'

vi.mock('@/composables/useCrt', () => ({ prefersReducedMotion: () => true }))

const command = (name: string) => contentCommands.find((c) => c.name === name)!

describe('skills', () => {
  it('lists names only by default, and says how to see why', async () => {
    const { text } = await runCommand(command('skills'))
    expect(text).toContain('TypeScript')
    expect(text).toContain('skills --why')
    expect(text).not.toContain('→')
  })

  it('--why prints one row per piece of evidence, links for the external ones', async () => {
    const { lines } = await runCommand(command('skills'), ['--why'])
    const evidence = skills.flatMap((s) => s.usedIn ?? [])
    const rows = lines.filter((l) => l.text.includes('→'))
    expect(rows).toHaveLength(evidence.length)

    const external = evidence.filter((e) => e.where.startsWith('https://'))
    expect(lines.filter((l) => l.href).map((l) => l.href)).toEqual(external.map((e) => e.where))
    // An internal path says how to get there from the shell.
    expect(rows.some((l) => l.text.includes('(cd tools/ffmpeg)'))).toBe(true)
  })

  it('completes --why', () => {
    expect(command('skills').complete!({ args: [''], index: 0, word: '' })).toEqual(['--why'])
  })
})

describe('neofetch', () => {
  it('has a Status row built from profile.availability', async () => {
    const { text } = await runCommand(command('neofetch'))
    expect(text).toMatch(new RegExp(`Status: (open|closed) — ${profile.availability.note.en}`))
  })
})

describe('resume', () => {
  it('links the printable résumé in the reader’s language', async () => {
    const en = await runCommand(command('resume'))
    expect(en.lines.some((l) => l.href === '/resume.html')).toBe(true)
    const fr = await runCommand(command('resume'), [], { locale: 'fr' })
    expect(fr.lines.some((l) => l.href === '/resume.fr.html')).toBe(true)
  })
})

describe('now.txt', () => {
  const t = <T,>(value: { en: T; fr: T }) => value.en

  it('prints the same entries as /now, with the date', () => {
    const text = resolveFileLines('now.txt', t)!.map((l) => l.text).join('\n')
    expect(text).toContain(now.updated)
    for (const entry of now.entries) {
      // Wrapped, so check the first few words of each entry.
      expect(text).toContain(entry.text.en.split(' ').slice(0, 3).join(' '))
    }
  })

  it('warns when the list is older than it should be', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.parse(`${now.updated}T00:00:00Z`) + 200 * 86_400_000))
    try {
      const text = resolveFileLines('now.txt', t)!.map((l) => l.text).join('\n')
      expect(text).toContain('200 days old')
    } finally {
      vi.useRealTimers()
    }
  })
})
