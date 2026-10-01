import { socials } from './contact'
import { durationLabel, periodLabel, yearSpan } from './dates'
import { education, experience } from './experience'
import { profile } from './profile'
import { projects } from './projects'
import { skillNames } from './skills'
import type { Localised } from './types'

/**
 * A manual page, as `man` shows it in the terminal and as `jules.1` is written in roff
 * (`vite-plugins/resume.ts`). In `content/` because the build renders `jules(1)` from it, so
 * like the rest of this folder it may only import its siblings.
 *
 * A command's page is mostly generated from the command itself (`terminal/manual.ts`); this
 * type is the shape both end up in.
 */
export interface ManPage {
  name: string
  /** 1 for commands, 6 for games and the rest of the fun. */
  section: 1 | 6
  /** The NAME line, after the dash. */
  summary: Localised
  synopsis: string[]
  description: Localised<string[]>
  options?: { flag: string; text: Localised }[]
  /** Headed sections of their own, between OPTIONS and EXAMPLES: jules(1)'s EXPERIENCE and so on. */
  sections?: { heading: Localised; lines: Localised<string[]> }[]
  examples?: { command: string; text?: Localised }[]
  /** `ls(1)`, `sl(6)`: every one names a page that exists. */
  seeAlso: string[]
}

const each = (lines: (locale: 'en' | 'fr') => string[]): Localised<string[]> => ({ en: lines('en'), fr: lines('fr') })

/** jules(1): the person, as a manual page. Built from the same content as every résumé. */
export function julesManual(at: Date = new Date()): ManPage {
  return {
    name: 'jules',
    section: 1,
    summary: {
      en: `${profile.role.en.toLowerCase()}, musician and gamer`,
      fr: `${profile.role.fr.toLowerCase()}, musicien et gamer`,
    },
    synopsis: ['jules [--hire] [--coffee]'],
    description: profile.bio,
    options: [
      { flag: '--hire', text: profile.availability.note },
      {
        flag: '--coffee',
        text: { en: 'Always accepted. See CONTACT.', fr: 'Toujours accepté. Voir CONTACT.' },
      },
    ],
    sections: [
      {
        heading: { en: 'Experience', fr: 'Expérience' },
        lines: each((l) =>
          experience.map(
            (role) =>
              `${role.employer[l]} — ${role.title[l]} (${periodLabel(role.start, role.end)[l]}, ${durationLabel(role.start, role.end, at)[l]})`,
          ),
        ),
      },
      {
        heading: { en: 'Education', fr: 'Formation' },
        lines: each((l) =>
          education.map((course) => `${course.school[l]} — ${course.course[l]} (${yearSpan(course.start, course.end)})`),
        ),
      },
      { heading: { en: 'Skills', fr: 'Compétences' }, lines: { en: [skillNames.join(', ')], fr: [skillNames.join(', ')] } },
      {
        heading: { en: 'Projects', fr: 'Projets' },
        lines: each((l) => projects.map((project) => `${project.name} — ${project.description[l]}`)),
      },
      {
        heading: { en: 'Contact', fr: 'Contact' },
        lines: each(() => socials.map((social) => `${social.label}: ${social.href.replace(/^mailto:/, '')}`)),
      },
    ],
    examples: [
      { command: `curl ${profile.domain}`, text: { en: 'the résumé, in a real terminal', fr: 'le CV, dans un vrai terminal' } },
      { command: `curl -s ${profile.domain}/jules.1 | man -l -`, text: { en: 'this page, in man itself', fr: 'cette page, dans man lui-même' } },
    ],
    seeAlso: ['resume(1)', 'neofetch(1)', 'contact(1)', 'curl(1)'],
  }
}
