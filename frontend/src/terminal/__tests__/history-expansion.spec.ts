import { describe, expect, it } from 'vitest'
import { autosuggest, expandHistory, prefixMatches, searchBackward } from '../history'
import { isServerBound } from '../registry'

const entries = ['ls about', 'cat about.txt', 'theme nord', 'echo one two three']
const expand = (line: string, from: readonly string[] = entries) => expandHistory(line, from, isServerBound)

describe('expandHistory', () => {
  it('expands every designator', () => {
    expect(expand('!!')).toEqual({ line: 'echo one two three', expanded: true })
    expect(expand('cat !$')).toEqual({ line: 'cat three', expanded: true })
    expect(expand('!2')).toEqual({ line: 'cat about.txt', expanded: true })
    expect(expand('!-2')).toEqual({ line: 'theme nord', expanded: true })
    expect(expand('!! | grep o')).toEqual({ line: 'echo one two three | grep o', expanded: true })
    expect(expand('^three^four')).toEqual({ line: 'echo one two four', expanded: true })
    expect(expand('^three^four^')).toEqual({ line: 'echo one two four', expanded: true })
  })

  it.each([':q!', ':wq!', "c'est top !", 'a != b', 'echo !(x)', 'wow!', 'echo \\!!'])('leaves %s as typed, or with \\! as a !', (line) => {
    const result = expand(line)
    expect(result).toMatchObject({ expanded: false })
    expect((result as { line: string }).line).toBe(line.replace('\\!', '!'))
  })

  it('says which event is missing, or which substitution failed', () => {
    expect(expand('!9')).toEqual({ error: '!9: event not found' })
    expect(expand('!!', [])).toEqual({ error: '!!: event not found' })
    expect(expand('!$', [])).toEqual({ error: '!$: event not found' })
    expect(expand('^nope^x')).toEqual({ error: ':s^nope^x^: substitution failed' })
  })

  // The guestbook gets what was typed: a server-bound line is never expanded, even wrapped.
  it.each(['sign Great site!!', 'strace sign a!!', 'ask what was !2', 'ls ; mail !!'])('leaves %s alone', (line) => {
    expect(expand(line)).toEqual({ line, expanded: false })
  })
})

describe('searching', () => {
  const history = ['theme nord', 'ls', 'theme dracula', 'cat about.txt', 'theme gruvbox']

  it('finds the newest match first, then older ones on repeat', () => {
    const first = searchBackward(history, 'theme')
    expect(first).toEqual({ index: 4, entry: 'theme gruvbox' })
    const second = searchBackward(history, 'theme', first!.index)
    expect(second).toEqual({ index: 2, entry: 'theme dracula' })
    expect(searchBackward(history, 'theme', 0)).toBeUndefined()
    expect(searchBackward(history, '')).toBeUndefined()
  })

  it('walks prefix matches newest first, each once', () => {
    expect(prefixMatches([...history, 'theme nord'], 'theme')).toEqual(['theme nord', 'theme gruvbox', 'theme dracula'])
  })

  it('suggests only what the visitor has typed before, and nothing for an empty line', () => {
    expect(autosuggest('the', history)).toBe('me gruvbox')
    expect(autosuggest('', history)).toBe('')
    // `vim` is a command, but nobody here typed it, so it is never offered.
    expect(autosuggest('vi', history)).toBe('')
    expect(autosuggest('theme gruvbox', history)).toBe('')
  })
})
