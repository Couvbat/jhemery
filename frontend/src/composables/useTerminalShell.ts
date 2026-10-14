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

/** Set by a `?run=` link (`useRunLink.ts`). Kept apart from `pendingInitialCommand`
 *  because it is not trusted the same way: the palette and the 404 page are this
 *  site's own buttons, while a link was written by someone else, so the shell checks
 *  that the command opted in before running it. */
export const pendingLinkCommand = ref<string | null>(null)

/** True while a running command holds the keyboard. Written by `useTerminal`, read by
 *  the eager screensaver, which must not start in the middle of a game — hence here,
 *  in the registry-free module, rather than in the terminal's own chunk. */
export const terminalCapturing = ref(false)

/**
 * The width from which the overlay has a prompt (features-spec §9). Below it the overlay
 * opens in its touch layout: buttons where the prompt would be, because a fixed input
 * fights a phone's virtual keyboard badly enough that no input beats a broken one.
 */
export const DESKTOP_QUERY = '(min-width: 768px)'

/**
 * Whether the overlay is in its touch layout. Written by `TerminalOverlay` from
 * `DESKTOP_QUERY`, and read by the shell, which then runs every stage with `tty: false`:
 * nobody can type, so a command that wants the keyboard degrades as it does on the left
 * of a pipe. Here rather than in the terminal's chunk so `tour` and the games can read it
 * without importing the shell that runs them.
 */
export const touchLayout = ref(false)

/** Whether this screen gets the touch layout, read now: for the eager callers that open it. */
export function touchViewport(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia(DESKTOP_QUERY).matches
}

export function openTerminalFromLink(input: string) {
  terminalOpen.value = true
  pendingLinkCommand.value = input
}

/** Instant and registry-free — just flips the boolean so `TerminalOverlay`
 *  starts mounting (and loading its chunk) behind the scenes. Below `md` the line goes
 *  the way a link's does: there is no prompt to answer a question at or keyboard for a
 *  game, so it runs only if a tap could have run it (the palette, the guestbook toast). */
export function openTerminal(initialCommand?: string) {
  terminalOpen.value = true
  if (!initialCommand) return
  if (touchViewport()) pendingLinkCommand.value = initialCommand
  else pendingInitialCommand.value = initialCommand
}

/** Refuses while a vim trap is active. Returns whether it actually closed. */
export function closeTerminal(): boolean {
  if (terminalTrapped.value) return false
  terminalOpen.value = false
  return true
}
