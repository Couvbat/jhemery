import type { Localised, SocialLink } from './types'

export const socials: SocialLink[] = [
  {
    label: 'GitHub',
    handle: '@Couvbat',
    href: 'https://github.com/Couvbat',
    keyword: 'github',
  },
  {
    label: 'LinkedIn',
    handle: 'Jules Hémery',
    href: 'https://www.linkedin.com/in/jules-h%C3%A9mery-338134195/',
    keyword: 'linkedin',
  },
  {
    label: 'SoundCloud',
    handle: '@couvbat',
    href: 'https://soundcloud.com/couvbat',
    keyword: 'soundcloud',
  },
  {
    label: 'Email',
    handle: 'contact@jhemery.xyz',
    href: 'mailto:contact@jhemery.xyz',
    keyword: 'email',
  },
]

export const availability = {
  en: 'Open to freelance & new opportunities',
  fr: 'Ouvert au freelance & aux nouvelles opportunités',
} satisfies Localised
