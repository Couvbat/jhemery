import { describe, expect, it } from 'vitest'
import { decisions } from '@/content'
import { isLinkable, resolve } from '../registry'
import { runCommand } from './context'

const why = resolve('why')!

describe('why', () => {
  it('lists every topic when given none', async () => {
    const { text } = await runCommand(why)
    for (const d of decisions) expect(text).toContain(d.id)
  })

  it.each(['en', 'fr'] as const)('prints what was chosen, what was turned down, and where it is written, in %s', async (locale) => {
    const d = decisions.find((x) => x.id === 'mcp-sdk')!
    const { lines, text } = await runCommand(why, ['mcp-sdk'], { locale })
    expect(text).toContain(d.chose[locale])
    for (const r of d.rejected) expect(text).toContain(r.because[locale])
    const hrefs = lines.flatMap((l) => (l.href ? [l.href] : []))
    expect(hrefs.some((h) => h.endsWith(`#${d.source.anchor}`))).toBe(true)
    if (d.pr) expect(hrefs).toContain(`https://github.com/Couvbat/jhemery/pull/${d.pr}`)
  })

  it('suggests the topic a typo meant', async () => {
    const { text } = await runCommand(why, ['mcpsdk'])
    expect(text).toContain('why mcp-sdk')
  })

  it('completes topic ids, and every one is linkable', () => {
    const ids = why.complete!({ args: [''], index: 0, word: '' })
    expect(ids).toEqual(decisions.map((d) => d.id))
    for (const id of ids) expect(isLinkable(why, [id]), id).toBe(true)
  })
})
