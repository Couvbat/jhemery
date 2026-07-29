import type { SectionMeta } from './types'

/**
 * The single list of sections. The navbar, the terminal's `ls`/`cd`/`pwd`, the command
 * palette and each section's own header all read from here.
 */
export const sections: SectionMeta[] = [
  {
    id: 'about',
    label: { en: 'about', fr: 'a-propos' },
    prompt: 'whoami',
    heading: { en: 'About', fr: 'À propos' },
  },
  {
    id: 'projects',
    label: { en: 'projects', fr: 'projets' },
    prompt: 'ls -la projects/',
    heading: { en: 'Projects', fr: 'Projets' },
  },
  {
    id: 'music',
    label: { en: 'music', fr: 'musique' },
    prompt: 'play music.flp',
    heading: { en: 'Music', fr: 'Musique' },
  },
  {
    id: 'gaming',
    label: { en: 'gaming', fr: 'gaming' },
    prompt: 'steam --launch gaming.sh',
    heading: { en: 'Gaming', fr: 'Gaming' },
  },
  {
    id: 'hardware',
    label: { en: 'hardware', fr: 'materiel' },
    prompt: 'neofetch --all',
    heading: { en: 'Hardware', fr: 'Matériel' },
  },
  {
    id: 'contact',
    label: { en: 'contact', fr: 'contact' },
    prompt: 'ssh contact@jhemery.xyz',
    heading: { en: 'Contact', fr: 'Contact' },
  },
]

export const sectionIds = sections.map((s) => s.id)

/**
 * Sections are addressable by their English id and by their localised label, so
 * `cd projets` works as well as `cd projects`.
 */
export function findSection(name: string): SectionMeta | undefined {
  const needle = name.toLowerCase().replace(/\/+$/, '')
  return sections.find(
    (s) => s.id === needle || s.label.en === needle || s.label.fr === needle,
  )
}
