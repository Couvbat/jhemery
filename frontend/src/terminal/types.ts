// Relative: `vite-plugins/resume.ts` reaches this file through `ansi.ts`, outside the alias.
import type { Locale, Localised } from '../content/types'

export type Tone =
  | 'default'
  | 'muted'
  | 'primary'
  | 'accent'
  | 'secondary'
  | 'error'
  | 'success'
  | 'warning'

/** A run of characters inside a line that carries its own tone. */
export interface OutputSegment {
  text: string
  tone?: Tone
  /**
   * A literal CSS colour, which wins over `tone`. Tones follow whatever scheme is on
   * screen, and `theme` has to preview the ones that aren't — this is for its swatches.
   * Only ever set from the theme table, never from anything a visitor typed.
   */
  colour?: string
}

/**
 * Terminal output is a list of plain-text lines, never HTML. Commands can render
 * user-supplied data (guestbook entries) so there is deliberately no escape hatch
 * for markup.
 */
export interface OutputLine {
  text: string
  tone?: Tone
  /**
   * Splits the line into differently-toned runs — a game board needs a colour per
   * cell, not per row. `text` stays the plain concatenation, so anything reading
   * the buffer as text (tests, copy/paste) is unaffected.
   */
  segments?: OutputSegment[]
  /** Renders the line as a link. */
  href?: string
  /** Preserves runs of spaces — used by ASCII art and tables. */
  pre?: boolean
  /** Echoed prompt line rather than command output. */
  prompt?: boolean
  /**
   * Not output but a remark about it, which goes to the screen even from the middle of a
   * pipeline: an error from `fail()` (which also fails the stage for `&&`/`||`), or an
   * achievement toast (which doesn't). Without it, `fortune | cowsay` would put the toast
   * inside the cow.
   */
  stderr?: boolean
}

export type CommandGroup = 'core' | 'navigate' | 'content' | 'live' | 'fun'

/**
 * What a command changes, which is what decides whether it may run without the visitor
 * typing it. `?run=` links read it today (`isLinkable`), and the roadmap's `tour`, pipe
 * stages and history expansion are meant to read this same field, so no rule keeps its
 * own list.
 *
 * - `none`: reads. It may still record the visitor's own progress (achievements, best
 *   scores, the daily board and its one anonymous report), navigate, or play an
 *   animation that leaves nothing behind.
 * - `local`: changes something the visitor would have to put back: a setting, the
 *   scene, the shell (aliases, the scrollback, the vim trap), a CTF capture. Also
 *   anything that acts outside the page (a new tab, the clipboard, sound), and printing
 *   link-supplied text as the command's output (`echo`, `banner`), which a link could
 *   use to put words in the site's mouth. Quoting an argument back in an error line
 *   doesn't count.
 * - `server`: sends anything but a GET to the API, the daily board's report aside.
 *
 * Progress has to be carved out: counting it would make every game unlinkable,
 * `?run=wordle daily` included, which `wordle share` itself hands out.
 */
export type Writes = 'none' | 'local' | 'server'

export interface CommandContext {
  /** Arguments after the command name, already split on whitespace. */
  args: string[]
  /** This command's own stage of the line, as typed: its spacing and quotes, not the rest of a pipeline. */
  raw: string
  /**
   * The previous stage's output, when this command is on the right of a `|`: its lines,
   * colours and all, without the stderr ones. Undefined otherwise, which is not the same
   * as an empty pipe.
   */
  stdin?: OutputLine[]
  /**
   * Whether anyone is reading this output as it appears: false on the left of a `|`,
   * where `capture` and `prompt` throw ("not a tty"). A command that needs the keyboard
   * can say so before it starts rather than fail halfway.
   */
  tty: boolean
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
  /**
   * Goes wherever `target` names — a section, a view or a tool, anything `cd`
   * accepts — and closes the overlay on success. Returns false for an unknown target.
   */
  navigate: (target: string) => boolean
  /** Ask the user for a line of input. Rejects if they hit Ctrl+C, and throws when `tty` is false. */
  prompt: (question: string, options?: { mask?: boolean }) => Promise<string>
  /**
   * Routes raw keys to `handler` while the command runs — the primitive the games
   * need to hold the keyboard for longer than one line. Returns a release
   * function; the release also happens automatically when the command settles,
   * so a command that throws cannot wedge the keyboard. For a command run through
   * `ctx.run`, "settles" means when it returns: the caller's own capture comes back. Only one capture is
   * active at a time: a second call replaces the first. Modifier combos never
   * reach the handler, so `Ctrl+C` and `Ctrl+L` keep working throughout.
   */
  capture: (handler: (key: string) => void) => () => void
  /**
   * Runs another command inside this one: the same signal (Ctrl+C stops both), the same
   * keyboard (the caller's capture is handed back when the child is done), and never the
   * visitor's aliases. The shell stays busy until the caller finishes. A throw,
   * `AbortError` included, propagates to the caller. It checks nothing about the target:
   * pass a fixed command line, or ask `isLinkable` first if the line came from outside.
   */
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
  /** Replays the full-screen boot sequence. */
  reboot: () => void
  crt: (enabled?: boolean) => boolean
  vim: (enabled: boolean, file?: VimFile) => void
  vimIsDirty: () => boolean
  /** Whether the vim pane is showing: `:q` only means something there. */
  vimIsOpen: () => boolean
  /** Shows a status-line message in the vim pane (e.g. a refused `:q`). */
  vimMessage: (text: string) => void
  glitch: (durationMs: number) => Promise<void>
  playMusic: () => void
}

/** What a command sees when the visitor hits Tab somewhere past its name. */
export interface CompleteContext {
  /** Arguments after the command name, including the word being completed. */
  args: string[]
  /** Index into `args` of the word the cursor sits on. */
  index: number
  /** The partial word being completed — `''` when the line ends in a space. */
  word: string
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
  /**
   * What running it changes; see `Writes`. A function when that depends on the
   * arguments: `theme` lists the schemes, `theme dracula` switches. Read it through
   * `writesOf()`, never directly.
   */
  writes: Writes | ((args: readonly string[]) => Writes)
  /**
   * Worth running from a link: `?run=<command>` opens the shell and runs it once. Opt-in,
   * because a link is written by someone other than the person clicking it, and only
   * honoured where `writes` is `none` and the command isn't hidden (`isLinkable()`
   * checks all three). A function when some arguments must not be linked: `help vim`
   * would hand out a hidden command, as `ls -a` would the dotfiles.
   */
  linkable?: boolean | ((args: readonly string[]) => boolean)
  /**
   * Tab-completion candidates for the argument being typed. Return everything
   * valid at that position — the shell filters by prefix, inserts the common
   * prefix and prints the list when the choice is still ambiguous, exactly as
   * it does for the command word. Keeping this on the command keeps the
   * registry the API: a command declares its own candidates, and nothing in
   * the shell needs a table of special cases.
   */
  complete?: (ctx: CompleteContext) => string[]
  run: (ctx: CommandContext) => OutputLine[] | void | Promise<OutputLine[] | void>
}
