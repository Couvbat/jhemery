import { profile } from './profile'
import type { Localised } from './types'

/**
 * The real way to report a security problem (roadmap §J, *Disclosure policy*): the CTF is
 * the pretend one, and this is the channel for whatever it doesn't cover. Two readers:
 * `/security`, and `security.txt` (RFC 9116), which `vite-plugins/security.ts` writes at
 * build time and `.htaccess` also answers at `/.well-known/security.txt`.
 *
 * Imported as `@/content/security`, never through the barrel, as `privacy.ts` is: only
 * the lazy page and the build read it.
 */

/** The page's headings, here rather than in `i18n/messages.ts` for the reason this module is outside the barrel. */
export const securityLabels = {
  updated: { en: 'Policy last updated', fr: 'Politique mise à jour le' },
  report: { en: 'How to report it', fr: 'Comment le signaler' },
  inScope: { en: 'What counts', fr: 'Ce qui compte' },
  outOfScope: { en: 'What doesn’t', fr: 'Ce qui ne compte pas' },
  harbour: { en: 'Testing in good faith', fr: 'Tester de bonne foi' },
  thanks: { en: 'Thanks', fr: 'Remerciements' },
} satisfies Record<string, Localised>

/** Bump when the policy's wording changes, since the page dates it. */
export const POLICY_UPDATED = '2026-10-14'

/**
 * How long a built `security.txt` says it is good for. RFC 9116 asks for less than a
 * year. Half a year is far longer than any gap between deploys so far, and a site left
 * alone for longer than that should stop claiming its policy is current.
 */
export const EXPIRES_DAYS = 180

export interface Acknowledgment {
  name: string
  /** `YYYY-MM-DD`, when the fix shipped. */
  date: string
  what: Localised
  url?: string
}

/** Whoever reported something real, with their permission, newest first. */
export const acknowledgments: readonly Acknowledgment[] = []

export const securityCopy = {
  intro: {
    en: 'If you find a way to break this site, or a claim on it that doesn’t hold, I’d like to hear about it. This is the real channel: the CTF is the game, and this page is not part of it.',
    fr: 'Si vous trouvez un moyen de casser ce site, ou une affirmation qui n’y tient pas, j’aimerais le savoir. C’est le vrai canal : le CTF est le jeu, et cette page n’en fait pas partie.',
  },
  inScope: [
    {
      en: `This site and its API: ${profile.domain} and api.${profile.domain}.`,
      fr: `Ce site et son API : ${profile.domain} et api.${profile.domain}.`,
    },
    {
      en: 'Any claim on /privacy that doesn’t hold: a visitor id behind presence, a question `ask` keeps, a value `strace` shows, a key the list leaves out, a file a tool uploads.',
      fr: 'Toute affirmation de /privacy qui ne tient pas : un identifiant de visiteur derrière la présence, une question que garde `ask`, une valeur que montre `strace`, une clé que la liste oublie, un fichier qu’un outil envoie.',
    },
    {
      en: 'Script or markup reaching the page through anything a visitor writes: the guestbook, a room’s queue, a `?run=` link.',
      fr: 'Du script ou du balisage qui arrive sur la page par ce qu’écrit un visiteur : le livre d’or, la file d’une salle, un lien `?run=`.',
    },
    {
      en: 'Taking over a room or a game seat, getting past the downloader’s password, or getting round the rate limit by forging your address.',
      fr: 'Prendre la main sur une salle ou une place de jeu, passer le mot de passe du téléchargeur, ou contourner la limite de débit en falsifiant votre adresse.',
    },
  ],
  outOfScope: [
    {
      en: 'The CTF. Its flags, its hints and the credentials in `.env` are the game, and spoiling it is not a vulnerability.',
      fr: 'Le CTF. Ses drapeaux, ses indices et les identifiants de `.env` font partie du jeu, et le divulgâcher n’est pas une vulnérabilité.',
    },
    {
      en: 'Denial of service, load tests, brute force, and filling the guestbook: it is one small server.',
      fr: 'Le déni de service, les tests de charge, la force brute et le remplissage du livre d’or : c’est un petit serveur.',
    },
    {
      en: 'SoundCloud, YouTube, Steam, GitHub and the hosting provider. Please report to them.',
      fr: 'SoundCloud, YouTube, Steam, GitHub et l’hébergeur. Signalez-le-leur directement.',
    },
    {
      en: 'A scanner’s report with no consequence shown, such as a missing header.',
      fr: 'Un rapport de scanner sans conséquence démontrée, comme un en-tête manquant.',
    },
  ],
  report: {
    en: 'Write to the address below with what you did, what you could read or change, and the address it happened at. Leave anyone else’s data out of it beyond what shows the problem. There is no PGP key: if the details are sensitive, say so in a first message and we’ll agree on how to send them.',
    fr: 'Écrivez à l’adresse ci-dessous : ce que vous avez fait, ce que vous avez pu lire ou modifier, et l’adresse où c’est arrivé. N’y mettez les données de personne d’autre au-delà de ce qui montre le problème. Il n’y a pas de clé PGP : si les détails sont sensibles, dites-le dans un premier message et nous conviendrons d’un moyen de les envoyer.',
  },
  expect: {
    en: 'This is one person’s site, so there is no bounty. I’ll reply, fix what is real, say what I changed, and thank you below if you’d like.',
    fr: 'C’est le site d’une seule personne : il n’y a pas de prime. Je réponds, je corrige ce qui est réel, je dis ce que j’ai changé, et je vous remercie ci-dessous si vous le souhaitez.',
  },
  safeHarbour: {
    en: 'Testing in good faith within this scope is welcome, and I won’t take legal action or complain to your provider over it. Stop once you have shown the problem, don’t keep or pass on data that isn’t yours, and give me a reasonable time to fix it before you publish.',
    fr: 'Les tests de bonne foi dans ce périmètre sont les bienvenus, et je n’engagerai pas de poursuites ni ne me plaindrai à votre fournisseur pour cela. Arrêtez-vous une fois le problème démontré, ne gardez ni ne transmettez de données qui ne sont pas les vôtres, et laissez-moi un délai raisonnable pour corriger avant de publier.',
  },
  noThanks: { en: 'Nobody yet.', fr: 'Personne pour l’instant.' },
} satisfies Record<string, Localised | Localised[]>

const SITE = `https://${profile.domain}`

/**
 * `security.txt`, RFC 9116. `Contact` and `Expires` are the two it requires; the rest
 * point at the page. Both locations are `Canonical`, since `.htaccess` answers the
 * well-known one from the file at the root (the deploy never uploads `.well-known/`,
 * which AutoSSL owns).
 */
export function buildSecurityTxt(at: Date = new Date()): string {
  const expires = new Date(at.getTime() + EXPIRES_DAYS * 86_400_000)
  return [
    `# How to report a security problem in ${profile.domain} or api.${profile.domain}.`,
    `# The policy, in English and French: ${SITE}/security`,
    `Contact: mailto:${profile.email}`,
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: en, fr',
    `Canonical: ${SITE}/.well-known/security.txt`,
    `Canonical: ${SITE}/security.txt`,
    `Policy: ${SITE}/security`,
    `Acknowledgments: ${SITE}/security#thanks`,
    '',
  ].join('\n')
}
