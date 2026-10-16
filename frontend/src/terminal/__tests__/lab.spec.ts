import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY, liveReport, OFF } from '@/lib/__tests__/lab-fixture'
import { runCommand } from './context'

const api = vi.hoisted(() => ({ lab: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, ...api } }
})

import { lab } from '../commands/lab'

beforeEach(() => {
  api.lab.mockReset().mockResolvedValue(liveReport(42_000))
})

describe('lab', () => {
  it('prints one row per node with its state and a figure, then the age and the map', async () => {
    const { lines } = await runCommand(lab)
    const row = (id: string) => lines.find((l) => l.text.includes(` ${id} `))!.text
    expect(row('poseidon')).toMatch(/^● poseidon\s+up\s+CPU 8 % · 47 °C$/)
    expect(row('n8n')).toMatch(/^○ n8n\s+down\s*$/)
    expect(row('umami')).toMatch(/41 ms$/)
    expect(lines.some((l) => l.text === 'live · snapshot 42 s old')).toBe(true)
    expect(lines.at(-1)).toMatchObject({ text: 'map: /lab', href: '/lab' })
  })

  it('leaves out the nodes that have no status', async () => {
    const { text } = await runCommand(lab)
    expect(text).not.toMatch(/\bvisitor\b|\btailscale\b/)
  })

  it('reads the lab as stale, with the age, five minutes on', async () => {
    api.lab.mockResolvedValue(liveReport(3 * 3_600_000))
    const { lines } = await runCommand(lab)
    expect(lines.find((l) => l.text.includes(' poseidon '))!.text).toContain('stale')
    expect(lines.some((l) => l.text === 'last seen 3 h ago — the lab may be asleep' && l.tone === 'warning')).toBe(true)
  })

  it.each([
    ['unconfigured', OFF, 'live data is off here'],
    ['empty', EMPTY, 'the lab hasn’t reported yet'],
  ])('says so in one line when %s, and points at hardware nas', async (_, report, words) => {
    api.lab.mockResolvedValue(report)
    const { lines } = await runCommand(lab)
    expect(lines.at(-1)!.text).toBe(`${words} — \`hardware nas\` has the machines’ specs.`)
  })

  it('says the API is unreachable when it does not answer, in French too', async () => {
    api.lab.mockRejectedValue(new Error('offline'))
    const { lines } = await runCommand(lab, [], { locale: 'fr' })
    expect(lines.at(-1)!.text).toBe('l’API ne répond pas — `hardware nas` donne les caractéristiques des machines.')
  })

  it('prints the snapshot as JSON for a pipe, and nothing else', async () => {
    const { lines } = await runCommand(lab, ['--json'], { interactive: false })
    const parsed = JSON.parse(lines.map((l) => l.text).join('\n')) as { machines: Array<{ id: string }> }
    expect(parsed.machines.map((m) => m.id)).toEqual(['poseidon', 'optimus'])
  })

  it('fails on --json when there is no snapshot to print', async () => {
    api.lab.mockResolvedValue(OFF)
    const { lines } = await runCommand(lab, ['--json'], { interactive: false })
    expect(lines).toEqual([expect.objectContaining({ text: 'lab: live data is off here', stderr: true })])
  })

  it('reads and writes nothing else: linkable, visible, in the palette', () => {
    expect(lab).toMatchObject({ writes: 'none', linkable: true, palette: true, group: 'live' })
    expect(lab.hidden).toBeFalsy()
  })
})
