import type { Education, Role } from './types'

/**
 * Work and study, newest first. Every résumé reads these — `resume`, `resume.txt`,
 * both printable résumés and `content.json` — so a duration is never typed anywhere:
 * it is worked out from these months (`durationLabel` in `./dates`).
 *
 * Nothing narrower than "France", the same choice the weather row makes: no city, and
 * the earlier employer and the school are described rather than named, because their
 * names point at a département and a registry address.
 */
export const experience: Role[] = [
  {
    employer: { en: 'In-Leed', fr: 'In-Leed' },
    title: { en: 'Full-Stack Developer', fr: 'Développeur Full-Stack' },
    start: '2023-11',
    summary: {
      en: 'Web apps, REST APIs and internal tools.',
      fr: 'Applications web, APIs REST et outils internes.',
    },
  },
  {
    employer: { en: 'A family roofing company', fr: 'Une entreprise familiale de couverture' },
    title: { en: 'Web Developer', fr: 'Développeur web' },
    start: '2023-05',
    end: '2023-11',
  },
]

/** The role with no end. `profile.employer` must name it; a spec holds the two together. */
export const currentRole: Role | undefined = experience.find((role) => !role.end)

export const education: Education[] = [
  {
    school: { en: 'CCI (Chamber of Commerce and Industry)', fr: 'CCI (Chambre de commerce et d’industrie)' },
    course: {
      en: 'Web and mobile web developer (DWWM)',
      fr: 'Développeur web et web mobile (DWWM)',
    },
    start: '2021-10',
    end: '2022-06',
    note: { en: 'With highest honours (mention Très bien)', fr: 'Mention Très bien' },
  },
  {
    school: { en: 'ESD — École Supérieure du Digital', fr: 'ESD — École Supérieure du Digital' },
    course: {
      en: 'Web design and digital media, first year',
      fr: 'Design web et multimédia, première année',
    },
    start: '2019-10',
    end: '2020-03',
  },
]
