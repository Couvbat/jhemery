import { beforeEach, describe, expect, it, vi } from 'vitest'

// Motion held at paused, the floor the OS setting sets, so `ping` replies without pacing.
vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => true,
}))

import type { Localised } from '@/content/types'
import { profile, work } from '@/content'
import { activeView } from '@/composables/useViewSwing'
import { tools, visibleTools } from '@/tools/registry'
import { navigateCommands } from '../commands/navigate'
import { toolCommands } from '../commands/tools'
import type { Command, CommandContext, OutputLine } from '../types'

/**
 * `cd`, `ls`, `pwd` and `tools` after the site grew a second page. The commands only
 * *resolve* and *print*; going there is `ctx.navigate`, which is stubbed and asserted
 * on. Where a swing actually takes the browser is `useViewSwing.spec.ts`'s business.
 */

function context(args: string[] = []): CommandContext & { navigated: string[] } {
  const navigated: string[] = []
  return {
    navigated,
    args,
    raw: args.join(' '),
    tty: true,
    locale: 'en',
    t: (<T,>(value: Localised<T>) => value.en) as CommandContext['t'],
    print: () => {},
    frame: () => () => {},
    clear: () => {},
    close: () => {},
    navigate: (target: string) => {
      navigated.push(target)
      return true
    },
    prompt: () => Promise.resolve(''),
    capture: () => () => {},
    run: () => Promise.resolve(),
    effects: {} as CommandContext['effects'],
    signal: new AbortController().signal,
  }
}

function command(name: string): Command {
  return [...navigateCommands, ...toolCommands].find((c) => c.name === name)!
}

async function run(name: string, ...args: string[]) {
  const ctx = context(args)
  const out = ((await command(name).run(ctx)) ?? []) as OutputLine[]
  return { ctx, out, text: out.map((l) => l.text) }
}

beforeEach(() => {
  activeView.value = 'home'
  window.localStorage.clear()
})

describe('cd', () => {
  it('goes to a section and says where it went', async () => {
    const { ctx, text } = await run('cd', 'projects')
    expect(ctx.navigated).toEqual(['projects'])
    expect(text[0]).toBe('~/projects')
  })

  it('goes to a page, and to a tool inside it', async () => {
    expect((await run('cd', 'tools')).text[0]).toBe('~/tools')
    const { ctx, text } = await run('cd', 'tools/image')
    expect(ctx.navigated).toEqual(['tools/image'])
    expect(text[0]).toBe('~/tools/image')
  })

  it('joins a room by code, echoing it upper-case', async () => {
    const { ctx, text } = await run('cd', 'watch/ab3de')
    expect(ctx.navigated).toEqual(['watch/ab3de'])
    expect(text[0]).toBe('~/watch/AB3DE')
  })

  it('goes home on nothing, ~ or /, printing nothing', async () => {
    for (const args of [[], ['~'], ['/']]) {
      const { ctx, out } = await run('cd', ...args)
      expect(ctx.navigated).toHaveLength(1)
      // Nothing but achievement toasts, and those were emptied by `beforeEach`.
      expect(out.every((l) => l.tone !== 'muted')).toBe(true)
    }
  })

  it('refuses what does not exist, without navigating', async () => {
    for (const target of ['nope', 'tools/nope', 'projects/deeper', 'watch/abcd']) {
      const { ctx, out } = await run('cd', target)
      expect(ctx.navigated).toEqual([])
      expect(out[0]).toMatchObject({ tone: 'error', text: `cd: ${target}: No such file or directory` })
    }
  })

  it('takes back the path pwd prints', async () => {
    const printed = (await run('pwd')).text[0]!
    expect((await run('cd', printed)).ctx.navigated).toEqual(['about'])

    const { ctx, text } = await run('cd', `/home/${profile.handle}/tools/image`)
    expect(ctx.navigated).toEqual(['tools/image'])
    expect(text[0]).toBe('~/tools/image')
  })

  it('reads .. against where you are, and stops at home', async () => {
    activeView.value = 'tools'
    expect((await run('cd', '..')).ctx.navigated).toEqual([''])
    expect((await run('cd', '../projects')).ctx.navigated).toEqual(['projects'])
    expect((await run('cd', '../../..')).ctx.navigated).toEqual([''])
  })

  it('names what it was given when the path leads nowhere', async () => {
    for (const target of [`/home/someone/projects`, '../nope']) {
      const { ctx, out } = await run('cd', target)
      expect(ctx.navigated).toEqual([])
      expect(out[0]).toMatchObject({ tone: 'error', text: `cd: ${target}: No such file or directory` })
    }
  })

  it('reports a target the shell could not reach', async () => {
    const ctx = context(['tools'])
    ctx.navigate = () => false
    const out = (await command('cd').run(ctx)) as OutputLine[]
    expect(out[0]?.tone).toBe('error')
  })
})

