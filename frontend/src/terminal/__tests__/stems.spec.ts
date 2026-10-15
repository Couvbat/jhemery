import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StemTrack } from '@/content/stems'

const tracks = vi.hoisted(() => ({ list: [] as StemTrack[] }))
vi.mock('@/content/stems', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/content/stems')>()
  return {
    ...actual,
    get stemTracks() {
      return tracks.list
    },
  }
})

import { decodeMix, defaultMix } from '@/components/stems/mix'
import { useStemsRequest } from '@/composables/useStemsRequest'
import { isLinkable, writesOf } from '../registry'
import { stems } from '../commands/stems'
import { runCommand } from './context'

/**
 * `stems` (`docs/superpowers/specs/2026-10-15-stems-vol2-design.md` §5): the list, empty
 * as it ships, and `stems <id>` handing the mixer a default mix the way a link does.
 */

const NIGHT: StemTrack = {
  id: 'night-shift',
  title: 'Night Shift',
  seconds: 32,
  bpm: 165,
  key: 'F minor',
  stems: ['kick', 'bass', 'acid'].map((id) => ({ id, name: { en: id, fr: id }, file: `night-shift/${id}.m4a`, bytes: 1 })),
}

beforeEach(() => {
  tracks.list = []
  useStemsRequest().take()
})

describe('stems', () => {
  it('says no stems are published yet while the list is empty', async () => {
    const { text } = await runCommand(stems)
    expect(text).toBe('no stems are published yet.')
  })

  it('lists each track with its tempo, key, loop and stems, and a way in', async () => {
    tracks.list = [NIGHT]
    const { lines } = await runCommand(stems, [], { locale: 'fr' })
    expect(lines.map((l) => l.text)).toContain('Night Shift · 165 BPM · F minor · boucle de 0:32 · 3 pistes')
    expect(lines.at(-1)).toMatchObject({ text: '  stems night-shift', href: '/?run=stems%20night-shift' })
  })

  it('opens a track in the mixer with a default mix, by the path a link takes', async () => {
    tracks.list = [NIGHT]
    const { navigated, text } = await runCommand(stems, ['night-shift'])
    expect(navigated).toEqual(['music'])
    expect(text).toBe('Night Shift, in the mixer.')
    const code = useStemsRequest().requested.value!
    expect(decodeMix(code, tracks.list)).toEqual({ track: NIGHT, mix: defaultMix(3) })
  })

  it('refuses a track it doesn’t have', async () => {
    tracks.list = [NIGHT]
    const { lines, navigated } = await runCommand(stems, ['dawn'])
    expect(lines).toEqual([expect.objectContaining({ stderr: true, text: 'stems: dawn: no such track — `stems` lists them' })])
    expect(navigated).toEqual([])
  })

  it('writes nothing, and runs from a link with the ids it offers', () => {
    tracks.list = [NIGHT]
    expect(writesOf(stems)).toBe('none')
    expect(stems.hidden).toBeFalsy()
    expect(isLinkable(stems)).toBe(true)
    expect(isLinkable(stems, ['night-shift'])).toBe(true)
    expect(isLinkable(stems, ['elsewhere'])).toBe(false)
  })
})
