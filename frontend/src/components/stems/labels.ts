import type { Localised } from '@/content/types'

/**
 * The mixer's words. Here rather than in `i18n/messages.ts`, which the home page loads
 * whole: the home page is at its byte budget, and these are only read once the mixer's
 * own chunk is, which is never while `content/stems.ts` is empty. `{name}` is a stem's,
 * `{size}` a download's, `{n}` a percentage.
 */
export const stemsLabels = {
  heading: { en: 'Remix it', fr: 'Remixez-le' },
  track: { en: 'Track', fr: 'Morceau' },
  load: { en: 'load the stems ({size})', fr: 'charger les pistes ({size})' },
  loading: { en: 'loading… {n}%', fr: 'chargement… {n} %' },
  play: { en: 'play', fr: 'lecture' },
  pause: { en: 'pause', fr: 'pause' },
  mute: { en: 'Mute {name}', fr: 'Couper {name}' },
  solo: { en: 'Solo {name}', fr: 'Isoler {name}' },
  level: { en: 'Level of {name}', fr: 'Niveau de {name}' },
  filter: { en: 'filter', fr: 'filtre' },
  position: { en: 'Position in the excerpt', fr: 'Position dans l’extrait' },
  chain: { en: 'chain', fr: 'chaîne' },
  reset: { en: 'reset', fr: 'réinitialiser' },
  copy: { en: 'copy this mix as a link', fr: 'copier ce mix en lien' },
  copied: { en: 'link copied', fr: 'lien copié' },
  fromLink: { en: 'A mix from a link: load the stems, then play.', fr: 'Un mix venu d’un lien : chargez les pistes, puis lancez.' },
  badLink: {
    en: 'That mix link doesn’t fit any track here, so the mix starts flat.',
    fr: 'Ce lien de mix ne correspond à aucun morceau ici : le mix repart à plat.',
  },
  noAudio: { en: 'This browser can’t play Web Audio.', fr: 'Ce navigateur ne sait pas lire le Web Audio.' },
  failed: { en: 'The stems didn’t load. Try again?', fr: 'Les pistes ne se sont pas chargées. Réessayer ?' },
  hidden: { en: 'Stopped: the tab went to the background.', fr: 'Arrêté : l’onglet est passé en arrière-plan.' },
} satisfies Record<string, Localised>
