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

/**
 * A top-level destination — a face of the prism (see
 * superpowers/specs/2026-09-22-tools-and-views-design.md). Sections are anchors inside
 * `home`; a view is a route of its own.
 */
export interface ViewMeta {
  id: string
  /** The route path: `/`, `/tools`. */
  path: string
  /** What the navbar and `ls` print, as a directory name. */
  label: Localised
  /** The fake shell command shown above the view's heading. */
  prompt: string
  heading: Localised
}

export interface GameEntry {
  name: string
  status: Localised
}

/** One place a skill is actually used, so the claim can be checked. */
export interface SkillEvidence {
  what: Localised
  /** A path `goTo()` accepts (`tools/ffmpeg`, `watch`, `projects`) or an `https:` URL. */
  where: string
}

export interface Skill {
  /** A technology name — a proper noun, never translated. */
  name: string
  usedIn?: SkillEvidence[]
}

/** Whether an evidence link leaves the site, or is a path inside it. */
export function isExternal(where: string): boolean {
  return /^https?:\/\//.test(where)
}

export interface Availability {
  /** The fact the footer and `neofetch` branch on. */
  open: boolean
  note: Localised
}

export type NowCategory = 'building' | 'playing' | 'learning' | 'listening'

export interface NowEntry {
  category: NowCategory
  text: Localised
}

/** Resolve a localised value, falling back to English when a translation is missing. */
export function pick<T>(value: Localised<T>, locale: Locale): T {
  return value[locale] ?? value.en
}
