import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HealthReport } from '@/lib/api'
import { runCommand } from './context'

const api = vi.hoisted(() => ({ health: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, ...api } }
})

import { span, systemctl, UNITS } from '../commands/systemctl'

const REPORT: HealthReport = {
  uptime: 7_500,
  units: [
    { unit: 'steam', state: 'active', cacheAge: 180_000 },
    { unit: 'presence', state: 'active', detail: { online: 3 } },
    { unit: 'ask', state: 'inactive', reason: 'disabled' },
    { unit: 'guestbook', state: 'inactive', reason: 'disabled' },
    { unit: 'weather', state: 'inactive', reason: 'unconfigured' },
  ],
}

beforeEach(() => {
  api.health.mockReset().mockResolvedValue(REPORT)
})

describe('systemctl status', () => {
  it('lists every unit, one line each, with why it is in that state', async () => {
    const { lines } = await runCommand(systemctl, ['status'])
    const row = (unit: string) => lines.find((l) => l.text.includes(`${unit}.service`))!.text

    expect(row('steam')).toMatch(/^● steam\.service\s+active \(running\)\s+cached 3 min ago$/)
    expect(row('presence')).toContain('3 here now')
    expect(row('ask')).toMatch(/^○ ask\.service\s+inactive \(dead\)\s+the model is asleep$/)
    expect(row('guestbook')).toContain('switched off')
    expect(row('weather')).toContain('not configured on this server')
    expect(lines.at(-1)!.text).toContain('API up 2h 05')
  })

  it('reads every unit as unknown when the API does not answer — the true answer', async () => {
    api.health.mockRejectedValue(new Error('down'))
    const { lines } = await runCommand(systemctl, [])
    const rows = lines.filter((l) => l.text.includes('.service'))
    expect(rows).toHaveLength(UNITS.length)
    expect(rows.every((l) => l.text.startsWith('? ') && l.text.includes('unknown'))).toBe(true)
  })

  it('shows one unit in detail, with or without the .service suffix', async () => {
    const plain = (await runCommand(systemctl, ['status', 'ask'])).text
    expect(plain).toContain('○ ask.service - The local model behind `ask`')
    expect(plain).toContain('Active: inactive (dead) — the model is asleep')
    expect((await runCommand(systemctl, ['status', 'steam.service'])).text).toContain(
      'Loaded: loaded (/etc/systemd/system/steam.service; enabled',
    )
  })

  it('does not know units that do not exist', async () => {
    expect((await runCommand(systemctl, ['status', 'sshd'])).text).toContain('Unit sshd.service could not be found.')
  })

  it('refuses every verb that would change something, without asking the API', async () => {
    const { text } = await runCommand(systemctl, ['restart', 'steam'])
    expect(text).toContain('Failed to restart steam.service: Access denied')
    expect(api.health).not.toHaveBeenCalled()
  })

  it('answers in French', async () => {
    const { text } = await runCommand(systemctl, ['status'], { locale: 'fr' })
    expect(text).toContain('le modèle dort')
  })
})

describe('span', () => {
  it('reads at a glance', () => {
    expect(span(42_000)).toBe('42s')
    expect(span(180_000)).toBe('3 min')
    expect(span(7_500_000)).toBe('2h 05')
    expect(span(3 * 86_400_000)).toBe('3d')
  })
})
