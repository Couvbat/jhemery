import { afterEach, describe, expect, it } from 'vitest'
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
})

describe('xray', () => {
  it.each(['en', 'fr'] as const)('turns x-ray on and gets out of the way, saying how to leave, in %s', async (locale) => {
    const { closed, text } = await run(locale)
    expect(xrayOn.value).toBe(true)
    // The page is what it shows; the terminal over it would hide most of it.
    expect(closed).toBe(true)
    expect(text).toContain(locale === 'en' ? 'Esc' : 'Échap')
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
    expect(paletteCommands()).toContain(xray)
  })
})
