import { computed, ref } from 'vue'
import type { Locale, Localised } from '@/content/types'
import { pick } from '@/content/types'
import { messages } from './messages'

const STORAGE_KEY = 'couvbat:locale'
const LOCALES: Locale[] = ['en', 'fr']

function isLocale(value: string | null): value is Locale {
  return value !== null && (LOCALES as string[]).includes(value)
}

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (isLocale(stored)) return stored
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

// Module-level so every caller shares one reactive locale rather than isolated copies.
const locale = ref<Locale>(detectInitialLocale())

if (typeof document !== 'undefined') {
  document.documentElement.lang = locale.value
}

export function setLocale(next: Locale) {
  locale.value = next
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, next)
    document.documentElement.lang = next
  }
}

export function toggleLocale() {
  setLocale(locale.value === 'en' ? 'fr' : 'en')
}

export function useLocale() {
  /** Resolve a `Localised` value in the current locale. */
  function t<T>(value: Localised<T>): T {
    return pick(value, locale.value)
  }

  return {
    locale: computed(() => locale.value),
    t,
    m: messages,
    setLocale,
    toggleLocale,
    locales: LOCALES,
  }
}

/** Non-reactive read, for the few call sites outside a component's setup. */
export function currentLocale(): Locale {
  return locale.value
}
