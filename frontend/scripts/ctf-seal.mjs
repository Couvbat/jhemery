/**
 * Seals the CTF chain's finale — `src/terminal/ctf.ts` reads the output.
 *
 *   node scripts/ctf-seal.mjs
 *
 * Prints each stage's SHA-256 and the sealed payoff, to paste over `STAGE_HASHES` and
 * `SEALED` in `ctf.ts`. Run by hand, output committed, like `build-wordlists.mjs`.
 *
 * The key is SHA-256 of the seven earlier flags joined in stage order, so `decrypt`
 * cannot open the payoff until all seven are held. That is the only thing sealing
 * buys. The flags themselves are in the repository anyway — each one lives in its
 * surface (`.secret`, the console, `resume.txt`, …), and a reader of the source can
 * collect them, which the spec's threat model accepts: the adversary is a curious
 * visitor, and reading the source is a way of being one.
 *
 * FLAGS must match what the surfaces carry; `ctf.spec.ts` extracts each flag from its
 * surface and checks it against the hashes, then decrypts `SEALED` with them.
 */

import { Buffer } from 'node:buffer'
import { webcrypto as crypto } from 'node:crypto'
import { TextEncoder } from 'node:util'

const FLAGS = [
  ['secret', 'CTF{d1c8c2e0e268bb96}'],
  ['console', 'CTF{d7b259a1791c849b}'],
  ['curl', 'CTF{e883c12a903c4432}'],
  ['shadow', 'CTF{21d6aadb5c940339}'],
  ['mainframe', 'CTF{f5611df57ef74890}'],
  ['ghost', 'CTF{4a89a7f727a2c302}'],
  ['llms', 'CTF{ac101b3efcff5789}'],
]
const ROOT = 'CTF{b66af71fb0859d59}'

const PAYOFF = {
  flag: ROOT,
  en: [
    'root@jhemery:~# whoami',
    'root',
    '',
    'Seven flags, from seven places, in order, and a key rebuilt out of all of',
    'them. That stopped being curiosity a few stages ago. That is method.',
    '',
    'I would like to hear from whoever got this far. Hiring, a project, or just',
    'to say you did it: write to me, and put "root" in the first line. I will',
    'know exactly what it took.',
  ],
  fr: [
    'root@jhemery:~# whoami',
    'root',
    '',
    'Sept flags, sept endroits, dans l’ordre, et une clé reconstruite à partir',
    'de tous. Ce n’est plus de la curiosité depuis quelques étapes. C’est de la',
    'méthode.',
    '',
    'J’aimerais avoir des nouvelles de qui est arrivé jusqu’ici. Un recrutement,',
    'un projet, ou juste pour dire que vous l’avez fait : écrivez-moi, avec',
    '« root » dans la première ligne. Je saurai exactement ce que ça a demandé.',
  ],
}

const encoder = new TextEncoder()
const hex = (buffer) => Buffer.from(buffer).toString('hex')
const base64 = (buffer) => Buffer.from(buffer).toString('base64')
const sha256 = (text) => crypto.subtle.digest('SHA-256', encoder.encode(text))

console.log('export const STAGE_HASHES: Record<StageId, string> = {')
for (const [id, flag] of [...FLAGS, ['root', ROOT]]) {
  console.log(`  ${id}: '${hex(await sha256(flag))}',`)
}
console.log('}\n')

const raw = await sha256(FLAGS.map(([, flag]) => flag).join(''))
const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
const iv = crypto.getRandomValues(new Uint8Array(12))
const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(PAYOFF)))

console.log('export const SEALED = {')
console.log(`  iv: '${base64(iv)}',`)
console.log(`  data: '${base64(data)}',`)
console.log('}')
