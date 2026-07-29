import type { Localised } from './types'

export const music = {
  genres: ['Hardcore', 'Techno', 'Acidcore', 'Hard Techno'],
  tools: ['FL Studio', 'Ableton', 'Akai MPK mini', 'Serum 2', 'Vital', 'DR910', 'Valhalla DSP'],
  playlistUrl: 'https://soundcloud.com/couvbat/sets/mon-bruit',
  profileUrl: 'https://soundcloud.com/couvbat',
  blurb: {
    en: 'Music is my second language. I produce hardcore, techno, acidcore and other hard electronic genres. Raw kicks, distorted basslines, relentless BPMs — the same drive I put into code goes straight into every track.',
    fr: "La musique est ma seconde langue. Je produis du hardcore, de la techno, de l'acidcore et d'autres genres électroniques durs. Kicks bruts, basses saturées, BPM sans répit — la même énergie que je mets dans le code passe directement dans chaque track.",
  } satisfies Localised,
} as const

export const soundcloudEmbedSrc =
  `https://w.soundcloud.com/player/?url=${encodeURIComponent(music.playlistUrl)}` +
  '&color=%2300ff41&auto_play=false&hide_related=true&show_comments=false' +
  '&show_reposts=false&show_teaser=false&visual=false'
