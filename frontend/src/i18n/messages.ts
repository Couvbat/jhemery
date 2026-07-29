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
    aboutFile: { en: 'cat about.txt', fr: 'cat a-propos.txt' },
    skills: { en: 'ls skills/', fr: 'ls competences/' },
  },
  projects: {
    recentActivity: { en: 'git log --oneline', fr: 'git log --oneline' },
    contributions: { en: 'contributions — last year', fr: 'contributions — 12 derniers mois' },
    less: { en: 'less', fr: 'moins' },
    more: { en: 'more', fr: 'plus' },
    justNow: { en: 'just now', fr: "à l'instant" },
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
    name: { en: 'name', fr: 'nom' },
    email: { en: 'email', fr: 'email' },
    subject: { en: 'subject', fr: 'sujet' },
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
    restore: { en: 'Restore', fr: 'Réduire' },
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
    cancelled: { en: '^C cancelled', fr: '^C annulé' },
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
  },
  boot: {
    skip: { en: 'press any key to skip', fr: 'appuyez sur une touche pour passer' },
  },
} satisfies Record<string, Record<string, Localised>>
