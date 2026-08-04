import { profile, socials, skills, availability } from '@/content'
import type { Localised } from '@/content/types'
import { isUnlocked } from '../achievements'
import { blank, line, wrap } from '../format'
import type { OutputLine } from '../types'
import { SECRET_FILE, secretContents } from './secret'
import { ENV_FILE, envFileContents } from './env-file'
import { guestbookFilenames, resolveGuestbookFile } from './guestbook-fs'

type TFunction = <T>(value: Localised<T>) => T

/** Files `ls` always lists, in listing order. */
export const FILES = ['about.txt', 'skills.txt', 'contact.txt'] as const

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
      return wrap(skills.join('  ·  ')).map((text) => line(text, 'primary'))

    case 'contact.txt':
      return [
        ...socials.map((s) => ({
          text: `${s.label.padEnd(11)}  ${s.handle}`,
          tone: 'accent' as const,
          pre: true,
        })),
        blank,
        line(t(availability), 'muted'),
      ]

    case SECRET_FILE:
      return secretContents(t)

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
