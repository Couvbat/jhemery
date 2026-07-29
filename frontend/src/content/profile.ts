import type { Localised } from './types'

export const profile = {
  name: 'Jules Hémery',
  alias: 'Couvbat',
  handle: 'couvbat',
  host: 'portfolio',
  age: 25,
  employer: 'In-Leed',
  location: 'France',
  email: 'contact@jhemery.xyz',
  domain: 'jhemery.xyz',
  /** Used by `neofetch` to compute an "uptime" — first commit on the portfolio. */
  since: '2025-06-16',
  role: {
    en: 'Full-Stack Developer',
    fr: 'Développeur Full-Stack',
  } satisfies Localised,
  tagline: {
    en: 'Jules Hémery — Full-Stack Developer, Musician & Gamer.',
    fr: 'Jules Hémery — Développeur Full-Stack, Musicien & Gamer.',
  } satisfies Localised,
  languages: {
    en: 'French · English',
    fr: 'Français · Anglais',
  } satisfies Localised,
  bio: {
    en: [
      "Hey, I'm Jules Hémery, aka Couvbat.",
      '25 y/o Full-Stack Developer at In-Leed, based in France — 2 years of experience building web apps with modern stacks. When I\'m not shipping features I\'m producing music, playing games w/friends, or tinkering with AI.',
    ],
    fr: [
      "Salut, moi c'est Jules Hémery, alias Couvbat.",
      "Développeur Full-Stack de 25 ans chez In-Leed, basé en France — 2 ans d'expérience à construire des applications web avec des stacks modernes. Quand je ne livre pas de features, je produis de la musique, je joue avec des potes, ou je bidouille de l'IA.",
    ],
  } satisfies Localised<string[]>,
} as const
