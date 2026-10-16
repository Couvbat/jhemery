import { afterEach, describe, expect, it } from 'vitest'
import { touchLayout } from '@/composables/useTerminalShell'
import { setXray, useXray } from '@/composables/useXray'
import { isLinkable, paletteCommands, resolve, writesOf } from '../registry'
import { recordingContext } from './context'

const xray = resolve('xray')!
const { xrayOn } = useXray()

/** Runs `xray`, noting whether it closed the terminal. */
async function run(locale: 'en' | 'fr' = 'en') {
  const recorded = recordingContext('xray', [], { locale })
  let closed = false
  recorded.ctx.close = () => {
    closed = true
  }
  const lines = (await xray.run(recorded.ctx)) ?? []
  return { closed, text: [...recorded.printed, ...lines].map((line) => line.text).join('\n') }
}

afterEach(() => {
  setXray(false)
  touchLayout.value = false
})

describe('xray', () => {
  it.each(['en', 'fr'] as const)('turns x-ray on and gets out of the way, saying how to leave, in %s', async (locale) => {
    const { closed, text } = await run(locale)
    expect(xrayOn.value).toBe(true)
    // The page is what it shows; the terminal over it would hide most of it.
    expect(closed).toBe(true)
    expect(text).toContain(locale === 'en' ? 'Esc' : 'Échap')
    expect(text).toContain(locale === 'en' ? 'the exit button' : 'le bouton quitter')
  })

  // A phone has no Esc: the touch layout names the button in its place, as `tour` does.
  it.each(['en', 'fr'] as const)('names the exit button and no key in the touch layout, in %s', async (locale) => {
    touchLayout.value = true
    const { text } = await run(locale)
    expect(xrayOn.value).toBe(true)
    expect(text).not.toMatch(/Esc|Échap/)
    expect(text).toContain(locale === 'en' ? 'The exit button' : 'Le bouton quitter')
  })

  it('turns it off the second time, and leaves the terminal open', async () => {
    await run()
    const { closed, text } = await run()
    expect(xrayOn.value).toBe(false)
    expect(closed).toBe(false)
    expect(text).toContain('x-ray off')
  })

  // `?run=xray`, and a tap-shell button: it shows the page's structure and changes none of it.
  it('runs from a link, and from the palette', () => {
    expect(writesOf(xray)).toBe('none')
    expect(isLinkable(xray)).toBe(true)
    expect(isLinkable(xray, ['path'])).toBe(true)
    expect(paletteCommands()).toContain(xray)
  })

  it('opens the path panel with `path`, and a bare `xray` leaves it closed', async () => {
    const { xrayPath } = useXray()
    await run()
    expect(xrayPath.value).toBe(false)
    // On already: `path` keeps it on and opens the panel rather than toggling it off.
    const recorded = recordingContext('xray', ['path'])
    const lines = (await xray.run(recorded.ctx)) ?? []
    expect(xrayOn.value).toBe(true)
    expect(xrayPath.value).toBe(true)
    expect(lines[0]!.text).toContain('this visit’s path')
    setXray(false)
    expect(xrayPath.value).toBe(false)
  })

  it('refuses any other argument', async () => {
    const recorded = recordingContext('xray', ['bones'])
    const lines = (await xray.run(recorded.ctx)) ?? []
    expect(lines).toEqual([expect.objectContaining({ stderr: true, text: 'xray: bones: unknown argument; try `xray path`' })])
    expect(xrayOn.value).toBe(false)
  })
})
