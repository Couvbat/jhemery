import type { LabLinkKind } from '@/content/lab'
import type { Localised } from '@/content/types'

/**
 * The lab page's words. Here rather than in `i18n/messages.ts`, which the home page
 * loads whole: the home page's byte budget is nearly spent (§J's review), and these are
 * only read in the lab's own chunk. `{name}`, `{n}`, `{date}` and `{value}` are filled in
 * where they are used.
 */
export const labLabels = {
  heading: { en: 'The lab', fr: 'Le labo' },
  intro: {
    en: 'The machines and services behind this site and its model, left to right in the order a request meets them. The diagram is built into the page; the colours come from a snapshot the lab pushes to the API once a minute. Nothing here reaches into the lab, and nothing on this page can act on it.',
    fr: 'Les machines et les services derrière ce site et son modèle, de gauche à droite dans l’ordre où une requête les rencontre. Le schéma est intégré à la page ; les couleurs viennent d’un instantané que le labo envoie à l’API une fois par minute. Rien ici n’entre dans le labo, et rien sur cette page ne peut agir sur lui.',
  },
  tiers: [
    { en: 'you', fr: 'vous' },
    { en: 'the edge', fr: 'la bordure' },
    { en: 'the hosts', fr: 'les hébergeurs' },
    { en: 'the way in', fr: 'l’entrée' },
    { en: 'the machines', fr: 'les machines' },
  ] as Localised[],
  asking: { en: 'asking the API…', fr: 'interrogation de l’API…' },
  more: { en: 'more', fr: 'détails' },
  stack: { en: 'Stack', fr: 'Pile' },
  whyLink: { en: 'why: `why {name}`', fr: 'pourquoi : `why {name}`' },
  runsHere: { en: 'Runs here', fr: 'Tourne ici' },
  memory: { en: 'memory', fr: 'mémoire' },
  load: { en: 'load', fr: 'charge' },
  up: { en: 'up {value}', fr: 'lancé depuis {value}' },
  containers: { en: '{n} containers running', fr: '{n} conteneurs actifs' },
  gpu: { en: 'GPU {value}', fr: 'GPU {value}' },
  vram: { en: 'VRAM {value}', fr: 'VRAM {value}' },
  pools: { en: 'Pools', fr: 'Pools' },
  history: { en: 'Last 30 days', fr: '30 derniers jours' },
  dayCell: { en: '{date}: {value}', fr: '{date} : {value}' },
  noDay: { en: 'no data', fr: 'pas de données' },
  models: { en: 'Loaded: {value}', fr: 'Chargés : {value}' },
  installed: { en: '{n} models installed', fr: '{n} modèles installés' },
  noneLoaded: { en: 'no model loaded', fr: 'aucun modèle chargé' },
  outside: {
    en: 'See it from the terminal too: `lab`, or `hardware nas` for the specs.',
    fr: 'Aussi depuis le terminal : `lab`, ou `hardware nas` pour les caractéristiques.',
  },
  legend: { en: 'What the wires are', fr: 'Ce que sont les fils' },
} satisfies Record<string, Localised | Localised[]>

/** The *Ask the lab* panel's words (`AskTheLab.vue`). */
export const askLabels = {
  heading: { en: 'Ask the lab', fr: 'Demander au labo' },
  intro: {
    en: 'The same model `ask` reaches from the terminal, on the GPU drawn above. It answers from what this site already says and from the lab as it is now, and shares the terminal’s five questions an hour.',
    fr: 'Le même modèle que `ask` joint depuis le terminal, sur le GPU dessiné plus haut. Il répond d’après ce que ce site dit déjà et d’après le labo tel qu’il est, et partage les cinq questions par heure du terminal.',
  },
  label: { en: 'Your question', fr: 'Votre question' },
  send: { en: 'Ask', fr: 'Demander' },
  asking: { en: 'asking…', fr: 'question en cours…' },
  suggestions: { en: 'Or start from one of these (they fill the box, nothing is sent):', fr: 'Ou partez de l’une de celles-ci (elles remplissent le champ, rien n’est envoyé) :' },
  short: { en: 'A question needs at least 3 characters.', fr: 'Une question demande au moins 3 caractères.' },
  long: { en: 'Keep it under 240 characters.', fr: 'Restez sous les 240 caractères.' },
  answer: { en: 'The answer', fr: 'La réponse' },
} satisfies Record<string, Localised>

/** Three questions that fill the box without sending it: asking spends one of five. */
export const askSuggestions: Localised[] = [
  { en: 'What runs this site?', fr: 'Qu’est-ce qui fait tourner ce site ?' },
  { en: 'Why does the guestbook ticker poll?', fr: 'Pourquoi le défilant du livre d’or interroge-t-il l’API ?' },
  { en: 'Which models are loaded?', fr: 'Quels modèles sont chargés ?' },
]

/** How a link is said in a card's text, so nothing is said by a line alone. */
export const linkWords: Record<LabLinkKind, Localised> = {
  public: { en: 'reaches {name}', fr: 'joint {name}' },
  tunnel: { en: 'reaches {name}, through the tunnel', fr: 'joint {name}, par le tunnel' },
  restricted: { en: 'reaches {name}, through a restricted rule', fr: 'joint {name}, par une règle restreinte' },
  private: { en: 'reaches {name}, privately', fr: 'joint {name}, en privé' },
  push: { en: 'pushes to {name}', fr: 'envoie à {name}' },
}

/** The legend's words for each kind of wire. */
export const wireWords: Record<LabLinkKind, Localised> = {
  public: { en: 'public', fr: 'public' },
  tunnel: { en: 'through the tunnel', fr: 'par le tunnel' },
  restricted: { en: 'restricted', fr: 'restreint' },
  private: { en: 'private, admin only', fr: 'privé, administration seulement' },
  push: { en: 'the lab’s push', fr: 'l’envoi du labo' },
}
