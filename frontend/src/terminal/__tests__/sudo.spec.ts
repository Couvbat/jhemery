import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Localised } from '@/content/types'
import type { Command, CommandContext, OutputLine } from '../types'

const admin = vi.hoisted(() => ({
  unlocked: false,
  unlockAdmin: vi.fn(),
  lockAdmin: vi.fn(),
}))
vi.mock('@/lib/admin', () => ({
  isAdmin: { get value() { return admin.unlocked } },
  unlockAdmin: admin.unlockAdmin,
  lockAdmin: admin.lockAdmin,
}))
vi.mock('@/composables/useCrt', () => ({ prefersReducedMotion: () => true }))
vi.mock('@/composables/useSceneControl', () => ({
  MAX_SHAPE_COUNT: 60,
  resetScene: vi.fn(),
  setConstellation: vi.fn(),
  setGravity: vi.fn(),
  spawnShapes: vi.fn(),
  useSceneControl: () => ({}),
}))

import { eggCommands } from '../commands/eggs'

/**
 * `sudo -i` is the owner's unlock; `sudo -k` the lock. The password itself is
 * checked by `lib/admin.ts` (its own spec); these cover the shell's side — the
 * masked prompt, and that each verdict gets its own line.
 */
function context(args: string[], answer = ''): CommandContext & { prompts: string[] } {
  const prompts: string[] = []
  return {
    prompts,
    args,
    raw: args.join(' '),
    locale: 'en',
    t: (<T,>(value: Localised<T>) => value.en) as CommandContext['t'],
    print: () => {},
    frame: () => () => {},
    clear: () => {},
    close: () => {},
    navigate: () => true,
    prompt: (question: string) => {
      prompts.push(question)
      return Promise.resolve(answer)
    },
    capture: () => () => {},
    run: () => Promise.resolve(),
    effects: {} as CommandContext['effects'],
    signal: new AbortController().signal,
  }
}

const sudo = (): Command => eggCommands.find((c) => c.name === 'sudo')!

async function run(args: string[], answer?: string) {
  const ctx = context(args, answer)
  const out = ((await sudo().run(ctx)) ?? []) as OutputLine[]
  return { ctx, out, text: out.map((l) => l.text ?? '') }
}

describe('sudo -i', () => {
  beforeEach(() => {
    admin.unlocked = false
    admin.unlockAdmin.mockReset()
    admin.lockAdmin.mockReset()
  })

  it('asks for the password, masked, and reports root on success', async () => {
    admin.unlockAdmin.mockResolvedValue('ok')
    const { ctx, out, text } = await run(['-i'], 'letmein')

    expect(ctx.prompts).toEqual(['[sudo] password for visitor:'])
    expect(admin.unlockAdmin).toHaveBeenCalledWith('letmein')
    expect(out[0]).toMatchObject({ tone: 'success' })
    expect(text[0]).toMatch(/^root@/)
    expect(text[1]).toContain('cd tools/download')
  })

  it('says so on a wrong password, and on an API it cannot reach', async () => {
    admin.unlockAdmin.mockResolvedValue('wrong')
    expect((await run(['-i'], 'guess')).out[0]).toMatchObject({ tone: 'error', text: 'Sorry, try again.' })

    admin.unlockAdmin.mockResolvedValue('unreachable')
    expect((await run(['su'], 'guess')).text[0]).toContain('unable to reach the API')
  })

  it('does nothing on an empty password', async () => {
    const { out } = await run(['-i'], '')
    expect(admin.unlockAdmin).not.toHaveBeenCalled()
    expect(out[0]).toMatchObject({ tone: 'error' })
  })

  it('is idempotent once root, and -k drops the credentials', async () => {
    admin.unlocked = true
    const { ctx, text } = await run(['-i'])
    expect(ctx.prompts).toEqual([])
    expect(text[0]).toContain('already root')

    await run(['-k'])
    expect(admin.lockAdmin).toHaveBeenCalled()
  })

  it('still refuses anything else', async () => {
    const { out } = await run(['make', 'me', 'a', 'sandwich'])
    expect(out.at(-1)).toMatchObject({ tone: 'error' })
    expect(admin.unlockAdmin).not.toHaveBeenCalled()
  })
})
