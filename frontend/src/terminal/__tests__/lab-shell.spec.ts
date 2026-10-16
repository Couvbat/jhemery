import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { labMachines } from '@/content/lab'
import type { LabReport } from '@/lib/api'
import { EMPTY, liveReport, OFF } from '@/lib/__tests__/lab-fixture'

const api = vi.hoisted(() => ({ lab: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, ...api } }
})
vi.mock('@/composables/useCrt', () => ({ prefersReducedMotion: () => false }))

import { setMotion } from '@/composables/useMotion'
import { unlocked } from '../achievements'
import { labLogin } from '../lab-shell'
import { answer } from '../lab-shell/commands'
import { glances, GLANCES_REFRESH_MS } from '../lab-shell/glances'
import type { LabSession } from '../lab-shell/session'
import { resolve, writesOf } from '../registry'
import { abortError } from '../timing'
import type { OutputLine } from '../types'
import { recordingContext } from './context'

const ssh = resolve('ssh')!
const host = (id: string) => labMachines.find((node) => node.id === id)!
const session = (id = 'poseidon', report: LabReport | null = liveReport(40_000)): LabSession => ({
  host: host(id),
  report,
  fetchedAt: Date.now(),
  locale: 'en',
})
const text = (lines: OutputLine[]) => lines.map((l) => l.text).join('\n')

/**
 * Runs `ssh <target>` with a visitor who types `answers` in turn at each prompt, then
 * presses Ctrl+C when they run out. Each answer is echoed as the shell echoes an inline
 * prompt, so the output reads as the screen would.
 */
async function session$(target: string, answers: string[], options: { interactive?: boolean } = {}) {
  const recorded = recordingContext('ssh', [target], options)
  const asked: string[] = []
  if (options.interactive !== false) {
    recorded.ctx.prompt = async (question) => {
      asked.push(question)
      const next = answers.shift()
      if (next === undefined) throw abortError()
      recorded.printed.push({ text: `${question} ${next}` })
      return next
    }
  }
  const returned = (await ssh.run(recorded.ctx)) ?? []
  const lines = [...recorded.printed, ...returned]
  return { ...recorded, asked, lines, text: text(lines) }
}

beforeEach(() => {
  setMotion('paused')
  unlocked.value = new Set()
  window.localStorage.clear()
  api.lab.mockReset().mockResolvedValue(liveReport(40_000))
})

afterEach(() => {
  vi.useRealTimers()
  setMotion('full')
})

describe('ssh to the lab: getting in', () => {
  it('reads the lab’s machines, its one account, and any case', () => {
    expect(labLogin('poseidon')).toEqual({ host: host('poseidon') })
    expect(labLogin('jules@optimus')).toEqual({ host: host('optimus') })
    expect(labLogin('Poseidon')).toEqual({ host: host('poseidon') })
  })

  it('refuses root as a real box would, and names the one account to anyone else', () => {
    expect(text((labLogin('root@poseidon') as { refused: OutputLine[] }).refused)).toBe(
      'root@poseidon: Permission denied (publickey).\nroot can’t log in over ssh here.',
    )
    expect(text((labLogin('couvbat@optimus') as { refused: OutputLine[] }).refused)).toContain(
      'there is exactly one account on optimus, and it is `jules`.',
    )
  })

  it('leaves every other host to the site’s own ssh', async () => {
    expect(labLogin('jhemery.xyz')).toBeUndefined()
    expect(labLogin('hephaistos')).toBeUndefined()
    const { lines } = await session$('hephaistos', [])
    expect(lines).toEqual([expect.objectContaining({ text: 'ssh: Could not resolve hostname hephaistos: Name or service not known' })])
    const site = await session$('couvbat@jhemery.xyz', [])
    expect(site.text).toContain('connected. (boot animation skipped: motion paused)')
    expect(api.lab).not.toHaveBeenCalled()
  })

  it('offers the machines for Tab after its own two targets', () => {
    expect(ssh.complete!({ index: 0 } as Parameters<NonNullable<typeof ssh.complete>>[0])).toEqual([
      'couvbat@jhemery.xyz',
      'contact@jhemery.xyz',
      ...labMachines.map((node) => node.id),
    ])
    expect(labMachines.map((node) => node.id).sort()).toEqual(['optimus', 'poseidon'])
  })

  it('still writes nothing and stays hidden', () => {
    expect(writesOf(ssh, ['poseidon'])).toBe('none')
    expect(ssh.hidden).toBe(true)
  })
})

