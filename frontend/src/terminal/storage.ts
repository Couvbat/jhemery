/**
 * The `localStorage` pair every piece of terminal progress uses — achievements, the
 * sections visited, the themes tried, the CTF chain. Moved out of `achievements.ts`
 * once the CTF became a second caller, which is where copies start to drift.
 *
 * Both ends swallow failure: private browsing or a full quota means progress simply
 * does not persist, which is never worth an error on screen.
 */

function read(key: string): unknown {
  if (typeof window === 'undefined') return undefined
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? 'null')
  } catch {
    return undefined
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing or a full quota — progress just won't persist.
  }
}

export function loadSet(key: string): Set<string> {
  const parsed = read(key)
  return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [])
}

export function persistSet(key: string, value: Set<string>): void {
  write(key, [...value])
}

/** A string→string map. Anything else stored under the key reads as empty. */
export function loadRecord(key: string): Record<string, string> {
  const parsed = read(key)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

export function persistRecord(key: string, value: Record<string, string>): void {
  write(key, value)
}
