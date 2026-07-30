import { ref } from 'vue'

/**
 * Whether the terminal overlay is mounted, and the vim-trap guard on closing it.
 * Split out from `useTerminal.ts` into their own dependency-free module so the
 * launcher button and the command palette — both eagerly loaded — can open/close
 * the terminal without pulling in the entire command registry (all commands, the
 * guestbook client, the vim editor...) just to flip a boolean. That heavy engine
 * only loads once the overlay itself is actually rendered.
 */
export const terminalOpen = ref(false)
/** While a vim trap is active, closing is refused. That is the joke. */
export const terminalTrapped = ref(false)

/** Set when something wants the terminal to run a command as soon as it mounts
 *  (the command palette, the 404 page's `help` hint). Consumed once by
 *  TerminalOverlay so it isn't re-run on a later open. */
export const pendingInitialCommand = ref<string | null>(null)

/** Instant and registry-free — just flips the boolean so `TerminalOverlay`
 *  starts mounting (and loading its chunk) behind the scenes. */
export function openTerminal(initialCommand?: string) {
  terminalOpen.value = true
  if (initialCommand) pendingInitialCommand.value = initialCommand
}

/** Refuses while a vim trap is active. Returns whether it actually closed. */
export function closeTerminal(): boolean {
  if (terminalTrapped.value) return false
  terminalOpen.value = false
  return true
}
