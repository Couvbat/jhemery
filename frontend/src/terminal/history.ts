import { ref } from 'vue'

const STORAGE_KEY = 'couvbat:history'
const MAX_ENTRIES = 100

function load(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** Shared by the session composable and the `history` command. */
export const history = ref<string[]>(load())

export function pushHistory(entry: string) {
  const trimmed = entry.trim()
  if (!trimmed || history.value[history.value.length - 1] === trimmed) return

  history.value = [...history.value, trimmed].slice(-MAX_ENTRIES)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history.value))
  } catch {
    // Private browsing or a full quota — history just won't persist.
  }
}
