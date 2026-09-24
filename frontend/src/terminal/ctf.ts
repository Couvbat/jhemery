import { computed, ref } from 'vue'
import type { Localised } from '@/content/types'
import { loadRecord, persistRecord } from './storage'

/**
 * The CTF flag chain — superpowers/specs/2026-08-04-ctf-flag-chain-design.md.
 *
 * Eight stages across surfaces that already existed, each naming where the next one
 * hides. Validation is client-side and hashed: this module holds each stage's SHA-256,
 * never a flag. The flags live in their surfaces (`.secret`, the console, `resume.txt`,
 * `/etc/shadow`, `hack`, `top`, `llms.txt`), so what a bundle-reader cannot do is list
 * the answers next to the questions — they can only verify one they found.
 *
 * **Departure from the spec:** progress is stored as `{ stageId: flag }`, not a set of
 * ids. The board shows each solved flag, and `decrypt` needs the seven values to rebuild
 * its key, so the values have to be kept somewhere.
 */

export type StageId = 'secret' | 'console' | 'curl' | 'shadow' | 'mainframe' | 'ghost' | 'llms' | 'root'

export interface Stage {
  id: StageId
  title: Localised
  /** Shown for the stage you are on. The second and third after 3 and 6 misses. */
  hints: [Localised, Localised, Localised]
  /** Printed when the stage falls: names the surface the next flag hides in. */
  reward: Localised
}

