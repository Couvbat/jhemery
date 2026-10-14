import { profile } from './profile'
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
  contact: {
    en: 'The contact form and `mail` send your name, address and message to my inbox, as an email. I use them only to answer you, and delete them at the latest three years after we last wrote.',
    fr: 'Le formulaire de contact et `mail` envoient votre nom, votre adresse et votre message dans ma boîte, par email. Ils ne servent qu’à vous répondre, et je les supprime au plus tard trois ans après notre dernier échange.',
  },
  guestbook: {
    en: '`sign` publishes the name and message you give, with the date, for every visitor to read. An entry stays until 500 newer ones push it out, or until you ask me to remove it.',
    fr: '`sign` publie le nom et le message que vous donnez, avec la date, à la vue de tous les visiteurs. Un message reste jusqu’à ce que 500 plus récents le poussent dehors, ou jusqu’à ce que vous me demandiez de le retirer.',
  },
  addresses: {
    en: 'Your IP address reaches the server with every request. The rate limiter keeps it to stop abuse, in memory only, never on disk: it counts against you for an hour at the longest, and the entry goes at the next clean-up, which runs as later requests arrive, or when the server restarts. The host’s access logs record it too, under o2switch’s own retention.',
    fr: 'Votre adresse IP arrive au serveur avec chaque requête. Le limiteur de débit la garde pour freiner les abus, en mémoire seulement, jamais sur disque : elle compte contre vous une heure au plus, puis l’entrée part au nettoyage suivant, qui passe à l’arrivée des requêtes suivantes, ou au redémarrage du serveur. Les journaux d’accès de l’hébergeur l’enregistrent aussi, selon la durée de conservation d’o2switch.',
  },
  cloudflare: {
    en: 'Cloudflare carries every request on its way to the server, so it sees your IP address, the page asked for and your browser’s user agent. It acts on my behalf, and its transfers to the US rest on the EU–US Data Privacy Framework.',
    fr: 'Cloudflare transporte chaque requête jusqu’au serveur : il voit votre adresse IP, la page demandée et l’user agent de votre navigateur. Il agit pour mon compte, et ses transferts vers les États-Unis reposent sur le Data Privacy Framework UE–États-Unis.',
  },
  embeds: {
    en: 'SoundCloud’s player loads only when you press its button or type `play`, and a room’s YouTube or SoundCloud player only when you open a room. Once loaded, those services see your IP address and set their own cookies, under their own policies.',
    fr: 'Le lecteur SoundCloud ne se charge que si vous appuyez sur son bouton ou tapez `play`, et le lecteur YouTube ou SoundCloud d’un salon que si vous ouvrez ce salon. Une fois chargés, ces services voient votre adresse IP et déposent leurs propres cookies, selon leurs propres règles.',
  },
  upstream: {
    en: 'Weather, prices, Steam and GitHub are fetched by the server, with its own keys and my coordinates: nothing about you goes to them.',
    fr: 'Météo, cours, Steam et GitHub sont interrogés par le serveur, avec ses propres clés et mes coordonnées : rien sur vous ne leur parvient.',
  },
  strace: {
    en: 'None of this needs taking on trust. `strace <command>` runs a command and lists every request it made, with the keys of what was sent and never the values.',
    fr: 'Rien de tout cela n’est à croire sur parole. `strace <commande>` lance une commande et liste chaque requête qu’elle a faite, avec les clés de ce qui est parti et jamais les valeurs.',
  },
  analyticsOn: {
    en: 'Visits from this browser are counted. Refusing stops the tracker at once, in every open tab, and keeps it from loading at all after that.',
    fr: 'Les visites de ce navigateur sont comptées. Refuser arrête le traceur aussitôt, dans tous les onglets ouverts, puis l’empêche de se charger du tout.',
  },
  analyticsOff: {
    en: 'You refused: this browser loads no tracker and is not counted.',
    fr: 'Vous avez refusé : ce navigateur ne charge aucun traceur et n’est pas compté.',
  },
  controller: {
    en: `${profile.name}, who publishes the site as a private individual, answers for what it does with your data. Write to ${profile.email}.`,
    fr: `${profile.name}, qui édite le site à titre de particulier, répond de ce qu’il fait de vos données. Écrivez à ${profile.email}.`,
  },
  bases: {
    en: 'Answering your messages and keeping the site safe rest on my legitimate interest; the guestbook rests on your consent, which you withdraw by asking for your entry to go.',
    fr: 'Répondre à vos messages et protéger le site reposent sur mon intérêt légitime ; le livre d’or repose sur votre consentement, que vous retirez en demandant le retrait de votre message.',
  },
  rights: {
    en: `You can ask to see, correct or delete what I hold about you, or object to its use, by writing to ${profile.email}. I answer within a month. If you think I got it wrong, you can complain to the CNIL.`,
    fr: `Vous pouvez demander à voir, corriger ou effacer ce que je détiens sur vous, ou vous opposer à son usage, en écrivant à ${profile.email}. Je réponds sous un mois. Si vous estimez que j’ai mal fait, vous pouvez saisir la CNIL.`,
  },
} satisfies Record<string, Localised>
