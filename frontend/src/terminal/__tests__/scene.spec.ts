import { afterEach, describe, expect, it } from 'vitest'
import { resetScene, useSceneControl } from '@/composables/useSceneControl'
import { resolve, writesOf } from '../registry'
import { runCommand } from './context'

/**
 * `scene`: what the background holds, and `scene music on|off`, which turns the field's
 * reaction to the music off for the session, unsaved like the other flags.
 */
const scene = resolve('scene')!
const { musicOn } = useSceneControl()

afterEach(() => resetScene())

describe('scene', () => {
  it('lists the flags, music among them', async () => {
    const { text } = await runCommand(scene)
    expect(text).toMatch(/^music\s+on$/m)
  })

  it('turns the reaction to the music off and on, writing nothing', async () => {
    expect((await runCommand(scene, ['music', 'off'])).text).toBe('the field ignores the music.')
    expect(musicOn.value).toBe(false)
    expect((await runCommand(scene)).text).toMatch(/^music\s+off$/m)
    expect((await runCommand(scene, ['music', 'on'])).text).toBe('the field listens to the music.')
    expect(musicOn.value).toBe(true)
    // A bare `scene music` toggles, as `gravity` does.
    await runCommand(scene, ['music'])
    expect(musicOn.value).toBe(false)
    expect(writesOf(scene, ['music', 'off'])).toBe('none')
  })

  it('brings it back on reset, and refuses a word it doesn’t know', async () => {
    await runCommand(scene, ['music', 'off'])
    resetScene()
    expect(musicOn.value).toBe(true)
    expect((await runCommand(scene, ['music', 'loud'])).text).toBe('scene: unknown argument `music`')
  })

  it('offers music and its two words for Tab', () => {
    expect(scene.complete!({ index: 0, args: [] } as never)).toEqual(['reset', 'music'])
    expect(scene.complete!({ index: 1, args: ['music'] } as never)).toEqual(['on', 'off'])
  })
})
