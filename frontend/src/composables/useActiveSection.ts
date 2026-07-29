import { ref } from 'vue'
import { sectionIds } from '@/content'

/** Tracked by the navbar's scroll listener; read by the terminal's `pwd`. */
export const activeSection = ref<string>('about')

export function scrollToSection(id: string): boolean {
  const el = document.getElementById(id)
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth' })
  activeSection.value = id
  return true
}

/**
 * Best-effort current section for `pwd`, in case the terminal is opened before the
 * navbar's scroll listener has fired once.
 */
export function currentSection(): string {
  for (const id of [...sectionIds].reverse()) {
    const el = document.getElementById(id)
    if (el && window.scrollY >= el.offsetTop - 120) return id
  }
  return sectionIds[0] ?? 'about'
}
