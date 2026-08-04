import type { Locale, Localised } from '@/content/types'

export type Tone =
  | 'default'
  | 'muted'
  | 'primary'
  | 'accent'
  | 'secondary'
  | 'error'
  | 'success'
  | 'warning'

/**
 * Terminal output is a list of plain-text lines, never HTML. Commands can render
 * user-supplied data (guestbook entries) so there is deliberately no escape hatch
 * for markup.
 */
export interface OutputLine {
  text: string
  tone?: Tone
  /** Renders the line as a link. */
  href?: string
  /** Preserves runs of spaces — used by ASCII art and tables. */
  pre?: boolean
  /** Echoed prompt line rather than command output. */
  prompt?: boolean
}

export type CommandGroup = 'core' | 'navigate' | 'content' | 'live' | 'fun'

export interface CommandContext {
  /** Arguments after the command name, already split on whitespace. */
  args: string[]
  /** The full raw line the user submitted. */
  raw: string
  locale: Locale
  t: <T>(value: Localised<T>) => T
  /** Append lines to the buffer. Useful for commands that emit progressively. */
  print: (lines: OutputLine | OutputLine[] | string) => void
  /**
   * Opens a redrawable region at the end of the buffer and returns its draw
   * function. Each call replaces the lines the previous one wrote instead of
   * appending, so an animation shows one moving thing rather than a stack of
   * stills. Anything printed after the last draw lands below the region.
   */
  frame: () => (lines: OutputLine[]) => void
  clear: () => void
  /** Closes the overlay. */
  close: () => void
  /** Scrolls to a section and closes the overlay. Returns false if the id is unknown. */
  navigate: (sectionId: string) => boolean
  /** Ask the user for a line of input. Rejects if they hit Ctrl+C. */
  prompt: (question: string, options?: { mask?: boolean }) => Promise<string>
  /** Runs another command as if typed — used by aliases like `git log`. */
  run: (input: string) => Promise<void>
  effects: TerminalEffects
  signal: AbortSignal
}

export interface VimCursor {
  row: number
  col: number
}

export type VimMode = 'normal' | 'insert'

export interface VimBufferState {
  name: string
  lines: string[]
  cursor: VimCursor
  mode: VimMode
  dirty: boolean
  /** A refused `:q`/`:wq` shows its error here — VimPane is the only visible
   *  surface while it's open, so the terminal's own scrollback won't do. */
  statusMessage: string | null
}

export interface VimFile {
  name: string
  lines: string[]
}

export interface TerminalEffects {
  matrix: () => void
  crt: (enabled?: boolean) => boolean
  vim: (enabled: boolean, file?: VimFile) => void
  vimIsDirty: () => boolean
  /** Shows a status-line message in the vim pane (e.g. a refused `:q`). */
  vimMessage: (text: string) => void
  glitch: (durationMs: number) => Promise<void>
  playMusic: () => void
}

export interface Command {
  name: string
  aliases?: string[]
  usage?: string
  description: Localised<string>
  group: CommandGroup
  /** Excluded from `help` and tab-completion, but still runnable. */
  hidden?: boolean
  /** Surfaced in the Ctrl+K command palette. */
  palette?: boolean
  run: (ctx: CommandContext) => OutputLine[] | void | Promise<OutputLine[] | void>
}
