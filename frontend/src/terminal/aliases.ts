import { ref } from 'vue'

const STORAGE_KEY = 'couvbat:aliases'
/** Enough for a chain like `a`→`b`→`c`; past this the definition is a loop. */
const MAX_EXPANSIONS = 10

function load(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

function persist(value: Record<string, string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Private browsing or a full quota — aliases just won't survive a reload.
  }
}

/** Shared by the `alias` command and the shell's expansion step. */
export const aliases = ref<Record<string, string>>(load())

export function setAlias(name: string, value: string) {
  aliases.value = { ...aliases.value, [name]: value }
  persist(aliases.value)
}

export function removeAlias(name: string): boolean {
  if (!(name in aliases.value)) return false
  const next = { ...aliases.value }
  delete next[name]
  aliases.value = next
  persist(next)
  return true
}

export function clearAliases() {
  aliases.value = {}
  persist({})
}

/** `alias gl='git log'` — quotes optional, `=` or a space both work. */
export function parseDefinition(raw: string): { name: string; value: string } | undefined {
  const match = /^(\S+?)\s*=\s*(.+)$/.exec(raw) ?? /^(\S+)\s+(.+)$/.exec(raw)
  if (!match) return undefined

  const name = match[1]!.trim()
  const value = match[2]!.trim().replace(/^(['"])(.*)\1$/, '$2').trim()
  if (!name || !value) return undefined
  return { name, value }
}

/**
 * Rewrites the first word of `input` if it names an alias, repeatedly, so
 * `a`→`b`→`ls -a` resolves in one call. Anything after the first word is kept
 * and appended, which is what makes `gl --oneline` work when `gl` is `git log`.
 *
 * A word `isCommand` recognises is left alone, given the word after it too, so an
 * alias named `git` can't hide `git log`. `alias` refuses a command's name, but
 * that check runs once, when the alias is defined: a command added in a later release
 * (`tour`, `why`, `grep`…) can share the name of an alias someone stored before it
 * existed, and the command wins. The predicate comes from the shell because this module
 * importing the registry would join the registry's import cycle.
 *
 * Bails out rather than looping forever: a definition that expands back to
 * itself is a user error, not a reason to hang the tab.
 */
export function expandAliases(
  input: string,
  isCommand: (name: string, next?: string) => boolean = () => false,
): string {
  let current = input.trim()
  const seen = new Set<string>()

  for (let i = 0; i < MAX_EXPANSIONS; i++) {
    const [head = '', ...rest] = current.split(/\s+/)
    const replacement = aliases.value[head.toLowerCase()]
    if (replacement === undefined || seen.has(head.toLowerCase()) || isCommand(head, rest[0])) return current

    seen.add(head.toLowerCase())
    current = [replacement, ...rest].join(' ').trim()
  }
  return current
}
