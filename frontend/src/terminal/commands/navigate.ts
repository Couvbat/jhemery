import { findSection, profile, sectionIds, sections, socials, skills, availability } from '@/content'
import { currentSection } from '@/composables/useActiveSection'
import { announce, toast, visitSection } from '../achievements'
import type { Command } from '../types'
import { blank, line, wrap } from '../format'
import { SECRET_FILE, secretContents } from './secret'
import { resolveGuestbookFile } from './guestbook-fs'

const FILES = ['about.txt', 'skills.txt', 'contact.txt'] as const

export const navigateCommands: Command[] = [
  {
    name: 'ls',
    usage: 'ls [-a]',
    description: { en: 'List sections and files', fr: 'Lister sections et fichiers' },
    group: 'navigate',
    run({ args, t }) {
      const showHidden = args.some((a) => a === '-a' || a === '-la' || a === '-al')

      const dirs = sections.map((s) => ({
        text: `${t(s.label)}/`.padEnd(14),
        tone: 'primary' as const,
        pre: true,
      }))
      const files = FILES.map((f) => ({ text: f, tone: 'default' as const, pre: true }))
      const hidden = showHidden
        ? [{ text: SECRET_FILE, tone: 'muted' as const, pre: true }]
        : []

      return [...dirs, ...files, ...hidden]
    },
  },
  {
    name: 'cd',
    usage: 'cd <section>',
    description: { en: 'Jump to a section', fr: 'Aller à une section' },
    group: 'navigate',
    run({ args, navigate, t }) {
      const [target] = args
      const bare = !target || target === '~' || target === '/'
      const section = bare ? sections[0] : findSection(target)

      if (!section) {
        return [line(`cd: ${target}: No such file or directory`, 'error')]
      }

      navigate(section.id)
      const unlocks = toast(visitSection(section.id, sectionIds), t)
      if (bare) return unlocks.length ? unlocks : undefined
      return [line(`~/${t(section.label)}`, 'muted'), ...unlocks]
    },
  },
  {
    name: 'pwd',
    description: { en: 'Print the current section', fr: 'Afficher la section courante' },
    group: 'navigate',
    run() {
      return [line(`/home/${profile.handle}/${currentSection()}`, 'muted')]
    },
  },
  {
    name: 'cat',
    usage: 'cat <file>',
    description: { en: 'Print a file', fr: 'Afficher un fichier' },
    group: 'navigate',
    run({ args, t }) {
      const [file] = args
      if (!file) return [line('cat: missing operand', 'error')]

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
          return [...secretContents(t), ...announce('secret', t)]

        default: {
          const entry = resolveGuestbookFile(file)
          if (entry) {
            return [
              line(`${entry.name} — ${new Date(entry.date).toLocaleDateString()}`, 'primary'),
              ...wrap(entry.message).map((text) => line(`  ${text}`)),
            ]
          }
          return [line(`cat: ${file}: No such file or directory`, 'error')]
        }
      }
    },
  },
  {
    name: 'open',
    usage: 'open <github|linkedin|soundcloud|steam|email>',
    description: { en: 'Open an external link', fr: 'Ouvrir un lien externe' },
    group: 'navigate',
    run({ args }) {
      const [target] = args
      const targets: Record<string, string> = {
        ...Object.fromEntries(socials.map((s) => [s.keyword, s.href])),
        steam: 'https://steamcommunity.com/id/couvbat',
        cv: `https://${profile.domain}/resume.txt`,
        resume: `https://${profile.domain}/resume.txt`,
      }

      if (!target) {
        return [
          line('open: missing target', 'error'),
          line(`available: ${Object.keys(targets).join(', ')}`, 'muted'),
        ]
      }

      const href = targets[target.toLowerCase()]
      if (!href) return [line(`open: unknown target \`${target}\``, 'error')]

      window.open(href, '_blank', 'noopener,noreferrer')
      return [line(`opening ${href}`, 'success')]
    },
  },
]
