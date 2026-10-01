import { describe, expect, it } from 'vitest'
import { joinChain, MAX_STAGES, parseLine, type Link } from '../parse'

const chain = (line: string): Link[] => {
  const parsed = parseLine(line)
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.chain
}
const argvs = (line: string) => chain(line).map((link) => link.pipeline.map((stage) => stage.argv))

describe('parseLine', () => {
  it('leaves a line with no operator as one stage, words split on spaces', () => {
    expect(chain('ls   -a about')).toEqual([{ op: null, pipeline: [{ raw: 'ls   -a about', argv: ['ls', '-a', 'about'], env: {} }] }])
  })

  it('splits pipes, ;, && and ||, and keeps each stage’s spacing in raw', () => {
    const links = chain('cat about.txt | grep  -i jules ; pwd && ls || whoami')
    expect(links.map((l) => l.op)).toEqual([null, ';', '&&', '||'])
    expect(links[0]!.pipeline.map((s) => s.raw)).toEqual(['cat about.txt', 'grep  -i jules'])
    expect(argvs('a|b|c')).toEqual([[['a'], ['b'], ['c']]])
  })

  // French: an apostrophe inside a word is a letter, so none of these group anything.
  it.each([
    "sign c'est top",
    "ask qu'est-ce que tu fais",
    "sign l'un et l'autre",
    "sign j'aime l'idée | et l'autre",
  ])('reads %s with its apostrophes as letters', (line) => {
    const words = line.split(/\s+/).filter((w) => w !== '|')
    expect(argvs(line).flat(2)).toEqual(words)
  })

  // A group only hides operators: the words are split on spaces as they always were.
  it('groups a quote at the start of a word, operators and all, and keeps the quotes', () => {
    const raws = (line: string) => chain(line).map((link) => link.pipeline.map((stage) => stage.raw))
    expect(raws(`sign 'a | b'`)).toEqual([[`sign 'a | b'`]])
    expect(raws(`sign "great site; love it"`)).toEqual([[`sign "great site; love it"`]])
    expect(raws(`ask "who are you?" | cat`)).toEqual([[`ask "who are you?"`, 'cat']])
    expect(argvs(`sign "great  site; love it"`)).toEqual([[['sign', '"great', 'site;', 'love', 'it"']]])
  })

  it('treats a quote that never closes properly as a letter', () => {
    expect(argvs(`sign 'tis great; really`)).toEqual([[['sign', "'tis", 'great']], [['really']]])
    expect(argvs(`echo "a"b | c`)).toEqual([[['echo', '"a"b'], ['c']]])
  })

  it('passes unquoted JSON through untouched', () => {
    const line = 'jq . {"a": 1, "b": [1, 2], "c": "x"}'
    expect(chain(line)[0]!.pipeline[0]!.raw).toBe(line)
    expect(chain(`echo '{"a": 1}' | jq .`)[0]!.pipeline.map((s) => s.raw)).toEqual([`echo '{"a": 1}'`, 'jq .'])
  })

  it('keeps a single & and > literal', () => {
    expect(argvs('echo a & b > c')).toEqual([[['echo', 'a', '&', 'b', '>', 'c']]])
  })

  it('reads leading NAME=value words as the stage’s env, and leaves them out of raw', () => {
    const [stage] = chain('LANG=fr LC_ALL="fr_FR" neofetch --x')[0]!.pipeline
    expect(stage).toEqual({ raw: 'neofetch --x', argv: ['neofetch', '--x'], env: { LANG: 'fr', LC_ALL: 'fr_FR' } })
    // A lone assignment is a word like any other.
    expect(argvs('LANG=fr')).toEqual([[['LANG=fr']]])
    expect(argvs('echo LANG=fr')).toEqual([[['echo', 'LANG=fr']]])
  })

  it('keeps two-word names as two words, for the registry to join', () => {
    expect(argvs('git log | head')).toEqual([[['git', 'log'], ['head']]])
  })

  it('accepts an empty line and a trailing ;', () => {
    expect(chain('')).toEqual([])
    expect(chain('   ')).toEqual([])
    expect(argvs('ls ;')).toEqual([[['ls']]])
  })

  it.each([
    ['| ls', '|'],
    ['ls |', '|'],
    ['ls | | pwd', '|'],
    ['; ls', ';'],
    ['ls ;; pwd', ';'],
    ['ls &&', '&&'],
    ['|| ls', '||'],
  ])('refuses %s near %s', (line, token) => {
    expect(parseLine(line)).toEqual({ ok: false, error: `couvsh: syntax error near unexpected token '${token}'` })
  })

  it(`stops at ${MAX_STAGES} stages`, () => {
    expect(parseLine(Array(MAX_STAGES).fill('ls').join(' | ')).ok).toBe(true)
    expect(parseLine(Array(MAX_STAGES + 1).fill('ls').join(' ; '))).toMatchObject({ ok: false })
  })
})

describe('joinChain', () => {
  it('puts a parsed line back together the way it parses', () => {
    for (const line of ['ls | grep a && pwd ; whoami', 'LANG=fr neofetch | head -n 3', `sign "a; b" || echo no`, 'MSG="a b" echo x']) {
      expect(chain(joinChain(chain(line)))).toEqual(chain(line))
    }
  })
})
