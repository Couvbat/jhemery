import type { Localised } from './types'

/** Which tier of the design spec a tool sits in (§5). `wasm` tools announce their
 *  download before starting it; `admin` tools only exist after the owner unlocks them. */
export type ToolTier = 'client' | 'wasm' | 'admin'

export interface ToolInfo {
  /** URL segment (`/tools/<id>`) and what `cd tools/<id>` takes. Lowercase. */
  id: string
  name: Localised
  description: Localised
  /** Extra words the palette and `ls tools` match on; nothing else reads them. */
  keywords: string[]
  tier: ToolTier
}

/**
 * What each tool is called and does, apart from its panel: `tools/registry.ts` adds the
 * panels, and the page, the `tools` command, `ls tools`, `cd tools/<id>` and Tab all read
 * the result. It lives here, without them, because the build reads it too: every public
 * tool gets a static page with its own title and description (`vite-plugins/pages.ts`),
 * and a panel is a component, which the content layer may not import.
 */
export const toolInfo: ToolInfo[] = [
  {
    id: 'image',
    name: { en: 'Image converter', fr: "Convertisseur d'images" },
    description: {
      en: 'PNG, JPEG or WebP — resize, recompress, and drop the metadata',
      fr: 'PNG, JPEG ou WebP — redimensionner, recompresser, effacer les métadonnées',
    },
    keywords: ['png', 'jpeg', 'jpg', 'webp', 'resize', 'exif', 'gps', 'metadata', 'compress'],
    tier: 'client',
  },
  {
    id: 'hash',
    name: { en: 'Hash & checksum', fr: 'Hash & checksum' },
    description: {
      en: 'SHA-1, SHA-256 or SHA-512 of a text or a file',
      fr: "SHA-1, SHA-256 ou SHA-512 d'un texte ou d'un fichier",
    },
    keywords: ['sha256', 'sha1', 'sha512', 'checksum', 'digest'],
    tier: 'client',
  },
  {
    id: 'encode',
    name: { en: 'Encode & decode', fr: 'Encoder & décoder' },
    description: {
      en: 'Base64, URL encoding and hex, both ways',
      fr: 'Base64, encodage URL et hexadécimal, dans les deux sens',
    },
    keywords: ['base64', 'url', 'hex', 'percent', 'utf-8'],
    tier: 'client',
  },
  {
    id: 'json',
    name: { en: 'JSON formatter', fr: 'Formateur JSON' },
    description: {
      en: 'Pretty-print or minify, and point at the error when it is not JSON',
      fr: "Indenter ou minifier, et pointer l'erreur quand ce n'est pas du JSON",
    },
    keywords: ['json', 'format', 'pretty', 'minify', 'validate'],
    tier: 'client',
  },
  {
    id: 'colour',
    name: { en: 'Colour converter', fr: 'Convertisseur de couleurs' },
    description: {
      en: 'hex, rgb, hsl and oklch, plus WCAG contrast against the site palette',
      fr: 'hex, rgb, hsl et oklch, plus le contraste WCAG contre la palette du site',
    },
    keywords: ['color', 'hex', 'rgb', 'hsl', 'oklch', 'contrast', 'wcag'],
    tier: 'client',
  },
  {
    id: 'time',
    name: { en: 'Time converter', fr: 'Convertisseur de dates' },
    description: {
      en: 'Epoch, ISO 8601, your zone and eight others, relative time, ISO week',
      fr: 'Epoch, ISO 8601, votre fuseau et huit autres, temps relatif, semaine ISO',
    },
    keywords: ['epoch', 'unix', 'timestamp', 'iso', 'timezone', 'utc', 'date'],
    tier: 'client',
  },
  {
    id: 'password',
    name: { en: 'Password generator', fr: 'Générateur de mots de passe' },
    description: {
      en: 'Random passwords, or passphrases from the word games’ lists, with the entropy shown',
      fr: 'Mots de passe aléatoires, ou phrases secrètes tirées des listes des jeux, entropie affichée',
    },
    keywords: ['password', 'passphrase', 'diceware', 'random', 'entropy'],
    tier: 'client',
  },
  {
    id: 'text',
    name: { en: 'Text tools', fr: 'Outils texte' },
    description: {
      en: 'Word, character and line counts, reading time, and every case conversion',
      fr: 'Comptage de mots, caractères et lignes, temps de lecture, et toutes les casses',
    },
    keywords: ['count', 'words', 'characters', 'case', 'camel', 'snake', 'slug', 'reading time'],
    tier: 'client',
  },
  {
    id: 'jwt',
    name: { en: 'JWT decoder', fr: 'Décodeur JWT' },
    description: {
      en: 'Header, payload and the expiry as dates — decoded, never verified, never asks for a secret',
      fr: 'En-tête, charge utile et expiration en dates — décodé, jamais vérifié, ne demande aucun secret',
    },
    keywords: ['jwt', 'token', 'jws', 'bearer', 'exp', 'claims', 'oauth'],
    tier: 'client',
  },
  {
    id: 'regex',
    name: { en: 'Regex tester', fr: 'Testeur de regex' },
    description: {
      en: 'Matches and groups highlighted as you type, in a worker that gives up after a second',
      fr: 'Correspondances et groupes surlignés à la frappe, dans un worker qui abandonne après une seconde',
    },
    keywords: ['regex', 'regexp', 'pattern', 'match', 'groups', 'javascript'],
    tier: 'client',
  },
  {
    id: 'cron',
    name: { en: 'Cron explainer', fr: 'Explication cron' },
    description: {
      en: 'A cron expression as a sentence, and its next five runs in your time zone',
      fr: 'Une expression cron en une phrase, et ses cinq prochaines exécutions dans votre fuseau',
    },
    keywords: ['cron', 'crontab', 'schedule', 'systemd', 'timer', 'next run'],
    tier: 'client',
  },
  {
    id: 'qr',
    name: { en: 'QR code', fr: 'QR code' },
    description: {
      en: 'Text or a URL as a QR code, as PNG or SVG — encoded here, from the standard',
      fr: 'Du texte ou une URL en QR code, en PNG ou SVG — encodé ici, d’après la norme',
    },
    keywords: ['qr', 'qrcode', 'barcode', 'png', 'svg', 'url'],
    tier: 'client',
  },
  {
    id: 'diff',
    name: { en: 'Text diff', fr: 'Diff de texte' },
    description: {
      en: 'Two texts and a unified diff, from the same code as the terminal’s `diff`',
      fr: 'Deux textes et un diff unifié, avec le même code que le `diff` du terminal',
    },
    keywords: ['diff', 'compare', 'unified', 'patch', 'changes'],
    tier: 'client',
  },
  {
    id: 'acid',
    name: { en: 'Acid sequencer', fr: 'Séquenceur acid' },
    description: {
      en: 'A 16-step TB-303-style bassline in plain Web Audio, saved in its own link',
      fr: 'Une ligne de basse façon TB-303 en 16 pas, en Web Audio pur, enregistrée dans son propre lien',
    },
    keywords: ['303', 'tb-303', 'sequencer', 'synth', 'bassline', 'web audio', 'music', 'phrygian'],
    tier: 'client',
  },
  {
    id: 'fingerprint',
    name: { en: 'Browser fingerprint', fr: 'Empreinte du navigateur' },
    description: {
      en: 'What any page can read about your browser without asking, and what each value is for. Read here, sent nowhere',
      fr: 'Ce que toute page peut lire de votre navigateur sans rien demander, et à quoi sert chaque valeur. Lu ici, envoyé nulle part',
    },
    keywords: ['fingerprint', 'privacy', 'tracking', 'user agent', 'client hints', 'webgl', 'canvas', 'audio'],
    tier: 'client',
  },
  {
    id: 'ffmpeg',
    name: { en: 'Audio & video converter', fr: 'Convertisseur audio & vidéo' },
    description: {
      en: 'mp3, m4a, ogg, wav, flac, mp4 or gif; trim; extract audio without re-encoding. ffmpeg in WebAssembly, 32 MB on first use',
      fr: "mp3, m4a, ogg, wav, flac, mp4 ou gif ; découper ; extraire l'audio sans ré-encoder. ffmpeg en WebAssembly, 32 Mo au premier usage",
    },
    keywords: ['convert', 'mp3', 'mp4', 'audio', 'video', 'trim', 'cut', 'gif', 'wav', 'extract'],
    tier: 'wasm',
  },
  {
    id: 'download',
    name: { en: 'Downloader', fr: 'Téléchargeur' },
    description: {
      en: 'One YouTube video or SoundCloud track as mp3, fetched by the server and handed over once. Owner only',
      fr: 'Une vidéo YouTube ou un morceau SoundCloud en mp3, récupéré par le serveur et remis une fois. Propriétaire uniquement',
    },
    keywords: ['yt-dlp', 'youtube', 'soundcloud', 'mp3', 'download', 'admin'],
    tier: 'admin',
  },
]