describe('ping', () => {
  // It resolves a path to name the host, then goes there. Both have to read the same
  // path, or `ping ..` prints four replies from a host it then fails to reach.
  it('goes to the path it pinged, read as cd reads it', async () => {
    activeView.value = 'tools'
    expect((await run('ping', '..')).ctx.navigated).toEqual([''])
    expect((await run('ping', '../projects')).ctx.navigated).toEqual(['projects'])
    expect((await run('ping', `/home/${profile.handle}/tools/image`)).ctx.navigated).toEqual([
      'tools/image',
    ])
  })

  it('credits no visit to a section the shell could not reach', async () => {
    const ctx = context(['projects'])
    ctx.navigate = () => false
    await command('ping').run(ctx)
    expect(window.localStorage.getItem('couvbat:achievements:sections')).toBeNull()
  })
})

describe('ls', () => {
  it('lists the tools page among the directories', async () => {
    const { text } = await run('ls')
    expect(text.some((t) => t.startsWith('tools/'))).toBe(true)
    expect(text.some((t) => t.startsWith('projects/'))).toBe(true)
  })

  it('lists every visible tool for ls tools, and one for ls tools/<id>', async () => {
    const { text } = await run('ls', 'tools')
    // The admin tier is not in the listing until the owner unlocks it — but it does
    // exist, so `ls tools/download` still finds it.
    expect(text).toHaveLength(visibleTools().length)
    expect(visibleTools().length).toBe(tools.length - 1)
    for (const tool of visibleTools()) expect(text.some((t) => t.startsWith(tool.id))).toBe(true)
    expect(text.some((t) => t.startsWith('download'))).toBe(false)
    expect((await run('ls', 'tools/download')).text).toHaveLength(1)

    expect((await run('ls', 'tools/json')).text).toHaveLength(1)
  })

  it('lists the case studies under projects, treats any other section as empty, and an unknown path as an error', async () => {
    const { text } = await run('ls', 'projects')
    expect(text).toHaveLength(work.length)
    for (const part of work) expect(text.some((t) => t.startsWith(`${part.id}.md`))).toBe(true)
    expect((await run('ls', 'about')).out).toEqual([])
    expect((await run('ls', 'nope')).out[0]).toMatchObject({ tone: 'error' })
  })

  it('lets cat complete the case studies only once the word reaches into projects/', () => {
    const cat = navigateCommands.find((c) => c.name === 'cat')!
    expect(cat.complete!({ args: [''], index: 0, word: '' }).some((f) => f.startsWith('projects/'))).toBe(false)
    expect(cat.complete!({ args: ['projects/'], index: 0, word: 'projects/' })).toEqual(
      expect.arrayContaining(work.map((p) => `projects/${p.id}.md`)),
    )
  })

  it('reads . and .. as cd does', async () => {
    activeView.value = 'tools'
    expect((await run('ls', '.')).text).toHaveLength(visibleTools().length)
    expect((await run('ls', '..')).text.some((t) => t.startsWith('projects/'))).toBe(true)
  })

  it('still honours -a with a path', async () => {
    const plain = (await run('ls', '/')).text
    const all = (await run('ls', '-a', '/')).text
    expect(all.length).toBeGreaterThan(plain.length)
  })
})

describe('pwd', () => {
  it('prints the section on the home page and the path on another view', async () => {
    expect((await run('pwd')).text[0]).toMatch(/^\/home\/\w+\/about$/)
    activeView.value = 'tools'
    expect((await run('pwd')).text[0]).toMatch(/^\/home\/\w+\/tools$/)
  })
})

describe('tools', () => {
  it('lists every visible tool with its description', async () => {
    const { text } = await run('tools')
    expect(text.some((t) => t.startsWith('download'))).toBe(false)
    for (const tool of visibleTools()) {
      expect(text.some((t) => t.startsWith(tool.id) && t.includes(tool.description.en))).toBe(true)
    }
  })

  it('opens one', async () => {
    const { ctx, text } = await run('tools', 'json')
    expect(ctx.navigated).toEqual(['tools/json'])
    expect(text[0]).toBe('~/tools/json')
  })

  it('refuses an unknown one', async () => {
    const { ctx, out } = await run('tools', 'nope')
    expect(ctx.navigated).toEqual([])
    expect(out[0]).toMatchObject({ tone: 'error' })
  })

  it('completes tool ids', () => {
    expect(command('tools').complete!({ args: [''], index: 0, word: '' })).toEqual(
      visibleTools().map((t) => t.id),
    )
  })

  it('is in the palette', () => {
    expect(command('tools').palette).toBe(true)
  })
})
