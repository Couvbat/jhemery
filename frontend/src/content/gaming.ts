import type { FavouriteGame, Localised } from './types'

export const gaming = {
  genres: ['RPG', 'Roguelite', 'Strategy', 'Indie', 'Simulation', 'FPS'],
  platforms: ['PC', 'Steam'],
  blurb: {
    en: "Gaming is where I unwind, compete, and explore. I love games that challenge both my reflexes and my mind — whether it's optimising a build, speedrunning a level, or discovering hidden lore.",
    fr: "Le jeu, c'est là où je décompresse, où je me mesure aux autres et où j'explore. J'aime les jeux qui sollicitent autant mes réflexes que ma tête — optimiser un build, speedrunner un niveau, ou dénicher du lore caché.",
  } satisfies Localised,
  /**
   * The games worth a line whatever is being played. Steam adds each one's hours and
   * achievements beside the live activity (`/steam/activity?apps=`, at most eight); with
   * Steam off they show as they are here, and nothing on the card claims to be live.
   */
  favourites: [
    { appId: 250900, name: 'The Binding of Isaac', note: { en: 'Real Platinum God', fr: 'Real Platinum God' } },
    { appId: 1030300, name: 'Hollow Knight: Silksong' },
    { appId: 108600, name: 'Project Zomboid' },
    { appId: 2868840, name: 'Slay the Spire 2', note: { en: 'Ascension 10', fr: 'Ascension 10' } },
    { appId: 427520, name: 'Factorio' },
    { appId: 212680, name: 'Faster Than Light' },
  ] satisfies FavouriteGame[],
} as const
