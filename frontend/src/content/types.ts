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

/** A job. Months are `YYYY-MM`; an `end` left out means it is the current one. */
export interface Role {
  /** Localised so an employer can be described rather than named (see `experience.ts`). */
  employer: Localised
  title: Localised
  start: string
  end?: string
  summary?: Localised
}

/** A course. Shown by year; the months are there so the order is exact. */
export interface Education {
  school: Localised
  course: Localised
  start: string
  end: string
  note?: Localised
}

/**
 * A place in the repository's docs: a file, and a heading inside it by its GitHub
 * anchor (`githubSlug` in `./docs`). The spec stays the authority; whatever links to
 * it carries a pointer, never a copy.
 */
export interface DocRef {
  /** Repo-relative, e.g. `docs/superpowers/specs/2026-09-22-tools-and-views-design.md`. */
  doc: string
  anchor?: string
}

/** One choice the site made, and what it turned down — what `why <topic>` prints. */
export interface Decision {
  id: string
  topic: Localised
  chose: Localised
  /** Each `because` is one sentence: the spec has the long version. */
  rejected: Array<{ what: Localised; because: Localised }>
  /** The PR that shipped it. */
  pr?: number
  /** Always to a heading: the anchor is what keeps the decision tied to its spec. */
  source: Required<DocRef>
  /** What it looks like now, when that is worth saying. */
  hindsight?: Localised
}

/** A figure on a case study: a fact that doesn't drift, like a standard's limits. */
export interface WorkNumber {
  label: Localised
  /** A figure, or a localised one where it carries a word or a thousands separator. */
  value: string | Localised
}

/**
 * A short study of one of the site's own parts, at `/work/<id>`: what it is, what was
 * hard, a few numbers, and where its code and its design note are.
 */
export interface WorkPart {
  id: string
  name: Localised
  summary: Localised
  /** A few short paragraphs, the same number in each language. */
  hard: Localised<string[]>
  numbers: WorkNumber[]
  /**
   * Somewhere to see it: a path `goTo()` accepts (`tools/qr`), or a command line a link
   * could run (`why mcp-sdk`). A hidden command can't be one.
   */
  try?: string
  /** Repo-relative paths, linked at the build's commit. */
  code: string[]
  spec: Required<DocRef>
  /** `why` topics that belong to this part. */
  decisions?: string[]
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
