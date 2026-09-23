import { beforeEach, describe, expect, it } from 'vitest'
import type { Localised } from '@/content/types'
import { activeView } from '@/composables/useViewSwing'
import { tools } from '@/tools/registry'
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

  it('reports a target the shell could not reach', async () => {
    const ctx = context(['tools'])
    ctx.navigate = () => false
    const out = (await command('cd').run(ctx)) as OutputLine[]
    expect(out[0]?.tone).toBe('error')
  })
})

describe('ls', () => {
  it('lists the tools page among the directories', async () => {
    const { text } = await run('ls')
    expect(text.some((t) => t.startsWith('tools/'))).toBe(true)
    expect(text.some((t) => t.startsWith('projects/'))).toBe(true)
  })

  it('lists every tool for ls tools, and one for ls tools/<id>', async () => {
    const { text } = await run('ls', 'tools')
    expect(text).toHaveLength(tools.length)
    for (const tool of tools) expect(text.some((t) => t.startsWith(tool.id))).toBe(true)

    expect((await run('ls', 'tools/json')).text).toHaveLength(1)
  })

  it('treats a section as an empty directory and an unknown path as an error', async () => {
    expect((await run('ls', 'projects')).out).toEqual([])
    expect((await run('ls', 'nope')).out[0]).toMatchObject({ tone: 'error' })
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
  it('lists every tool with its description', async () => {
    const { text } = await run('tools')
    for (const tool of tools) {
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
      tools.map((t) => t.id),
    )
  })

  it('is in the palette', () => {
    expect(command('tools').palette).toBe(true)
  })
})
