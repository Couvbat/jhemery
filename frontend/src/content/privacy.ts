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
  saveIntro: {
    en: 'Your progress, scores, settings and aliases can move to another browser without an account. The link holds the values themselves, after the `#`, which a browser never sends: it goes nowhere but where you paste it. Whoever has it can restore it, so send it to yourself. The secrets never go in.',
    fr: 'Votre progression, vos scores, vos réglages et vos alias peuvent passer dans un autre navigateur sans compte. Le lien contient les valeurs elles-mêmes, après le `#`, qu’un navigateur n’envoie jamais : il ne va nulle part ailleurs que là où vous le collez. Quiconque l’a peut le restaurer, alors envoyez-le à vous-même. Les secrets n’y entrent jamais.',
  },
  restoreIntro: {
    en: 'Paste a link or a code, or open a save link. Either way nothing is written until you press restore, and only keys listed above are taken. What it holds replaces what is here, and anything else stays.',
    fr: 'Collez un lien ou un code, ou ouvrez un lien de sauvegarde. Dans les deux cas, rien n’est écrit avant que vous appuyiez sur restaurer, et seules les clés listées plus haut sont prises. Ce qu’il contient remplace ce qui est ici, et le reste ne bouge pas.',
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

/**
 * The page's buttons, labels and status lines. Here rather than in `i18n/messages.ts`,
 * which loads with every first paint while the home page sits at its byte budget: only this
 * page reads them. The heading stays there, since the tab title names it on any page.
 * `{n}` is a count, `{size}` bytes.
 */
export const privacyLabels = {
  browser: { en: 'In this browser', fr: 'Dans ce navigateur' },
  notSet: { en: 'not set', fr: 'absente' },
  secret: { en: 'secret: only its length is shown', fr: 'secret : seule sa longueur est affichée' },
  // `{n}` keys, `{size}` bytes: a group's total, beside its clear button.
  stored: { en: 'stored: {n} · {size}', fr: 'stockées : {n} · {size}' },
  clear: { en: 'clear', fr: 'effacer' },
  // The first press arms; the second, on a different button, clears. The armed button
  // turns into Cancel in place, so a double-click lands on Cancel.
  cancel: { en: 'cancel', fr: 'annuler' },
  confirm: { en: 'yes, clear {n} and reload', fr: 'oui, effacer {n} et recharger' },
  cleared: { en: 'Cleared. Reloading…', fr: 'Effacé. Rechargement…' },
  caches: { en: 'Caches', fr: 'Caches' },
  files: { en: '{n} files', fr: '{n} fichiers' },
  noCaches: {
    en: 'Nothing cached here: the service worker hasn’t stored anything yet, or isn’t running.',
    fr: 'Rien en cache ici : le service worker n’a encore rien stocké, ou ne tourne pas.',
  },
  sends: { en: 'What leaves your browser', fr: 'Ce qui quitte votre navigateur' },
} satisfies Record<string, Localised>

/** The save file's (`components/SaveFile.vue`), on the same terms. `{n}` is a count of keys, `{size}` bytes. */
export const saveFileLabels = {
  tooBig: {
    en: 'Left out, too large to carry: {keys}.',
    fr: 'Écartées, trop grandes pour être emportées : {keys}.',
  },
  writeFailed: {
    en: '{n} of {total} couldn’t be written: this browser’s storage is full or blocked.',
    fr: '{n} sur {total} n’ont pas pu être écrites : le stockage de ce navigateur est plein ou bloqué.',
  },
  heading: { en: 'Carry it to another browser', fr: 'L’emporter dans un autre navigateur' },
  groups: { en: 'What to carry', fr: 'Quoi emporter' },
  make: { en: 'make a save link ({n} · {size})', fr: 'créer un lien de sauvegarde ({n} · {size})' },
  nothing: { en: 'Nothing is stored in these groups yet.', fr: 'Rien n’est encore stocké dans ces groupes.' },
  link: { en: 'Save link', fr: 'Lien de sauvegarde' },
  copy: { en: 'copy', fr: 'copier' },
  copied: { en: 'copied', fr: 'copié' },
  qrAlt: { en: 'QR code of the save link', fr: 'QR code du lien de sauvegarde' },
  noQr: {
    en: 'Too long for a QR code a phone reads reliably: copy the link instead, or leave the shell out.',
    fr: 'Trop long pour un QR code qu’un téléphone lit sans peine : copiez plutôt le lien, ou laissez le shell de côté.',
  },
  restoreHeading: { en: 'Restore one here', fr: 'En restaurer une ici' },
  paste: { en: 'a save link or code', fr: 'un lien ou un code de sauvegarde' },
  read: { en: 'read it', fr: 'le lire' },
  restore: { en: 'restore {n} and reload', fr: 'restaurer {n} et recharger' },
  restoring: { en: 'Restored. Reloading…', fr: 'Restauré. Rechargement…' },
  fresh: { en: 'new here', fr: 'nouvelle ici' },
  replaces: { en: 'replaces what is here', fr: 'remplace l’actuelle' },
  same: { en: 'already the same', fr: 'déjà identique' },
  dropped: {
    en: '{n} more in it were left out: secrets, or keys this site doesn’t keep.',
    fr: '{n} autres y ont été écartées : des secrets, ou des clés que ce site ne garde pas.',
  },
  empty: { en: 'It holds nothing this site keeps.', fr: 'Il ne contient rien que ce site garde.' },
  malformed: { en: 'That isn’t a save code, or it was cut short.', fr: 'Ce n’est pas un code de sauvegarde, ou il a été tronqué.' },
  version: {
    en: 'That code comes from a newer version of the site. Reload and try again.',
    fr: 'Ce code vient d’une version plus récente du site. Rechargez et réessayez.',
  },
  unsupported: { en: 'This browser can’t unpack that code. A newer one can.', fr: 'Ce navigateur ne sait pas décompresser ce code. Un plus récent le peut.' },
  tooLarge: {
    en: 'That code unpacks to more than any save holds, so it wasn’t read.',
    fr: 'Ce code se décompresse en plus qu’aucune sauvegarde n’en contient : il n’a pas été lu.',
  },
} satisfies Record<string, Localised>