export const stages: Stage[] = [
  {
    id: 'secret',
    title: { en: 'Hidden in plain sight', fr: 'Caché en pleine vue' },
    hints: [
      { en: 'Start where the shy files live: `ls -a`.', fr: 'Commencez là où vivent les fichiers timides : `ls -a`.' },
      { en: 'A dotfile in the home directory ends with a flag.', fr: 'Un fichier caché du répertoire personnel se termine par un flag.' },
      { en: '`cat .secret`, and read to the last line.', fr: '`cat .secret`, et lisez jusqu’à la dernière ligne.' },
    ],
    reward: {
      en: 'Stage 2 is where developers talk to each other: the browser console. Open your DevTools.',
      fr: 'L’étape 2 est là où les développeurs se parlent : la console du navigateur. Ouvrez les DevTools.',
    },
  },
  {
    id: 'console',
    title: { en: 'Console log', fr: 'Journal de console' },
    hints: [
      { en: 'Developers leave messages in the DevTools console.', fr: 'Les développeurs laissent des messages dans la console des DevTools.' },
      { en: 'One console line is not meant for humans. It ends in `=`.', fr: 'Une ligne de la console n’est pas faite pour les humains. Elle finit par `=`.' },
      { en: 'It is base64. Pass it to `atob()`, right there in the console.', fr: 'C’est du base64. Passez-la à `atob()`, directement dans la console.' },
    ],
    reward: {
      en: 'Stage 3: `curl jhemery.xyz` from a real terminal prints a résumé. Not all of it.',
      fr: 'Étape 3 : `curl jhemery.xyz` depuis un vrai terminal affiche un CV. Pas en entier.',
    },
  },
  {
    id: 'curl',
    title: { en: 'Concealed', fr: 'Dissimulé' },
    hints: [
      { en: '`curl jhemery.xyz`, from a real terminal. Some of it is hidden.', fr: '`curl jhemery.xyz`, depuis un vrai terminal. Une partie est cachée.' },
      { en: 'Your terminal hides text it was told to hide. Look at the raw bytes.', fr: 'Votre terminal cache le texte qu’on lui demande de cacher. Regardez les octets bruts.' },
      { en: '`curl -s jhemery.xyz | cat -v`, and look for `[8m`.', fr: '`curl -s jhemery.xyz | cat -v`, et cherchez `[8m`.' },
    ],
    reward: {
      en: 'Stage 4: every box has an /etc/shadow. This one lets you read it. Sort of.',
      fr: 'Étape 4 : chaque machine a un /etc/shadow. Celle-ci vous laisse le lire. En quelque sorte.',
    },
  },
  {
    id: 'shadow',
    title: { en: 'Shadow file', fr: 'Fichier shadow' },
    hints: [
      { en: 'Every Unix box guards one file above all. This one left it readable.', fr: 'Chaque machine Unix protège un fichier plus que tout. Celle-ci l’a laissé lisible.' },
      { en: '`cat /etc/shadow`. It is not encrypted, only rotated.', fr: '`cat /etc/shadow`. Ce n’est pas chiffré, juste décalé.' },
      { en: 'ROT13. `PGS` is `CTF`.', fr: 'ROT13. `PGS` veut dire `CTF`.' },
    ],
    reward: {
      en: 'Stage 5: the shadow file named a target. `hack` it.',
      fr: 'Étape 5 : le fichier shadow nommait une cible. Piratez-la avec `hack`.',
    },
  },
  {
    id: 'mainframe',
    title: { en: 'Hack the planet', fr: 'Hack the planet' },
    hints: [
      { en: 'The shadow file named something worth hacking.', fr: 'Le fichier shadow nommait quelque chose qui mérite d’être piraté.' },
      { en: '`hack` takes a target. The mainframe is the wrong one.', fr: '`hack` prend une cible. Le mainframe n’est pas la bonne.' },
      { en: '`hack gibson`.', fr: '`hack gibson`.' },
    ],
    reward: {
      en: 'Stage 6: something runs on this box that `ps` will not show you. Keep watching.',
      fr: 'Étape 6 : quelque chose tourne sur cette machine que `ps` ne vous montrera pas. Continuez de regarder.',
    },
  },
  {
    id: 'ghost',
    title: { en: 'Ghost process', fr: 'Processus fantôme' },
    hints: [
      { en: 'Some processes only show up if you keep watching.', fr: 'Certains processus n’apparaissent que si l’on continue de regarder.' },
      { en: '`ps` takes a snapshot. `top` keeps refreshing.', fr: '`ps` prend une photo. `top` se rafraîchit.' },
      { en: 'Let `top` run to its last frame, then read the newest process’s arguments.', fr: 'Laissez `top` aller jusqu’à sa dernière image, puis lisez les arguments du dernier processus.' },
    ],
    reward: {
      en: 'Stage 7: this site keeps a file for language models. Read it the way they would.',
      fr: 'Étape 7 : ce site garde un fichier pour les modèles de langage. Lisez-le comme eux.',
    },
  },
  {
    id: 'llms',
    title: { en: 'For the machines', fr: 'Pour les machines' },
    hints: [
      { en: 'A file on this site is written for language models, not people.', fr: 'Un fichier de ce site est écrit pour les modèles de langage, pas pour les gens.' },
      { en: 'It sits at the root, next to robots.txt. llmstxt.org describes it.', fr: 'Il est à la racine, à côté de robots.txt. llmstxt.org le décrit.' },
      { en: 'Open /llms.txt and read it to the end.', fr: 'Ouvrez /llms.txt et lisez-le jusqu’au bout.' },
    ],
    reward: {
      en: 'Stage 8: you hold seven flags. `decrypt` needs every one of them.',
      fr: 'Étape 8 : vous avez sept flags. `decrypt` a besoin de chacun d’eux.',
    },
  },
  {
    id: 'root',
    title: { en: 'root', fr: 'root' },
    hints: [
      { en: 'Seven keys, one lock: `decrypt`.', fr: 'Sept clés, une serrure : `decrypt`.' },
      { en: '`decrypt` reads the flags you already submitted. It needs all seven.', fr: '`decrypt` lit les flags déjà soumis. Il lui faut les sept.' },
      { en: 'Run `decrypt`. That is the whole stage.', fr: 'Lancez `decrypt`. C’est toute l’étape.' },
    ],
    reward: {
      en: 'That was the last one. The message above is the prize.',
      fr: 'C’était le dernier. Le message ci-dessus est la récompense.',
    },
  },
]

