import { describe, expect, it } from 'vitest'
import { buildResume } from '../../../vite-plugins/resume'
import { profile } from '@/content'
import { parseSgr, SGR_TONES } from '../ansi'

const ESC = '\u001b['

describe('parseSgr', () => {
  it('reads the palette back as tones and merges runs of one tone', () => {
    const [row] = parseSgr(`${ESC}${SGR_TONES.primary}mgreen${ESC}0m plain ${ESC}${SGR_TONES.accent}mcy${ESC}1man${ESC}0m`)
    expect(row!.text).toBe('green plain cyan')
    expect(row!.segments).toEqual([
      { text: 'green', tone: 'primary' },
      { text: ' plain ', tone: 'default' },
      { text: 'cyan', tone: 'accent' },
    ])
    expect(row!.pre).toBe(true)
  })

  it('drops a concealed run until 28 or a reset, across lines', () => {
    const rows = parseSgr(`a${ESC}8msecret${ESC}28mb\n${ESC}8mhidden\nstill${ESC}0m shown`)
    expect(rows.map((r) => r.text)).toEqual(['ab', '', ' shown'])
  })

  it('strips every other escape and control character, and keeps a colour it can’t map as plain', () => {
    const [row] = parseSgr(`${ESC}2J${ESC}1;1H\u001b]0;title\u0007${ESC}38;2;1;2;3mrgb${ESC}38;5;200m idx\u0007\u0008`)
    expect(row!.text).toBe('rgb idx')
    expect(row!.segments!.every((s) => s.tone === 'default')).toBe(true)
  })

  it('turns the real résumé into the name, without the stage-3 flag or a single escape', () => {
    const rows = parseSgr(buildResume())
    const text = rows.map((r) => r.text).join('\n')
    expect(text).toContain(profile.name)
    expect(text).not.toMatch(/CTF\{/)
    expect(text).not.toContain('\u001b')
    // And the palette came through: the section titles are primary.
    expect(rows.some((r) => r.segments?.some((s) => s.tone === 'primary'))).toBe(true)
  })
})
