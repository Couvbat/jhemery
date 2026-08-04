import { ref } from 'vue'
import type { Localised } from '@/content/types'
import { blank, line } from './format'
import type { OutputLine } from './types'

export interface Achievement {
  id: string
  title: Localised<string>
  hint: Localised<string>
  description: Localised<string>
}

const COMPLETIONIST = 'completionist'

/** Every achievement, in the order `achievements` prints them. */
export const achievementList: Achievement[] = [
  {
    id: 'secret',
    title: { en: 'Read the Manual', fr: 'A lu le manuel' },
    hint: {
      en: 'Not everything shows up in a normal listing.',
      fr: 'Tout ne s’affiche pas dans une liste normale.',
    },
    description: { en: '`ls -a` then `cat .secret`.', fr: '`ls -a` puis `cat .secret`.' },
  },
  {
    id: 'explorer',
    title: { en: 'Grand Tour', fr: 'Grand tour' },
    hint: {
      en: 'Have you seen everywhere this site has to offer?',
      fr: 'Avez-vous vu tout ce que ce site a à offrir ?',
    },
    description: { en: '`cd` into every section.', fr: '`cd` dans chaque section.' },
  },
  {
    id: 'sign',
    title: { en: 'Kilroy Was Here', fr: 'Kilroy est passé ici' },
    hint: { en: 'Leave your mark somewhere public.', fr: 'Laissez votre marque quelque part de public.' },
    description: { en: 'Signed the guestbook.', fr: 'Signé le livre d’or.' },
  },
  {
    id: 'mail',
    title: { en: "You've Got Mail", fr: 'Vous avez un message' },
    hint: {
      en: 'There’s a way to reach out without leaving the terminal.',
      fr: 'Il y a un moyen de me contacter sans quitter le terminal.',
    },
    description: { en: 'Sent a message with `mail`.', fr: 'Envoyé un message avec `mail`.' },
  },
  {
    id: 'ask',
    title: { en: 'Turing Test', fr: 'Test de Turing' },
    hint: {
      en: 'There’s someone else in here to talk to.',
      fr: 'Il y a quelqu’un d’autre à qui parler ici.',
    },
    description: {
      en: 'Got an answer out of the local model.',
      fr: 'Obtenu une réponse du modèle local.',
    },
  },
  {
    id: 'lang',
    title: { en: 'Bilingual', fr: 'Bilingue' },
    hint: { en: 'This site speaks more than one language.', fr: 'Ce site parle plus d’une langue.' },
    description: { en: 'Switched language with `lang`.', fr: 'Changé de langue avec `lang`.' },
  },
  {
    id: 'sudo',
    title: { en: 'Script Kiddie', fr: 'Script kiddie' },
    hint: {
      en: 'Some commands should never be run as root.',
      fr: 'Certaines commandes ne devraient jamais être lancées en root.',
    },
    description: { en: 'Ran `sudo rm -rf /`.', fr: 'Lancé `sudo rm -rf /`.' },
  },
  {
    id: 'vim',
    title: { en: 'Vi Improved', fr: 'Vi amélioré' },
    hint: {
      en: 'Getting in is easy. Getting out is the achievement.',
      fr: 'Entrer est facile. Sortir, c’est l’exploit.',
    },
    description: { en: 'Escaped vim with `:q!`.', fr: 'Échappé de vim avec `:q!`.' },
  },
  {
    id: 'matrix',
    title: { en: 'Red Pill', fr: 'Pilule rouge' },
    hint: { en: 'There’s a red pill somewhere in here.', fr: 'Il y a une pilule rouge quelque part ici.' },
    description: { en: 'Followed the white rabbit.', fr: 'Suivi le lapin blanc.' },
  },
  {
    id: 'hack',
    title: { en: '1337 h4x0r', fr: '1337 h4x0r' },
    hint: { en: 'Some targets are worth an nmap.', fr: 'Certaines cibles méritent un bon nmap.' },
    description: { en: 'Tried to `hack` the mainframe.', fr: 'Tenté de `hack` le mainframe.' },
  },
  {
    id: 'cowsay',
    title: { en: 'Bovine Wisdom', fr: 'Sagesse bovine' },
    hint: { en: 'Ask a cow for its opinion.', fr: 'Demandez son avis à une vache.' },
    description: { en: 'Asked a cow for advice.', fr: 'Demandé conseil à une vache.' },
  },
  {
    id: 'fortune',
    title: { en: 'Fortune Cookie', fr: 'Biscuit chinois' },
    hint: {
      en: 'The terminal has opinions, if you ask nicely.',
      fr: 'Le terminal a des opinions, si on lui demande gentiment.',
    },
    description: { en: 'Requested a `fortune`.', fr: 'Demandé une `fortune`.' },
  },
  {
    id: 'sl',
    title: { en: 'Choo Choo', fr: 'Tchou tchou' },
    hint: {
      en: 'Everyone mistypes `ls` eventually.',
      fr: 'Tout le monde tape `sl` au lieu de `ls` un jour ou l’autre.',
    },
    description: { en: 'Typo\'d `ls` into `sl`.', fr: 'Tapé `sl` au lieu de `ls`.' },
  },
  {
    id: 'coffee',
    title: { en: "I'm a Teapot", fr: 'Je suis une théière' },
    hint: { en: 'Try brewing something.', fr: 'Essayez de préparer quelque chose.' },
    description: { en: 'Tried to `coffee`.', fr: 'Tenté un `coffee`.' },
  },
  {
    id: 'rickroll',
    title: { en: 'Never Gonna', fr: 'Never Gonna' },
    hint: { en: 'Curiosity killed the cat.', fr: 'La curiosité est un vilain défaut.' },
    description: { en: 'Clicked through a `rickroll`.', fr: 'Cliqué sur un `rickroll`.' },
  },
  {
    id: 'crt',
    title: { en: 'CRT Overdrive', fr: 'Surtension CRT' },
    hint: { en: 'This terminal has a retro mode.', fr: 'Ce terminal a un mode rétro.' },
    description: { en: 'Toggled `crt` mode.', fr: 'Activé le mode `crt`.' },
  },
  {
    id: 'htop',
    title: { en: 'Task Manager', fr: 'Gestionnaire de tâches' },
    hint: {
      en: 'Ever wonder what’s running under the hood?',
      fr: 'Vous êtes-vous demandé ce qui tourne sous le capot ?',
    },
    description: { en: 'Watched `htop`.', fr: 'Surveillé `htop`.' },
  },
  {
    id: 'konami',
    title: { en: 'Cheat Code', fr: 'Code de triche' },
    hint: { en: '↑↑↓↓←→←→ rings a bell?', fr: '↑↑↓↓←→←→ ça vous dit quelque chose ?' },
    description: {
      en: 'Entered the Konami code — not even in the terminal.',
      fr: 'Entré le code Konami — même pas dans le terminal.',
    },
  },
  {
    id: 'game2048',
    title: { en: 'Tile Merchant', fr: 'Marchand de tuiles' },
    hint: {
      en: 'Some tiles are worth more than others.',
      fr: 'Certaines tuiles valent plus que d’autres.',
    },
    description: { en: 'Reached a 256 tile.', fr: 'Atteint une tuile 256.' },
  },
  {
    id: 'snake',
    title: { en: 'Nokia Nostalgia', fr: 'Nostalgie Nokia' },
    hint: {
      en: 'Something in here is longer than it started.',
      fr: 'Quelque chose ici est plus long qu’au départ.',
    },
    description: { en: 'Grew a snake to length 10.', fr: 'Fait grandir un serpent jusqu’à 10.' },
  },
  {
    id: 'dotenv',
    title: { en: 'Configuration Leak', fr: 'Fuite de config' },
    hint: {
      en: 'Some files are more dangerous to read than others.',
      fr: 'Certains fichiers sont plus dangereux à lire que d’autres.',
    },
    description: { en: 'Read `.env`.', fr: 'Lu `.env`.' },
  },
  {
    id: 'reboot',
    title: { en: 'Deja Vu', fr: 'Déjà-vu' },
    hint: {
      en: 'Some sequences are worth watching twice.',
      fr: 'Certaines séquences méritent d’être revues.',
    },
    description: { en: 'Replayed the boot sequence.', fr: 'Rejoué la séquence de démarrage.' },
  },
  {
    id: 'ssh',
    title: { en: 'Knock Knock', fr: 'Toc toc' },
    hint: {
      en: 'Some doors are worth trying, even locked ones.',
      fr: 'Certaines portes méritent d’être essayées, même fermées.',
    },
    description: { en: 'Opened a shell on the host.', fr: 'Ouvert un shell sur l’hôte.' },
  },
  {
    id: 'diffsy',
    title: { en: 'Spot the Difference', fr: 'Trouvez l’erreur' },
    hint: {
      en: 'Two files, one command, and a very short attention span.',
      fr: 'Deux fichiers, une commande, et très peu de patience.',
    },
    description: { en: 'Compared two files.', fr: 'Comparé deux fichiers.' },
  },
  {
    id: COMPLETIONIST,
    title: { en: '100%', fr: '100%' },
    hint: { en: 'For those who leave no stone unturned.', fr: 'Pour ceux qui ne laissent rien au hasard.' },
    description: { en: 'Unlocked everything else.', fr: 'Tout débloqué.' },
  },
]

