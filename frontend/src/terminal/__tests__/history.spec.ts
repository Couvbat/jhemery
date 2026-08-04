import { beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'couvbat:history'

/**
 * `history` is a module-level ref hydrated from localStorage at import time, so
 * each case re-imports the module with storage already in the state under test.
 */
async function freshHistory() {
  vi.resetModules()
  return import('../history')
}

describe('pushHistory', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('appends an entry', async () => {
    const { history, pushHistory } = await freshHistory()
    pushHistory('help')
    expect(history.value).toEqual(['help'])
  })

  it('persists to localStorage', async () => {
    const { pushHistory } = await freshHistory()
    pushHistory('help')
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual(['help'])
  })

  it('ignores blank input', async () => {
    const { history, pushHistory } = await freshHistory()
    pushHistory('   ')
    pushHistory('')
    expect(history.value).toEqual([])
  })

  it('trims whitespace', async () => {
    const { history, pushHistory } = await freshHistory()
    pushHistory('  help  ')
    expect(history.value).toEqual(['help'])
  })

  it('collapses an immediate repeat, as a shell does', async () => {
    const { history, pushHistory } = await freshHistory()
    pushHistory('help')
    pushHistory('help')
    expect(history.value).toEqual(['help'])
  })

  it('keeps a repeat that is not immediate', async () => {
    const { history, pushHistory } = await freshHistory()
    pushHistory('help')
    pushHistory('ls')
    pushHistory('help')
    expect(history.value).toEqual(['help', 'ls', 'help'])
  })

  it('caps the buffer, dropping the oldest entries', async () => {
    const { history, pushHistory } = await freshHistory()
    for (let i = 0; i < 120; i++) pushHistory(`cmd${i}`)
    expect(history.value).toHaveLength(100)
    expect(history.value[0]).toBe('cmd20')
    expect(history.value.at(-1)).toBe('cmd119')
  })
})

describe('hydration', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('restores a previous session', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['help', 'ls']))
    const { history } = await freshHistory()
    expect(history.value).toEqual(['help', 'ls'])
  })

  it('survives malformed JSON', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json{')
    const { history } = await freshHistory()
    expect(history.value).toEqual([])
  })

  it('survives a stored value that is not an array', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ nope: true }))
    const { history } = await freshHistory()
    expect(history.value).toEqual([])
  })

  it('drops non-string entries rather than replaying them into the prompt', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['help', 42, null, 'ls']))
    const { history } = await freshHistory()
    expect(history.value).toEqual(['help', 'ls'])
  })

  it('keeps working when localStorage rejects writes', async () => {
    // Private browsing, or a full quota. History just stops persisting.
    const { history, pushHistory } = await freshHistory()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => pushHistory('help')).not.toThrow()
    expect(history.value).toEqual(['help'])
  })
})
