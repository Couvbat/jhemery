import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/composables/useCrt', () => ({ prefersReducedMotion: () => motion.reduced }))

import { CYCLE_MS, resetSuggestions, usePromptSuggestion } from '../usePromptSuggestion'

const POOL = ['neofetch', 'projects', 'weather']

function mount(active = true) {
  const scope = effectScope()
  const isActive = ref(active)
  const api = scope.run(() => usePromptSuggestion(() => POOL, isActive))!
  return { ...api, isActive, stop: () => scope.stop() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  motion.reduced = false
  resetSuggestions()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('usePromptSuggestion', () => {
  it('cycles through the pool while the prompt is empty', async () => {
    const { suggestion, stop } = mount()
    expect(suggestion.value).toBe('neofetch')
    await vi.advanceTimersByTimeAsync(CYCLE_MS)
    expect(suggestion.value).toBe('projects')
    await vi.advanceTimersByTimeAsync(CYCLE_MS * 2)
    expect(suggestion.value).toBe('neofetch')
    stop()
  })

  it('shows nothing, and stops cycling, while the prompt is busy', async () => {
    const { suggestion, isActive, stop } = mount()
    isActive.value = false
    await nextTick()
    expect(suggestion.value).toBeNull()
    await vi.advanceTimersByTimeAsync(CYCLE_MS * 5)
    isActive.value = true
    await nextTick()
    expect(suggestion.value).toBe('neofetch')
    stop()
  })

  it('stops for the rest of the session after the first keystroke', async () => {
    const first = mount()
    first.dismiss()
    await nextTick()
    expect(first.suggestion.value).toBeNull()
    first.stop()

    // A second open of the shell, same session.
    const second = mount()
    expect(second.suggestion.value).toBeNull()
    second.stop()
  })

  it('holds one static hint under reduced motion', async () => {
    motion.reduced = true
    const { suggestion, stop } = mount()
    expect(suggestion.value).toBe('neofetch')
    await vi.advanceTimersByTimeAsync(CYCLE_MS * 3)
    expect(suggestion.value).toBe('neofetch')
    stop()
  })
})
