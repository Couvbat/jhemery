import type { GameEntry, Localised } from './types'

export const gaming = {
  genres: ['RPG', 'Roguelite', 'Strategy', 'Indie', 'Simulation', 'FPS'],
  platforms: ['PC', 'Steam'],
  blurb: {
    en: "Gaming is where I unwind, compete, and explore. I love games that challenge both my reflexes and my mind — whether it's optimising a build, speedrunning a level, or discovering hidden lore.",
    fr: "Le jeu, c'est là où je décompresse, où je me mesure aux autres et où j'explore. J'aime les jeux qui sollicitent autant mes réflexes que ma tête — optimiser un build, speedrunner un niveau, ou dénicher du lore caché.",
  } satisfies Localised,
  /** Shown when the Steam API is unconfigured or unreachable. */
  fallbackGames: [
    {
      name: 'The Binding of Isaac',
      status: { en: 'Real Platinum God', fr: 'Real Platinum God' },
    },
    {
      name: 'Hollow Knight: Silksong',
      status: { en: 'Currently playing', fr: 'En cours' },
    },
    {
      name: 'Project Zomboid',
      status: { en: 'Currently playing', fr: 'En cours' },
    },
    {
      name: 'Slay the Spire 2',
      status: { en: 'Ascension 10', fr: 'Ascension 10' },
    },
    { name: 'Factorio', status: { en: '150+ hours', fr: '150+ heures' } },
    { name: 'Faster Than Light', status: { en: '200+ hours', fr: '200+ heures' } },
  ] satisfies GameEntry[],
} as const
