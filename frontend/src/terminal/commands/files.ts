import { profile, socials, skills, availability } from '@/content'
import type { Localised } from '@/content/types'
import { blank, line, wrap } from '../format'
import type { OutputLine } from '../types'
import { SECRET_FILE, secretContents } from './secret'
import { resolveGuestbookFile } from './guestbook-fs'

type TFunction = <T>(value: Localised<T>) => T

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
