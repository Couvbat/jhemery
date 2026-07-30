import { ref } from 'vue'
import type { Localised } from '@/content/types'
import { blank, line } from './format'
import type { OutputLine } from './types'

export interface Achievement {
  id: string
  title: Localised<string>
  description: Localised<string>
}

const COMPLETIONIST = 'completionist'

/** Every achievement, in the order `achievements` prints them. */
export const achievementList: Achievement[] = [
  {
    id: 'secret',
    title: { en: 'Read the Manual', fr: 'A lu le manuel' },
    description: { en: '`ls -a` then `cat .secret`.', fr: '`ls -a` puis `cat .secret`.' },
  },
  {
    id: 'explorer',
    title: { en: 'Grand Tour', fr: 'Grand tour' },
    description: { en: '`cd` into every section.', fr: '`cd` dans chaque section.' },
  },
  {
    id: 'sign',
    title: { en: 'Kilroy Was Here', fr: 'Kilroy est passé ici' },
    description: { en: 'Signed the guestbook.', fr: 'Signé le livre d’or.' },
  },
  {
    id: 'mail',
    title: { en: "You've Got Mail", fr: 'Vous avez un message' },
    description: { en: 'Sent a message with `mail`.', fr: 'Envoyé un message avec `mail`.' },
  },
  {
    id: 'lang',
    title: { en: 'Bilingual', fr: 'Bilingue' },
    description: { en: 'Switched language with `lang`.', fr: 'Changé de langue avec `lang`.' },
  },
  {
    id: 'sudo',
    title: { en: 'Script Kiddie', fr: 'Script kiddie' },
    description: { en: 'Ran `sudo rm -rf /`.', fr: 'Lancé `sudo rm -rf /`.' },
  },
  {
    id: 'vim',
    title: { en: 'Vi Improved', fr: 'Vi amélioré' },
    description: { en: 'Escaped vim with `:q!`.', fr: 'Échappé de vim avec `:q!`.' },
  },
  {
    id: 'matrix',
    title: { en: 'Red Pill', fr: 'Pilule rouge' },
    description: { en: 'Followed the white rabbit.', fr: 'Suivi le lapin blanc.' },
  },
  {
    id: 'hack',
    title: { en: '1337 h4x0r', fr: '1337 h4x0r' },
    description: { en: 'Tried to `hack` the mainframe.', fr: 'Tenté de `hack` le mainframe.' },
  },
  {
    id: 'cowsay',
    title: { en: 'Bovine Wisdom', fr: 'Sagesse bovine' },
    description: { en: 'Asked a cow for advice.', fr: 'Demandé conseil à une vache.' },
  },
  {
    id: 'fortune',
    title: { en: 'Fortune Cookie', fr: 'Biscuit chinois' },
    description: { en: 'Requested a `fortune`.', fr: 'Demandé une `fortune`.' },
  },
  {
    id: 'sl',
    title: { en: 'Choo Choo', fr: 'Tchou tchou' },
    description: { en: 'Typo\'d `ls` into `sl`.', fr: 'Tapé `sl` au lieu de `ls`.' },
  },
  {
    id: 'coffee',
    title: { en: "I'm a Teapot", fr: 'Je suis une théière' },
    description: { en: 'Tried to `coffee`.', fr: 'Tenté un `coffee`.' },
  },
  {
    id: 'rickroll',
    title: { en: 'Never Gonna', fr: 'Never Gonna' },
    description: { en: 'Clicked through a `rickroll`.', fr: 'Cliqué sur un `rickroll`.' },
  },
  {
    id: 'crt',
    title: { en: 'CRT Overdrive', fr: 'Surtension CRT' },
    description: { en: 'Toggled `crt` mode.', fr: 'Activé le mode `crt`.' },
  },
  {
    id: 'htop',
    title: { en: 'Task Manager', fr: 'Gestionnaire de tâches' },
    description: { en: 'Watched `htop`.', fr: 'Surveillé `htop`.' },
  },
  {
    id: 'konami',
    title: { en: 'Cheat Code', fr: 'Code de triche' },
    description: {
      en: 'Entered the Konami code — not even in the terminal.',
      fr: 'Entré le code Konami — même pas dans le terminal.',
    },
  },
  {
    id: COMPLETIONIST,
    title: { en: '100%', fr: '100%' },
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

const unlocked = ref<Set<string>>(loadSet(ACHIEVEMENTS_KEY))
const visitedSections = ref<Set<string>>(loadSet(SECTIONS_KEY))

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
