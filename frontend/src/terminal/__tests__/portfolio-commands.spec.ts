import { describe, expect, it, vi } from 'vitest'
import { education, experience, now, profile, skills, work } from '@/content'
import { REPO } from '@/lib/source'
import { contentCommands } from '../commands/content'
import { resolveFileLines } from '../commands/files'
import { runCommand } from './context'
import { workLines } from '../work'

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

describe('projects', () => {
  const t = <T,>(value: { en: T; fr: T }) => value.en

  it('points at the case studies after the cards', async () => {
    const { text } = await runCommand(command('projects'))
    for (const part of work) expect(text).toContain(part.id)
  })

  it('prints one case study, and suggests the nearest for a typo', async () => {
    const qr = work.find((p) => p.id === 'qr')!
    expect((await runCommand(command('projects'), ['qr'])).lines).toEqual(workLines(qr, t))
    expect((await runCommand(command('projects'), ['QR'])).lines).toEqual(workLines(qr, t))

    const { lines, text } = await runCommand(command('projects'), ['presense'])
    expect(lines[0]).toMatchObject({ tone: 'error' })
    expect(text).toContain('`projects presence`')
  })

  it('--json stays an array, with the parts on this site’s own entry', async () => {
    const payload = JSON.parse((await runCommand(command('projects'), ['--json'])).text)
    expect(Array.isArray(payload)).toBe(true)
    const own = payload.filter((p: { parts?: unknown }) => p.parts)
    expect(own).toHaveLength(1)
    expect(own[0].repo).toBe(REPO)
    expect(own[0].parts.map((p: { id: string }) => p.id)).toEqual(work.map((p) => p.id))
    expect(own[0].parts[0].url).toBe(`/work/${work[0]!.id}`)
  })

  it('completes --json and the part ids', () => {
    expect(command('projects').complete!({ args: [''], index: 0, word: '' })).toEqual(['--json', ...work.map((p) => p.id)])
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

  it('reads every role from the content, with its length worked out today', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'))
    try {
      const text = (await runCommand(command('resume'))).lines.map((l) => l.text).join('\n')
      const positions = experience.map((role) => text.indexOf(`${role.employer.en} — ${role.title.en}`))
      for (const position of positions) expect(position).toBeGreaterThan(-1)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
      expect(text).toContain('(3 years)')
      expect(text).toContain('(7 months)')
      for (const course of education) expect(text).toContain(course.school.en)
      // Every heading is localised, the new ones and the old ones alike.
      const fr = (await runCommand(command('resume'), [], { locale: 'fr' })).lines.map((l) => l.text)
      expect(fr).toEqual(expect.arrayContaining(['EXPÉRIENCE', 'FORMATION', 'COMPÉTENCES', 'LIENS']))
    } finally {
      vi.useRealTimers()
    }
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
