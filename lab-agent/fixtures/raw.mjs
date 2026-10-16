import { readFileSync } from 'node:fs'

/** The sources' raw answers, as `sources.mjs`'s `fetchAll` would hand them over. */
const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
const json = (name) => JSON.parse(read(name))

export const TAKEN_AT = new Date('2026-10-15T19:42:01.000Z')

export function rawAnswers() {
  return {
    glances: { poseidon: json('glances-poseidon.json'), optimus: json('glances-optimus.json'), hephaistos: null },
    pools: { poseidon: json('truenas-poseidon.json') },
    kuma: read('kuma-metrics.txt'),
    ollama: { ps: json('ollama-ps.json'), tags: json('ollama-tags.json') },
    tunnel: json('cloudflared-ready.json'),
  }
}

export const options = json('options.json')
