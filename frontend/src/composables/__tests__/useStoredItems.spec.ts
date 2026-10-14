import { afterEach, describe, expect, it } from 'vitest'
import { effectScope } from 'vue'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { useStoredItems } from '../useStoredItems'

/**
 * `/privacy`'s list, which jsdom can't mount: the page sits under a navbar that writes, so
 * the list has to follow what is stored rather than what was at setup. The page itself, the
 * navbar's scheme menu and the clear that follows, is `e2e/privacy.spec.ts`.
 */

function mount() {
  const scope = effectScope()
  const items = scope.run(() => useStoredItems())!
  return { items, keys: () => items.value.map((item) => item.key), stop: () => scope.stop() }
}

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('useStoredItems', () => {
  it('follows a key made, and one removed, after it was read', async () => {
    localStorage.setItem('couvbat:locale', 'en')
    const { items, keys, stop } = mount()
    expect(keys()).toEqual(['couvbat:locale'])

    localStorage.setItem('couvbat:theme', 'dracula')
    await Promise.resolve()
    expect(keys()).toEqual(['couvbat:locale', 'couvbat:theme'])
    // Shallow: the page matches an item to its row by the entry itself.
    expect(items.value[1]!.entry).toBe(STORAGE_KEYS.find((entry) => entry.key === 'couvbat:theme'))

    localStorage.removeItem('couvbat:locale')
    await Promise.resolve()
    expect(keys()).toEqual(['couvbat:theme'])
    stop()
  })

  it('stops following when its scope ends', async () => {
    const { keys, stop } = mount()
    stop()
    localStorage.setItem('couvbat:theme', 'dracula')
    await Promise.resolve()
    expect(keys()).toEqual([])
  })
})