const ACHIEVEMENTS_KEY = 'couvbat:achievements'
const SECTIONS_KEY = 'couvbat:achievements:sections'
const knownIds = new Set(achievementList.map((a) => a.id))

function loadSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

function persist(key: string, value: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...value]))
  } catch {
    // Private browsing or a full quota — progress just won't persist.
  }
}

export const unlocked = ref<Set<string>>(loadSet(ACHIEVEMENTS_KEY))
const visitedSections = ref<Set<string>>(loadSet(SECTIONS_KEY))

/** Newly-unlocked achievements waiting to be shown as a floating toast, oldest first. */
export const toastQueue = ref<{ id: string; title: Localised<string> }[]>([])

/** Removes one entry from the toast queue once it's been shown. */
export function dismissToast(id: string) {
  toastQueue.value = toastQueue.value.filter((entry) => entry.id !== id)
}

/** Unlocks an achievement, cascading into `completionist` if it was the last one. Returns newly-unlocked ids. */
export function unlock(id: string): string[] {
  if (!knownIds.has(id) || unlocked.value.has(id)) return []

  const next = new Set(unlocked.value)
  next.add(id)
  const newly = [id]

  if (id !== COMPLETIONIST) {
    const allDone = achievementList.every((a) => a.id === COMPLETIONIST || next.has(a.id))
    if (allDone) newly.push(COMPLETIONIST)
  }
  for (const gained of newly) next.add(gained)

  unlocked.value = next
  persist(ACHIEVEMENTS_KEY, next)
  toastQueue.value = [
    ...toastQueue.value,
    ...newly.map((gained) => ({
      id: gained,
      title: achievementList.find((a) => a.id === gained)!.title,
    })),
  ]
  return newly
}

export function isUnlocked(id: string): boolean {
  return unlocked.value.has(id)
}

export function unlockedCount(): number {
  return unlocked.value.size
}

/** Marks a section as visited by `cd`; unlocks `explorer` once every section has been. */
export function visitSection(id: string, allSectionIds: readonly string[]): string[] {
  if (visitedSections.value.has(id)) return []

  const next = new Set(visitedSections.value)
  next.add(id)
  visitedSections.value = next
  persist(SECTIONS_KEY, next)

  return allSectionIds.every((sectionId) => next.has(sectionId)) ? unlock('explorer') : []
}

/** Unlocks `id` and renders a toast line for it (and any cascaded unlock) — `[]` if already unlocked. */
export function announce(id: string, t: <T>(value: Localised<T>) => T): OutputLine[] {
  return toast(unlock(id), t)
}

/** Same, for unlocks that were computed separately (e.g. `visitSection`). */
export function toast(newly: string[], t: <T>(value: Localised<T>) => T): OutputLine[] {
  if (!newly.length) return []
  return newly.flatMap((unlockedId) => {
    const achievement = achievementList.find((a) => a.id === unlockedId)!
    return [blank, line(`🏆 achievement unlocked: ${t(achievement.title)}`, 'success')]
  })
}
