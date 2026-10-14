import { seasonOn, type SeasonId } from './seasons'
import type { Localised } from './types'

/**
 * What `fortune` says. In `content/` since it became copy in two languages: each French
 * line translates the joke rather than the words, so a pun can land on a different word
 * or go altogether (a "mature optimisation" becomes a permanent contract).
 *
 * Imported as `@/content/fortunes`, never through the barrel. The barrel's chunk loads with
 * the first paint (the boot log reads `seasons.ts` through it), and while the barrel
 * re-exported this module the build kept it in that chunk, though only the terminal uses
 * it: about 1.6 kB of gzip on every first visit, for a hidden command.
 */
export const fortunes: readonly Localised[] = [
  {
    en: 'Weeks of coding can save you hours of planning.',
    fr: 'Des semaines de code peuvent vous épargner des heures de conception.',
  },
  {
    en: 'There are two hard problems in computer science: cache invalidation, naming things, and off-by-one errors.',
    fr: 'Il y a deux problèmes difficiles en informatique : l’invalidation de cache, le nommage, et les erreurs à un près.',
  },
  {
    en: 'It works on my machine is a valid bug report if you ship the machine.',
    fr: '« Ça marche sur ma machine » est un rapport de bug recevable, si vous livrez la machine avec.',
  },
  {
    en: 'The best code is no code. The second best is code you deleted last week.',
    fr: 'Le meilleur code est celui qu’on n’écrit pas. Le deuxième meilleur, celui qu’on a supprimé la semaine dernière.',
  },
  {
    en: 'A TODO comment is a promise you make to a stranger.',
    fr: 'Un commentaire TODO est une promesse faite à un parfait inconnu.',
  },
  {
    en: 'Any sufficiently advanced configuration is indistinguishable from code.',
    fr: 'Toute configuration suffisamment avancée est indiscernable du code.',
  },
  {
    en: 'Premature optimisation is the root of all evil. Mature optimisation is a full-time job.',
    fr: 'L’optimisation prématurée est la racine de tous les maux. L’optimisation mature, c’est un CDI.',
  },
  {
    en: 'The bug is in the last place you look, because you stop looking.',
    fr: 'Le bug est toujours au dernier endroit où l’on cherche, puisqu’on arrête de chercher.',
  },
]

/** On a season's day `fortune` draws from its pool alone, and the everyday lines wait. */
export const seasonalFortunes: Record<SeasonId, readonly Localised[]> = {
  halloween: [
    {
      en: 'Zombie processes: dead, but still listed. Like that side project.',
      fr: 'Processus zombie : mort, mais toujours listé. Comme ce projet perso.',
    },
    { en: 'Trick or treat: `git push --force`.', fr: 'Des bonbons ou un sort : `git push --force`.' },
    {
      en: 'The legacy code was written by a ghost. The ghost is you, two years ago.',
      fr: 'Ce vieux code a été écrit par un fantôme. Le fantôme, c’est vous, il y a deux ans.',
    },
    {
      en: 'The scariest thing in this house is a deploy on a Friday night.',
      fr: 'Le plus effrayant dans cette maison, c’est une mise en prod un vendredi soir.',
    },
  ],
  solstice: [
    {
      en: 'Longest night of the year: perfect conditions for a dark theme.',
      fr: 'La plus longue nuit de l’année : les conditions idéales pour un thème sombre.',
    },
    { en: 'The sun stands still today. So does the backlog.', fr: 'Aujourd’hui, le soleil s’arrête. Le backlog aussi.' },
    {
      en: 'From tomorrow the days get longer. Your build times won’t.',
      fr: 'Dès demain, les jours rallongent. Vos temps de build, non.',
    },
  ],
  'new-year': [
    {
      en: 'New year, same bug, new copyright header.',
      fr: 'Nouvelle année, même bug, nouvel en-tête de copyright.',
    },
    {
      en: 'Resolution: write the tests first. Status: wontfix.',
      fr: 'Bonne résolution : écrire les tests d’abord. Statut : wontfix.',
    },
    {
      en: 'Somewhere, a hard-coded year just broke a build.',
      fr: 'Quelque part, une année codée en dur vient de casser un build.',
    },
  ],
  birthday: [
    {
      en: 'A year older today, and none of it is legacy yet.',
      fr: 'Un an de plus aujourd’hui, et rien n’y est encore du legacy.',
    },
    {
      en: 'Happy birthday, couvsh: still no job control, still no regrets.',
      fr: 'Joyeux anniversaire, couvsh : toujours pas de contrôle des tâches, toujours aucun regret.',
    },
    {
      en: 'Every birthday is a reminder that the first commit was called "initial commit".',
      fr: 'Chaque anniversaire rappelle que le premier commit s’appelait « initial commit ».',
    },
  ],
}

/** The lines `fortune` picks from on `at`'s day: the season's if it is one, otherwise the everyday ones. */
export function fortunePool(at: Date = new Date()): readonly Localised[] {
  const season = seasonOn(at)
  return season ? seasonalFortunes[season.id] : fortunes
}