describe('the banner', () => {
  it('says it is simulated, then reads the snapshot', async () => {
    const { lines } = await session$('poseidon', ['exit'])
    const at = lines.findIndex((l) => l.text === 'simulated shell — the numbers are real, the shell isn’t.')
    expect(lines.slice(at, at + 4).map((l) => l.text)).toEqual([
      'simulated shell — the numbers are real, the shell isn’t.',
      'poseidon · TrueNAS CE · MSI MEG Trident X 10th',
      'up 12 days · load 0.42 · pool tank ONLINE, 61 % used',
      'snapshot 40 s old · `exit` to leave',
    ])
  })

  it('gives a stale snapshot’s age as a warning', async () => {
    api.lab.mockResolvedValue(liveReport(3 * 3_600_000))
    const { lines } = await session$('poseidon', ['exit'])
    expect(lines).toContainEqual(
      expect.objectContaining({ text: 'snapshot 3 h old — the lab may be asleep · `exit` to leave', tone: 'warning' }),
    )
  })

  it.each([
    ['unconfigured', () => api.lab.mockResolvedValue(OFF)],
    ['empty', () => api.lab.mockResolvedValue(EMPTY)],
    ['unreachable', () => api.lab.mockRejectedValue(new Error('offline'))],
  ])('still opens when the feed is %s, on specs alone', async (_, arrange) => {
    arrange()
    const { text: out, asked } = await session$('optimus', ['exit'])
    expect(out).toContain('optimus · TrueNAS CE · Dell Optiplex 990 SFF')
    expect(out).toContain('live feed off — what follows are specs, not readings')
    expect(asked).toEqual(['jules@optimus:~$'])
  })
})

describe('inside', () => {
  const live = liveReport(40_000)
  it.each<[string, string, LabReport | null, string | RegExp]>([
    ['poseidon', 'uptime', live, '19:42:01 up 12 days, load average: 0.42'],
    ['poseidon', 'free -h', live, /Mem:\s+16 GB\s+6\.6 GB\s+9\.4 GB/],
    ['poseidon', 'zpool list', live, /tank\s+61 %\s+ONLINE/],
    ['poseidon', 'zpool status', live, '  pool: tank\n state: ONLINE\n   cap: 61 % used\nerrors: No known data errors'],
    ['poseidon', 'nvidia-smi', live, 'GPU 0: MSI RTX 3080 GAMING X TRIO 10G\nutil 3 % · VRAM 2.1 GB / 10 GB · 44 °C · 31 W'],
    ['poseidon', 'ollama ps', live, /gemma4:e4b\s+2\.1 GB/],
    ['poseidon', 'ollama list', live, /qwen3:8b\s+5\.2 GB/],
    ['poseidon', 'ollama run gemma4', live, 'the real one is wired to `ask`. exit and try `ask <question>`.'],
    ['poseidon', 'docker ps', live, '6 containers running — their names stay off the public feed'],
    ['poseidon', 'neofetch', live, /^jules@poseidon\n-+\nOS: TrueNAS CE\nHost: MSI MEG Trident X 10th\nUptime: 12 days\n/],
    ['poseidon', 'cat /etc/motd', live, 'simulated shell — the numbers are real, the shell isn’t.'],
    ['poseidon', 'cat .bashrc', live, 'cat: .bashrc: Permission denied'],
    ['poseidon', 'hostname', live, 'poseidon'],
    ['poseidon', 'whoami', live, 'jules'],
    ['poseidon', 'pwd', live, '/home/jules'],
    ['poseidon', 'ls', live, '.bash_history  .bashrc  .ssh'],
    ['poseidon', 'sudo reboot', live, 'jules is not in the sudoers file. This incident will be reported.'],
    ['poseidon', 'rm -rf /', live, 'nice try. this shell can’t delete anything; it can barely read.'],
    ['poseidon', 'frobnicate --now', live, 'bash: frobnicate: command not found'],
    ['optimus', 'nvidia-smi', live, 'bash: nvidia-smi: command not found'],
    ['optimus', 'ollama ps', live, 'bash: ollama: command not found'],
    ['optimus', 'zpool list', live, /data\s+74 %\s+ONLINE/],
    ['optimus', 'docker ps', live, '9 containers running'],
    ['poseidon', 'uptime', OFF, 'uptime: no live reading: the feed is off'],
    ['poseidon', 'free -h', null, /Mem:\s+16 GB\s+\?\s+\?\nfree: no live reading/],
    ['poseidon', 'nvidia-smi', OFF, 'GPU 0: MSI RTX 3080 GAMING X TRIO 10G\nnvidia-smi: no live reading'],
  ])('%s: %s', (machine, input, report, expected) => {
    const out = text(answer(input, session(machine, report)))
    if (typeof expected === 'string') expect(out).toContain(expected)
    else expect(out).toMatch(expected)
  })

  it('lists the services the map puts on the machine, never container names', () => {
    const out = text(answer('docker ps', session('poseidon')))
    expect(out).toContain('what the map puts here: Ollama')
  })

  it('agrees with the lab command’s formatting, in French too', () => {
    const fr = { ...session('poseidon'), locale: 'fr' as const }
    expect(text(answer('zpool status', fr))).toContain('   cap: 61 % occupé')
    expect(text(answer('free -h', fr))).toMatch(/16 Go\s+6,6 Go/)
  })
})

