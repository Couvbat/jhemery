import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Localised } from '@/content/types'
import { runCommand } from './context'

vi.mock('@/composables/useCrt', async (original) => ({
  ...(await original<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => true,
}))

const t = <T,>(value: Localised<T>): T => value.en
const FLAG = /CTF\{[0-9a-f]{16}\}/
const rot13 = (text: string) =>
  text.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
  })

/** Progress lives at module scope, hydrated from localStorage: reload per test. */
async function load() {
  vi.resetModules()
  const [ctf, { ctfCommands }, achievements] = await Promise.all([
    import('../ctf'),
    import('../commands/ctf'),
    import('../achievements'),
  ])
  const command = (name: string) => ctfCommands.find((c) => c.name === name)!
  return { ...ctf, command, achievements }
}

/**
 * Each flag, pulled out of the surface that carries it — not typed into this file.
 * If a surface loses its flag, or carries a different one, the chain breaks here.
 */
async function flagsFromSurfaces(): Promise<string[]> {
  const found: string[] = []
  const take = (text: string, where: string) => {
    const match = FLAG.exec(text)
    expect(match, `no flag in ${where}`).not.toBeNull()
    found.push(match![0])
  }

  const { secretContents } = await import('../commands/secret')
  take(secretContents(t).map((l) => l.text).join('\n'), '.secret')

  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const { greet } = await import('@/console-greeting')
  greet()
  const blob = log.mock.calls.map((call) => String(call[0])).find((arg) => /^%c[A-Za-z0-9+/]+=*$/.test(arg))
  expect(blob, 'no base64 line in the console greeting').toBeDefined()
  take(atob(blob!.slice(2)), 'the console')

  const { buildResume } = await import('../../../vite-plugins/resume')
  const resume = buildResume()
  // Inside an SGR 8 (conceal) run: in the bytes, not on the screen.
  expect(resume).toContain('\u001b[8m  CTF{')
  take(resume, 'resume.txt')

  const { resolveFileLines, SHADOW_FILE } = await import('../commands/files')
  const shadow = resolveFileLines(SHADOW_FILE, t)!.map((l) => l.text).join('\n')
  expect(shadow, 'the shadow file is stored rotated').not.toMatch(FLAG)
  take(rot13(shadow), '/etc/shadow')

  const { eggCommands } = await import('../commands/eggs')
  const hack = eggCommands.find((c) => c.name === 'hack')!
  take((await runCommand(hack, ['gibson'])).text, 'hack gibson')

  const { systemCommands } = await import('../commands/system')
  take((await runCommand(systemCommands.find((c) => c.name === 'top')!)).text, 'top')

  take(readFileSync(join(process.cwd(), 'public/llms.txt'), 'utf8'), 'llms.txt')
  return found
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('the chain, end to end', () => {
  it('has a flag on every surface, each matching its stage in order', async () => {
    const { stages, STAGE_HASHES, sha256Hex } = await load()
    const flags = await flagsFromSurfaces()
    expect(flags).toHaveLength(7)
    for (const [i, flag] of flags.entries()) {
      expect(await sha256Hex(flag), stages[i]!.id).toBe(STAGE_HASHES[stages[i]!.id])
    }
  })

  it('opens the sealed finale with exactly those seven flags, and its flag is stage 8', async () => {
    const { unseal, sha256Hex, STAGE_HASHES } = await load()
    const flags = await flagsFromSurfaces()
    const payoff = await unseal(flags)
    expect(await sha256Hex(payoff.flag)).toBe(STAGE_HASHES.root)
    expect(payoff.en.join('\n')).toContain('root')
    expect(payoff.fr.join('\n')).toContain('root')
    await expect(unseal([...flags.slice(0, 6), 'CTF{0000000000000000}'])).rejects.toThrow()
  })

  it('can be played through: seven flags, then decrypt', async () => {
    const flags = await flagsFromSurfaces()
    const { command, solvedCount, currentStage } = await load()
    for (const flag of flags) {
      const { text } = await runCommand(command('flag'), [flag])
      expect(text).toContain('solved')
    }
    expect(currentStage()?.id).toBe('root')

    const { text } = await runCommand(command('decrypt'))
    expect(text).toContain('Seven flags')
    expect(text).toContain('stage 8 solved')
    expect(solvedCount.value).toBe(8)
    expect(currentStage()).toBeUndefined()

    // A second run shows the message again without pretending to solve anything.
    expect((await runCommand(command('decrypt'))).text).toContain('already solved')
  })

  it('starts from robots.txt', () => {
    expect(readFileSync(join(process.cwd(), 'public/robots.txt'), 'utf8')).toContain('# Disallow: /ctf')
  })
})

describe('flag', () => {
  it('refuses a real flag submitted out of order, naming the stage you are on', async () => {
    const flags = await flagsFromSurfaces()
    const { submitFlag, solvedCount } = await load()
    const verdict = await submitFlag(flags[3]!)
    expect(verdict).toMatchObject({ kind: 'order', stage: { id: 'shadow' }, current: { id: 'secret' } })
    expect(solvedCount.value).toBe(0)
  })

  it('says a solved stage is already solved', async () => {
    const [first] = await flagsFromSurfaces()
    const { submitFlag } = await load()
    await submitFlag(first!)
    expect(await submitFlag(first!)).toMatchObject({ kind: 'already', stage: { id: 'secret' } })
  })

  it('forgives case on the wrapper and the digits', async () => {
    const [first] = await flagsFromSurfaces()
    const { submitFlag } = await load()
    expect(await submitFlag(first!.toUpperCase().replace('CTF', 'ctf'))).toMatchObject({ kind: 'solved' })
  })

  it('tells a malformed flag from a wrong one', async () => {
    const { submitFlag } = await load()
    expect(await submitFlag('hunter2')).toEqual({ kind: 'malformed' })
    expect(await submitFlag('CTF{0123456789abcdef}')).toMatchObject({ kind: 'wrong', misses: 1 })
  })

  it('sharpens the hint after three misses, and again after six', async () => {
    const { command, stages } = await load()
    const wrong = () => runCommand(command('flag'), ['CTF{0123456789abcdef}'])
    const [, , third] = [await wrong(), await wrong(), await wrong()]
    expect(third.text).toContain(stages[0]!.hints[1].en)
    const [, , sixth] = [await wrong(), await wrong(), await wrong()]
    expect(sixth.text).toContain(stages[0]!.hints[2].en)
  })

  it('unlocks firstBlood on the first stage, and persists progress', async () => {
    const [first] = await flagsFromSurfaces()
    const { command } = await load()
    const { text } = await runCommand(command('flag'), [first!])
    expect(text).toContain('achievement unlocked: First Blood')

    const reloaded = await load()
    expect(reloaded.solvedCount.value).toBe(1)
    expect(reloaded.achievements.isUnlocked('firstBlood')).toBe(true)
  })
})

describe('ctf', () => {
  it('shows solved flags, the current hint, and nothing about later stages', async () => {
    const [first] = await flagsFromSurfaces()
    const { command, submitFlag, stages } = await load()
    await submitFlag(first!)

    const { text } = await runCommand(command('ctf'))
    expect(text).toContain('1/8 flags')
    expect(text).toContain(first)
    expect(text).toContain(stages[1]!.hints[0].en)
    expect(text).not.toContain(stages[2]!.hints[0].en)
    expect(text.match(new RegExp(FLAG, 'g'))).toHaveLength(1)
  })
})

describe('decrypt', () => {
  it('names the stages still missing', async () => {
    const [first] = await flagsFromSurfaces()
    const { command, submitFlag } = await load()
    await submitFlag(first!)
    const { text } = await runCommand(command('decrypt'))
    expect(text).toContain('1 of 7 flags')
    expect(text).toContain('2, 3, 4, 5, 6, 7')
  })
})

describe('the surfaces stay what they were', () => {
  it('hack still denies every other target', async () => {
    const { eggCommands } = await import('../commands/eggs')
    const { text } = await runCommand(eggCommands.find((c) => c.name === 'hack')!, ['mainframe'])
    expect(text).toContain('ACCESS DENIED')
    expect(text).not.toMatch(FLAG)
  })

  it('ps never shows the ghost', async () => {
    const { systemCommands } = await import('../commands/system')
    const { text } = await runCommand(systemCommands.find((c) => c.name === 'ps')!)
    expect(text).not.toContain('ghost')
  })
})
