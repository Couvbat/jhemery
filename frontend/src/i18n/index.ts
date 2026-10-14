import { computed, ref } from 'vue'
import { LANG_PARAM, pick, type Locale, type Localised } from '@/content/types'
import { messages } from './messages'

const STORAGE_KEY = 'couvbat:locale'
const LOCALES: Locale[] = ['en', 'fr']

function isLocale(value: string | null): value is Locale {
  return value !== null && (LOCALES as string[]).includes(value)
}

// Read while this module loads, so it must not throw: a browser that blocks site data
// throws on the `localStorage` getter itself, and an unguarded read here failed the
// import of everything that shows text, leaving a blank page.
function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStored(next: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Blocked storage: switched for this page load, the browser's language after a reload.
  }
}

/**
 * `?lang=fr` in the address is the French URL of a page (`content/pages.ts`): what a
 * French search result or the `hreflang` alternates link to. It wins over the stored
 * choice, and becomes it, so the visitor who arrived in French stays in French after a
 * reload. `usePageMeta` takes it out of the address once the visitor switches language.
 */
function askedInAddress(): Locale | null {
  const asked = new URLSearchParams(window.location.search).get(LANG_PARAM)
  return isLocale(asked) ? asked : null
}

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  const asked = askedInAddress()
  if (asked) {
    writeStored(asked)
    return asked
  }
  const stored = readStored()
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
    writeStored(next)
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
