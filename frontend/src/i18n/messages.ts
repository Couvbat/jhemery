import type { Localised } from '@/content/types'

/**
 * UI chrome strings — labels, buttons, statuses. Page *content* lives in `src/content`;
 * this file is only for the shell around it.
 */
export const messages = {
  nav: {
    toggleMenu: { en: 'Toggle menu', fr: 'Ouvrir le menu' },
    language: { en: 'Switch language', fr: 'Changer de langue' },
  },
  hero: {
    aboutFile: { en: 'cat about.txt', fr: 'cat about.txt' },
    skills: { en: 'ls skills/', fr: 'ls skills/' },
  },
  projects: {
    recentActivity: { en: 'git log --oneline', fr: 'git log --oneline' },
    contributions: { en: 'contributions — last year', fr: 'contributions — 12 derniers mois' },
    less: { en: 'less', fr: 'moins' },
    more: { en: 'more', fr: 'plus' },
    justNow: { en: 'just now', fr: "à l'instant" },
    noDescription: { en: 'No description provided.', fr: 'Aucune description fournie.' },
  },
  build: {
    title: { en: 'gh run list', fr: 'gh run list' },
    running: { en: 'running', fr: 'en cours' },
    queued: { en: 'queued', fr: 'en attente' },
    success: { en: 'passed', fr: 'réussi' },
    failure: { en: 'failed', fr: 'échoué' },
    cancelled: { en: 'cancelled', fr: 'annulé' },
    unknown: { en: 'unknown', fr: 'inconnu' },
  },
  guestbookTicker: {
    signed: { en: 'just signed the guestbook', fr: "vient de signer le livre d'or" },
    read: { en: 'run `guestbook` to read it', fr: 'tapez `guestbook` pour le lire' },
  },
  music: {
    genres: { en: 'Genres', fr: 'Genres' },
    tools: { en: 'Tools', fr: 'Outils' },
    listen: { en: 'Listen on SoundCloud', fr: 'Écouter sur SoundCloud' },
  },
  gaming: {
    favouriteGenres: { en: 'Favourite genres', fr: 'Genres préférés' },
    platforms: { en: 'Platforms', fr: 'Plateformes' },
    liveFromSteam: { en: 'Live from Steam:', fr: 'En direct de Steam :' },
    recentLog: { en: 'Recent activity log:', fr: "Journal d'activité récent :" },
    inGame: { en: 'in-game', fr: 'en jeu' },
    viewProfile: { en: 'view full steam profile ↗', fr: 'voir le profil steam complet ↗' },
  },
  hardware: {
    pcs: { en: 'PCs', fr: 'PCs' },
    nas: { en: 'NAS', fr: 'NAS' },
    peripherals: { en: 'Peripherals', fr: 'Périphériques' },
  },
  contact: {
    // Rendered as `--<flag>` in the terminal-styled form — kept in English in both
    // locales, like every other fake command/file name in the UI.
    name: { en: 'name', fr: 'name' },
    email: { en: 'email', fr: 'email' },
    subject: { en: 'subject', fr: 'subject' },
    message: { en: 'message', fr: 'message' },
    namePlaceholder: { en: 'Jules', fr: 'Jules' },
    emailPlaceholder: { en: 'you@example.com', fr: 'vous@exemple.com' },
    subjectPlaceholder: { en: 'Hello there', fr: 'Bonjour' },
    messagePlaceholder: { en: 'Your message...', fr: 'Votre message...' },
    send: { en: '$ send --message', fr: '$ send --message' },
    sending: { en: 'Sending…', fr: 'Envoi…' },
    success: {
      en: "✓ Message sent! I'll get back to you shortly.",
      fr: '✓ Message envoyé ! Je reviens vers vous rapidement.',
    },
    error: {
      en: 'Failed to send message. Please try again or reach out directly by email.',
      fr: "Échec de l'envoi. Réessayez ou contactez-moi directement par email.",
    },
    directLine: { en: 'Prefer a direct line? Find me here:', fr: 'Vous préférez le contact direct ?' },
  },
  terminal: {
    open: { en: 'Open terminal', fr: 'Ouvrir le terminal' },
    close: { en: 'Close terminal', fr: 'Fermer le terminal' },
    maximise: { en: 'Maximise', fr: 'Agrandir' },
    minimise: { en: 'Minimise', fr: 'Réduire' },
    title: { en: 'terminal', fr: 'terminal' },
    inputLabel: { en: 'Terminal input', fr: 'Entrée du terminal' },
    hint: {
      en: "Type `help` to get started. Press Esc to close.",
      fr: 'Tapez `help` pour commencer. Échap pour fermer.',
    },
    welcome: {
      en: 'Welcome aboard. Some commands are not in `help` — go find them.',
      fr: "Bienvenue. Certaines commandes ne sont pas dans `help` — à vous de les trouver.",
    },
    notFound: {
      en: 'command not found',
      fr: 'commande introuvable',
    },
    didYouMean: { en: 'did you mean', fr: 'vouliez-vous dire' },
    // Shown instead of a typo suggestion when the input reads as a sentence.
    askInstead: { en: 'that reads like a question — try', fr: 'on dirait une question — essayez' },
    playing: {
      en: '-- playing: arrows/wasd · q or ctrl+c to quit --',
      fr: '-- en jeu : flèches/wasd · q ou ctrl+c pour quitter --',
    },
    cancelled: { en: '^C cancelled', fr: '^C annulé' },
  },
  // Chrome around `ask` only. The *answer* is generated in the requested locale
  // by the model itself and is never translated client-side.
  ask: {
    question: { en: 'what do you want to know?', fr: 'que voulez-vous savoir ?' },
    thinking: { en: 'thinking…', fr: 'réflexion…' },
    // Non-negotiable, and always the first line: a model paraphrasing someone's
    // CV in the first person without a label is a small lie.
    disclaimer: {
      en: 'a local model wrote this and it can be wrong — for the real answer, `mail`.',
      fr: 'un modèle local a écrit ceci et il peut se tromper — pour la vraie réponse, `mail`.',
    },
    asleep: {
      en: 'the model runs on a machine in my flat and it is currently asleep.',
      fr: 'le modèle tourne sur une machine dans mon appart, et il dort en ce moment.',
    },
    asleepHint: {
      en: 'try `mail` — that one reaches the human.',
      fr: 'essayez `mail` — celui-là atteint l’humain.',
    },
    busy: {
      en: 'one question at a time — the model lives in a flat, not a datacentre.',
      fr: 'une question à la fois — le modèle vit dans un appart, pas dans un datacentre.',
    },
  },
  palette: {
    placeholder: { en: 'Type a command or search…', fr: 'Tapez une commande ou cherchez…' },
    empty: { en: 'No matching command', fr: 'Aucune commande correspondante' },
    hint: { en: '↑↓ navigate · ↵ run · esc close', fr: '↑↓ naviguer · ↵ lancer · échap fermer' },
    open: { en: 'Command palette', fr: 'Palette de commandes' },
  },
  notFound: {
    back: { en: 'cd ~', fr: 'cd ~' },
    hint: {
      en: 'Or open the terminal and type `cd about`.',
      fr: 'Ou ouvrez le terminal et tapez `cd about`.',
    },
  },
  footer: {
    built: { en: 'built', fr: 'build' },
    source: { en: 'source', fr: 'source' },
    nominal: { en: 'all systems nominal', fr: 'tous les systèmes sont nominaux' },
    status: { en: 'Site status', fr: 'État du site' },
    // `{n}` is substituted by the caller — the count is aggregate, and there is
    // never anything to say about who the others are.
    online: { en: '{n} here now', fr: '{n} personnes ici' },
    onlineOne: { en: 'just you here', fr: 'vous seul ici' },
  },
  boot: {
    skip: { en: 'press any key to skip', fr: 'appuyez sur une touche pour passer' },
  },
  achievements: {
    title: { en: 'Achievements', fr: 'Succès' },
    open: { en: 'View achievements', fr: 'Voir les succès' },
    close: { en: 'Close achievements', fr: 'Fermer les succès' },
    toastPrefix: { en: 'Achievement unlocked:', fr: 'Succès débloqué :' },
  },
} satisfies Record<string, Record<string, Localised>>
