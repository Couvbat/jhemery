/**
 * Shared content types.
 *
 * Everything under `src/content` must stay dependency-free — no Vue, no `@` alias,
 * no side effects. `vite.config.ts` imports these modules at build time to generate
 * `resume.txt`, and that runs outside the app's module graph.
 */

export type Locale = 'en' | 'fr'

/** A value that differs per locale. Facts (specs, URLs, tech names) stay plain. */
export interface Localised<T = string> {
  en: T
  fr: T
}

export type ProjectStatus = 'production' | 'wip' | 'archived'

export interface Project {
  name: string
  description: Localised
  stack: string[]
  repo?: string
  live?: string
  status: ProjectStatus
}

export type MachineCategory = 'pc' | 'nas'

export interface Spec {
  key: string
  value: string
}

export interface Machine {
  name: string
  category: MachineCategory
  os: string
  specs: Spec[]
}

export interface SocialLink {
  label: string
  handle: string
  href: string
  /** Keyword accepted by the terminal `open` command. */
  keyword: string
}

export interface SectionMeta {
  id: string
  label: Localised
  /** The fake shell command shown above the section heading. */
  prompt: string
  heading: Localised
}

export interface GameEntry {
  name: string
  status: Localised
}

/** Resolve a localised value, falling back to English when a translation is missing. */
export function pick<T>(value: Localised<T>, locale: Locale): T {
  return value[locale] ?? value.en
}
