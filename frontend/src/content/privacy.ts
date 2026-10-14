import type { Localised } from './types'

/**
 * The paragraphs of `/privacy`: what the site keeps and what leaves the browser, each claim
 * held to the code that makes it true. Copy rather than interface, so it lives here, and it
 * is imported as `@/content/privacy`, never through the barrel: only the lazy privacy page
 * reads it, and through the barrel it would load with every first paint, against the home
 * page's byte budget (`fortunes.ts` stays out of the barrel for the same reason). The page's
 * buttons and status lines stay in `i18n/messages.ts` beside the rest of the interface.
 */
export const privacyCopy = {
  intro: {
    en: 'Everything the site stores in your browser, what each piece is for, and a way to clear it. None of it is a cookie, so none of it rides along with a request. In the terminal, the same list is `du ~`, and `rm` clears it.',
    fr: 'Tout ce que le site stocke dans votre navigateur, à quoi sert chaque élément, et de quoi l’effacer. Rien de tout cela n’est un cookie : rien ne part avec une requête. Dans le terminal, la même liste s’obtient avec `du ~`, et `rm` l’efface.',
  },
  reloadNote: {
    en: 'The page reloads afterwards, so nothing on screen keeps an old copy.',
    fr: 'La page se recharge ensuite, pour que rien à l’écran n’en garde une vieille copie.',
  },
  cachesIntro: {
    en: 'The service worker keeps copies of the site’s own files, so it loads fast and opens offline. Nothing in them is about you, so they are listed here, not cleared.',
    fr: 'Le service worker garde des copies des fichiers du site, pour qu’il se charge vite et s’ouvre hors ligne. Rien là-dedans ne vous concerne : ils sont listés ici, pas effacés.',
  },
  presence: {
    en: 'Presence is one integer, pushed to the pages listening for it: how many people are here, with no visitor id anywhere behind it. `wall`’s wave carries nothing at all.',
    fr: 'La présence est un seul entier, poussé aux pages qui l’écoutent : combien de personnes sont là, sans aucun identifiant de visiteur derrière. Le signe de `wall` ne transporte rien du tout.',
  },
  stats: {
    en: 'Stats count sessions, not commands: the terminal reports once a visit that it was opened, never what ran in it. A finished daily `wordle` also sends the day, the language and the number of guesses.',
    fr: 'Les statistiques comptent des sessions, pas des commandes : le terminal signale une fois par visite qu’il a été ouvert, jamais ce qui y a tourné. Un `wordle` du jour terminé envoie aussi le jour, la langue et le nombre d’essais.',
  },
  ask: {
    en: '`ask` never logs what you asked or what it answered, only how long it took and whether it worked.',
    fr: '`ask` n’enregistre jamais ce que vous avez demandé ni ce qu’il a répondu, seulement le temps que ça a pris et si ça a marché.',
  },
  analytics: {
    en: 'Analytics are Umami, self-hosted and cookieless: page views, and one event when the terminal opens.',
    fr: 'Les statistiques de visite viennent d’Umami, auto-hébergé et sans cookie : les pages vues, et un événement à l’ouverture du terminal.',
  },
  strace: {
    en: 'None of this needs taking on trust. `strace <command>` runs a command and lists every request it made, with the keys of what was sent and never the values. If a claim here doesn’t hold, /security says how to tell me.',
    fr: 'Rien de tout cela n’est à croire sur parole. `strace <commande>` lance une commande et liste chaque requête qu’elle a faite, avec les clés de ce qui est parti et jamais les valeurs. Si une affirmation ne tient pas, /security dit comment me le signaler.',
  },
} satisfies Record<string, Localised>