describe('the loop', () => {
  it('prompts as the machine, answers each line, and closes on exit', async () => {
    const { text: out, asked } = await session$('poseidon', ['hostname', 'exit'])
    expect(asked).toEqual(['jules@poseidon:~$', 'jules@poseidon:~$'])
    expect(out).toMatch(/jules@poseidon:~\$ hostname\nposeidon\njules@poseidon:~\$ exit\nConnection to poseidon closed\.$/)
  })

  it('hops to the other machine and back', async () => {
    const { text: out, asked } = await session$('poseidon', ['ssh optimus', 'hostname', 'exit', 'hostname', 'logout'])
    expect(asked).toEqual(['jules@poseidon:~$', 'jules@optimus:~$', 'jules@optimus:~$', 'jules@poseidon:~$', 'jules@poseidon:~$'])
    expect(out).toContain('optimus · TrueNAS CE · Dell Optiplex 990 SFF')
    expect(out).toMatch(/Connection to optimus closed\.\njules@poseidon:~\$ hostname\nposeidon/)
    expect(api.lab).toHaveBeenCalledTimes(1)
  })

  it('refuses a hop as ssh would', async () => {
    const { text: out } = await session$('poseidon', ['ssh root@optimus', 'ssh atlantis', 'exit'])
    expect(out).toContain('root@optimus: Permission denied (publickey).')
    expect(out).toContain('ssh: Could not resolve hostname atlantis: Name or service not known')
  })

  it('ends every hop at once on Ctrl+C', async () => {
    const { lines } = await session$('poseidon', ['ssh optimus'])
    expect(lines.slice(-2).map((l) => l.text)).toEqual(['Connection to optimus closed.', 'Connection to poseidon closed.'])
  })

  it('prints the banner inside a pipe, then fails: there is nobody to prompt', async () => {
    const recorded = recordingContext('ssh', ['poseidon'], { interactive: false })
    await expect(ssh.run(recorded.ctx)).rejects.toThrow(/nobody at the keyboard/)
    expect(text(recorded.printed)).toContain('simulated shell — the numbers are real, the shell isn’t.')
    expect(unlocked.value.has('labRat')).toBe(false)
  })
})

describe('labRat', () => {
  it('unlocks on reaching the prompt, with the feed off', async () => {
    api.lab.mockRejectedValue(new Error('offline'))
    const { text: out } = await session$('poseidon', ['exit'])
    expect(unlocked.value.has('labRat')).toBe(true)
    expect(out).toContain('achievement unlocked: Lab Rat')
  })
})

describe('glances', () => {
  const flush = () => vi.advanceTimersByTimeAsync(0)

  it('draws one frame, refetches on the timer and on r, and q gives the keyboard back', async () => {
    vi.useFakeTimers()
    setMotion('full')
    const fetch = vi.fn().mockResolvedValue(liveReport(1_000))
    const recorded = recordingContext('ssh')
    const s = session()
    const done = glances(recorded.ctx, s, fetch)
    expect(recorded.printed[0]!.text).toMatch(/^glances · poseidon · snapshot 40 s old · q to quit/)
    expect(text(recorded.printed)).toMatch(/CPU\s+\[\|{2} +\] 8 %/)

    await vi.advanceTimersByTimeAsync(GLANCES_REFRESH_MS)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(recorded.printed[0]!.text).toMatch(/snapshot 1 s old/)

    recorded.press('r')
    await flush()
    expect(fetch).toHaveBeenCalledTimes(2)

    const height = recorded.printed.length
    recorded.press('q')
    await done
    recorded.press('r')
    await vi.advanceTimersByTimeAsync(GLANCES_REFRESH_MS * 3)
    expect(fetch).toHaveBeenCalledTimes(2)
    // Redrawn in place, never stacked.
    expect(recorded.printed).toHaveLength(height)
  })

  it('keeps the last figures when a refetch fails', async () => {
    vi.useFakeTimers()
    setMotion('full')
    const recorded = recordingContext('ssh')
    const s = session()
    const done = glances(recorded.ctx, s, vi.fn().mockResolvedValue(null))
    recorded.press('r')
    await flush()
    expect(s.report).not.toBeNull()
    expect(text(recorded.printed)).toContain('tank ONLINE, 61 % used')
    recorded.press('Escape')
    await done
  })

  it('draws once at paused motion, and only redraws on r', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockResolvedValue(liveReport(1_000))
    const recorded = recordingContext('ssh')
    const done = glances(recorded.ctx, session(), fetch)
    await vi.advanceTimersByTimeAsync(GLANCES_REFRESH_MS * 3)
    expect(fetch).not.toHaveBeenCalled()
    recorded.press('r')
    await flush()
    expect(fetch).toHaveBeenCalledTimes(1)
    recorded.press('q')
    await done
  })

  it('ends with the command on Ctrl+C', async () => {
    const controller = new AbortController()
    const recorded = recordingContext('ssh', [], { signal: controller.signal })
    const done = glances(recorded.ctx, session(), vi.fn())
    controller.abort()
    await expect(done).rejects.toMatchObject({ name: 'AbortError' })
  })
})
