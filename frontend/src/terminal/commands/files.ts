import { now, nowCategories, profile, skillNames, socials, staleDays } from '@/content'
import type { Localised } from '@/content/types'
import { isUnlocked } from '../achievements'
import { blank, line, pre, segmented, wrap } from '../format'
import type { OutputLine } from '../types'
import { SECRET_FILE, secretContents } from './secret'
import { ENV_FILE, envFileContents } from './env-file'
import { guestbookFilenames, resolveGuestbookFile } from './guestbook-fs'

type TFunction = <T>(value: Localised<T>) => T

/** Files `ls` always lists, in listing order. */
export const FILES = ['about.txt', 'skills.txt', 'contact.txt', 'now.txt'] as const

/** Files only `ls -a` reveals, in listing order. */
export const HIDDEN_FILES = [SECRET_FILE, ENV_FILE] as const

/** Reading one of these is worth an achievement. */
export const FILE_ACHIEVEMENTS: Record<string, string> = {
  [SECRET_FILE]: 'secret',
  [ENV_FILE]: 'dotenv',
}

/**
 * Every filename tab-completion may offer — the one list `ls`, `cat`, `vim` and
 * `diff` all agree on.
 *
 * A dotfile joins it only once its achievement is unlocked, i.e. once the
 * visitor has already opened it. Handing `.secret` to someone who typed `cat .`
 * would give away an easter egg, the same reason `suggest()` never names a
 * hidden command. The French filenames (`a-propos.txt`) are deliberately absent:
 * they are aliases for the same content, and `ls` doesn't list them either.
 */
export function listFiles(): string[] {
  const found = HIDDEN_FILES.filter((file) => isUnlocked(FILE_ACHIEVEMENTS[file]!))
  return [...FILES, ...found, ...guestbookFilenames()]
}

/**
 * Stage 4 of the CTF chain (terminal/ctf.ts). Stored already rotated, so the bundle
 * carries the same gibberish the screen does. Addressable by its path only: never
 * listed, never completed, since a real box does not advertise it either.
 */
export const SHADOW_FILE = '/etc/shadow'
const SHADOW_ROT13 = [
  'ebbg:$6$ebhaqf=5000$pbhiong$Wd3xK9iG0mD.yJ2e8zLc1pA4fUq7hStOrN6vBwXgYk5El:20355:0:99999:7:::',
  'qnrzba:*:20355:0:99999:7:::',
  'jjj-qngn:*:20355:0:99999:7:::',
  'pbhiong:$6$ebhaqf=5000$grezvany$Ia7Dj2Rx5Eg8Lh1Vb4Cn6Fq9St3Uw0Xy.Mk4Pi7Oa2Zz5Yd:20355:0:99999:7:::',
  '# synt: PGS{21q6nnqo5p940339}',
  '# arkg: unpx tvofba',
]

/** `now.txt`: the same list `/now` renders, with the same staleness rule. */
function nowLines(t: TFunction): OutputLine[] {
  const stale = staleDays(now.updated, new Date())
  const width = Math.max(...Object.values(nowCategories).map((label) => t(label).length))
  return [
    line(`# now — ${t({ en: 'updated', fr: 'mis à jour le' })} ${now.updated}`, 'muted'),
    ...(stale === null
      ? []
      : [
          line(
            t({
              en: `(${stale} days old — treat it as history, not news)`,
              fr: `(vieux de ${stale} jours — c’est de l’histoire, pas des nouvelles)`,
            }),
            'warning',
          ),
        ]),
    blank,
    ...now.entries.flatMap((entry) => {
      const label = t(nowCategories[entry.category]).padEnd(width)
      return wrap(t(entry.text), 72 - width - 2).map((text, i) =>
        segmented([
          { text: `${i === 0 ? label : ' '.repeat(width)}  `, tone: 'primary' },
          { text },
        ]),
      )
    }),
    blank,
    line(t({ en: 'also at /now', fr: 'aussi sur /now' }), 'muted'),
  ]
}

/**
 * The fake filesystem shared by `cat` and `vim` — one source of truth for what a
 * given filename contains, so the two commands can never show different content
 * for the same file. Returns `undefined` when the name doesn't resolve to anything.
 */
export function resolveFileLines(file: string, t: TFunction): OutputLine[] | undefined {
  switch (file) {
    case 'about.txt':
    case 'a-propos.txt':
      return [
        ...t(profile.bio).flatMap((paragraph) => [
          ...wrap(paragraph).map((text) => line(text)),
          blank,
        ]),
        line(`🌐 ${t(profile.languages)}`, 'muted'),
      ]

    case 'skills.txt':
    case 'competences.txt':
      return wrap(skillNames.join('  ·  ')).map((text) => line(text, 'primary'))

    case 'contact.txt':
      return [
        ...socials.map((s) => ({
          text: `${s.label.padEnd(11)}  ${s.handle}`,
          tone: 'accent' as const,
          pre: true,
        })),
        blank,
        line(t(profile.availability.note), 'muted'),
      ]

    case 'now.txt':
    case 'maintenant.txt':
      return nowLines(t)

    case SECRET_FILE:
      return secretContents(t)

    case SHADOW_FILE:
    case 'etc/shadow':
      return SHADOW_ROT13.map((text) => pre(text, text.startsWith('#') ? 'muted' : 'default'))

    case ENV_FILE:
      return envFileContents(t)

    default: {
      const entry = resolveGuestbookFile(file)
      if (!entry) return undefined
      return [
        line(`${entry.name} — ${new Date(entry.date).toLocaleDateString()}`, 'primary'),
        ...wrap(entry.message).map((text) => line(`  ${text}`)),
      ]
    }
  }
}