/** SHA-256 of each stage's flag, from `scripts/ctf-seal.mjs`. */
export const STAGE_HASHES: Record<StageId, string> = {
  secret: 'f50509d73e87d7eac651a32e2341faff23d9a2797bd4c078d9b0ae26bd3bd266',
  console: 'f5581a628276fcc9bac0535ff8ba635f0ba29353f7e59b8c6e2d925c19e22d41',
  curl: '85db1fd7ea8e672c8046b11c61bc82f95f473c17661f791dc41bda57c065ea71',
  shadow: '18778db893cb951ce5ffef738a72f286371967c96db6a91c717e44ba3e69fee9',
  mainframe: '5c5df7adba29c469d274d656225977d4bf508df66c23776138c73b0fd9024cee',
  ghost: '8cdb5c52394f4a163d6b9e5b11106500ce260f9ccaa09f6e59fb911dd0383c04',
  llms: 'ea9be204b9f58170e5065f85237fc9f74ba733e0bc7a53f492c7abf5482f4a37',
  root: '11044cdd16ff96b4f5ed4abf6fe9191952583a7cbdc8694c5b764fa3fcf321e4',
}

/**
 * The finale, AES-GCM under SHA-256 of the seven earlier flags joined in stage order.
 * Also from `scripts/ctf-seal.mjs`, which holds the plaintext.
 */
export const SEALED = {
  iv: 'sc/zp1ODtWksMvnL',
  // Ciphertext, not a credential: secret scanners see its entropy and nothing else.
  data: '2abyiuytD0JZfUl8hDykoDBmQkTyPLFV2yz0g1w5uE+muyeb7lyaMrVQZdhn3egQYHm2XyObEGa1QeaBWR7VbivoxUrnzQ3QjaqVRynLCYApTMRrUq3xPZ984NIE9BVbWm2CYz04S3wdKJQ63yq8p5Yp08TAChSsdB4MI8TVbteALrSzqdb7JjI3Daup9VLltCzdmeZCViUPp1+c1/BBmLhmJJHg6SKvvtpdVd2+GA75LDHID99raKw7UwybiikPHLzFTEHbij73iyByamMt3mNXbokVHRPDoF0+pWUbebaKL7mEFIAyhsg+U5BlQ6vSGuZSaAIxoU88GwnD4kPUz4TG0pTISJMAFyEGTP4/aJN4pF72ghG2KxhiZ+xJ5GGAv3FC/kATFcWaDWwwIO53q7/j1rgz5MrkGDRL6fCZkJ3cHS/FoZ9lwPjD6cMbmBFmT9n3goWX6NIeKbR4ZX5X5gIMEk0WPlvF4g9dSmjW/3A+YMey27+/mTrcYVQ10d+ummMTrTPCtYPW/VU5gf8hLruOgLz0FYRQuSnX4BQSCJyXorqXoBpfxXToWg4RKRqpDWy/HiPCfjJN6obgJE7PuUs0VOI7zE7ZrulUR9gC3OkbAczQBXW1BOhekxMHsA1JdLQ56veDl0ciZ98Iq5VpzE/7U9gQC8vzpAWL5lzJhwpIm3J5I1CtmQMnCgabp7mBLyGcBH2N/XIECvNH7X5dD41OV6Gf0WDZruquRU1bDGjEnCsqZF5Aw3s3O8CAKPXaeiF3f2xvgJobebNgGCuKKmFem9cHx1DQ9AhO9dbxeAym1sVPHmAQkw0KmFfCaSzpUWeMX6d2bRIw01jkX+bWOKO3L0ZYT+LBwcbvdm3H2KaxSEAcV/45ne0ICTW5GTzC/jZNfU2Ul4wh6v0A5yRO7a3R7v8ntuCYdA90OenELSdQWTCvgV5n4C4/+RQOPER2ZrnlUGN7BhGT5YIw8liirlXA1voX+GnbxTZxX95tkYTtcLGJzfSyc/rfaD5IbnO9lVwzz43f0ITihJ04WBQjmrZHZw7E4V49oF07WNpW7M9IcDtE7OvvGHijLFV7147O6HfTH9W/LvCjltfQRYsKde/nGY+/1miUnEn+piaKrtiqbE7Q/6CgF4a66PR7kCdZyzxrKOtYMgeh8XLuNviiOmanf+w=', // ggignore
}

export interface Payoff {
  flag: string
  en: string[]
  fr: string[]
}

const STORAGE_KEY = 'couvbat:ctf'
const knownIds = new Set<string>(stages.map((s) => s.id))

/** Captured flags by stage. Anything under the key that is not a stage is dropped. */
const captured = ref<Record<string, string>>(
  Object.fromEntries(Object.entries(loadRecord(STORAGE_KEY)).filter(([id]) => knownIds.has(id))),
)

