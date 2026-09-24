import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => true,
}))

import { setLocale } from '@/i18n'
import { setAlias, clearAliases } from '@/terminal/aliases'
import { consumeRunParam } from '../useRunLink'
import { runLink, useTerminal } from '../useTerminal'
import { pendingLinkCommand, terminalOpen } from '../useTerminalShell'

const { buffer, clearBuffer } = useTerminal()
const texts = () => buffer.value.map((l) => l.text)

beforeEach(() => {
  clearBuffer()
  clearAliases()
  setLocale('en')
  terminalOpen.value = false
  pendingLinkCommand.value = null
})

describe('runLink', () => {
  it('echoes and runs a linkable command', async () => {
    await runLink('whoami')
    expect(buffer.value[0]).toMatchObject({ text: 'whoami', prompt: true })
    expect(buffer.value.length).toBeGreaterThan(1)
  })

  it('passes arguments through', async () => {
    await runLink('help ls')
    expect(texts()).toContain('ls')
  })

  it('refuses a command that did not opt in, and runs nothing', async () => {
    await runLink('sudo rm -rf /')
    expect(buffer.value).toHaveLength(1)
    expect(buffer.value[0]!.text).toContain('a link asked to run `sudo rm -rf /`')
    expect(buffer.value[0]!.prompt).toBeFalsy()
  })

  it('refuses an unknown command the same way', async () => {
    await runLink('definitely-not-a-command')
    expect(buffer.value[0]!.text).toContain('only runs if you type it')
  })

  it('never expands the reader’s aliases', async () => {
    // The reader named something `whoami`-shaped; the link must not reach it.
    setAlias('who', 'sudo rm -rf /')
    await runLink('who')
    expect(texts().join('\n')).not.toContain('rm -rf')
    expect(buffer.value[0]!.text).toContain('a link asked to run `who`')
  })

  it('strips control characters and caps the length', async () => {
    await runLink(`whoami\u001b[2J${'x'.repeat(500)}`)
    expect(buffer.value[0]!.text.length).toBeLessThan(300)
    expect(buffer.value[0]!.text).not.toContain('\u001b')
  })
})

describe('consumeRunParam', () => {
  function makeRouter() {
    return createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/tools/:tool?', component: { template: '<div />' } },
      ],
    })
  }

  function screen(desktop: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: desktop, media: query }))
  }

  it('opens the shell with the command and drops it from the URL', async () => {
    screen(true)
    const router = makeRouter()
    await router.push('/?run=wordle%20daily&keep=1#about')
    await consumeRunParam(router)

    expect(terminalOpen.value).toBe(true)
    expect(pendingLinkCommand.value).toBe('wordle daily')
    expect(router.currentRoute.value.query).toEqual({ keep: '1' })
    expect(router.currentRoute.value.hash).toBe('#about')
  })

  it('does nothing on a phone, where there is no terminal', async () => {
    screen(false)
    const router = makeRouter()
    await router.push('/?run=neofetch')
    await consumeRunParam(router)

    expect(terminalOpen.value).toBe(false)
    expect(pendingLinkCommand.value).toBeNull()
  })

  it('does nothing without the parameter', async () => {
    screen(true)
    const router = makeRouter()
    await router.push('/tools')
    await consumeRunParam(router)
    await nextTick()
    expect(terminalOpen.value).toBe(false)
  })
})