/** Misses on the current stage, for the hint ladder. In memory on purpose (spec). */
const misses = new Map<StageId, number>()

export function capturedFlag(id: StageId): string | undefined {
  return captured.value[id]
}

/** The first stage without a flag, or undefined once the chain is done. */
export function currentStage(): Stage | undefined {
  return stages.find((stage) => !captured.value[stage.id])
}

export const solvedCount = computed(() => stages.filter((s) => captured.value[s.id]).length)

export function missesOn(id: StageId): number {
  return misses.get(id) ?? 0
}

/** The hint for a stage given how often the visitor has missed on it. */
export function hintFor(stage: Stage): Localised {
  const count = missesOn(stage.id)
  return stage.hints[count >= 6 ? 2 : count >= 3 ? 1 : 0]
}

/**
 * `CTF{hex}` with the hex lowercased, or null for anything that is not flag-shaped.
 * Case is forgiven on the wrapper and the digits alike — nobody should fail a stage
 * over a caps-lock.
 */
export function normaliseFlag(input: string): string | null {
  const match = /^ctf\{([0-9a-f]{16})\}$/i.exec(input.trim())
  return match ? `CTF{${match[1]!.toLowerCase()}}` : null
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

async function stageFor(flag: string): Promise<Stage | undefined> {
  const hash = await sha256Hex(flag)
  return stages.find((stage) => STAGE_HASHES[stage.id] === hash)
}

function capture(id: StageId, flag: string): void {
  captured.value = { ...captured.value, [id]: flag }
  persistRecord(STORAGE_KEY, captured.value)
  misses.delete(id)
}

export type Verdict =
  | { kind: 'solved'; stage: Stage; next: Stage | undefined }
  | { kind: 'already'; stage: Stage }
  | { kind: 'order'; stage: Stage; current: Stage }
  | { kind: 'wrong'; current: Stage | undefined; misses: number }
  | { kind: 'malformed' }

/**
 * Checks a submitted flag. **Order is enforced:** a real flag for a later stage is
 * refused with the stage you are on, or grepping the bundle would skip straight to
 * the end and the chain would have no shape.
 */
export async function submitFlag(input: string): Promise<Verdict> {
  const flag = normaliseFlag(input)
  const current = currentStage()
  if (!flag) return { kind: 'malformed' }

  const stage = await stageFor(flag)
  if (stage && captured.value[stage.id]) return { kind: 'already', stage }
  if (stage && current && stage.id !== current.id) return { kind: 'order', stage, current }
  if (stage) {
    capture(stage.id, flag)
    return { kind: 'solved', stage, next: currentStage() }
  }

  if (!current) return { kind: 'wrong', current, misses: 0 }
  const count = missesOn(current.id) + 1
  misses.set(current.id, count)
  return { kind: 'wrong', current, misses: count }
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

/** Opens `SEALED` with the given seven flags. Throws if they are not the right ones. */
export async function unseal(flags: string[]): Promise<Payoff> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(flags.join('')))
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(SEALED.iv) },
    key,
    fromBase64(SEALED.data),
  )
  return JSON.parse(new TextDecoder().decode(plain)) as Payoff
}

export type Decryption =
  | { kind: 'missing'; missing: Stage[] }
  | { kind: 'corrupt' }
  | { kind: 'opened'; payoff: Payoff; verdict: Verdict }

/**
 * Stage 8. Rebuilds the key from the seven captured flags, opens the finale, and
 * submits the flag inside it — so the stage is solved by running the command, and
 * the board still gets a flag to show for it.
 */
export async function decryptFinale(): Promise<Decryption> {
  const keyStages = stages.filter((stage) => stage.id !== 'root')
  const missing = keyStages.filter((stage) => !captured.value[stage.id])
  if (missing.length) return { kind: 'missing', missing }

  let payoff: Payoff
  try {
    payoff = await unseal(keyStages.map((stage) => captured.value[stage.id]!))
  } catch {
    // Only reachable if someone edited localStorage: real captures always verify.
    return { kind: 'corrupt' }
  }
  return { kind: 'opened', payoff, verdict: await submitFlag(payoff.flag) }
}
