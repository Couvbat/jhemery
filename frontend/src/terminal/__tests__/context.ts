import type { Locale, Localised } from '@/content/types'
import type { Command, CommandContext, OutputLine } from '../types'

/**
 * A `CommandContext` that records what a command does instead of doing it. Not a
 * spec (the include pattern wants `*.spec.ts`), just the harness the newer command
 * specs share rather than each writing its own.
 */
export interface Recorded {
  ctx: CommandContext
  /** Everything passed to `print`, plus every frame's latest draw, in order. */
  printed: OutputLine[]
  navigated: string[]
  ran: string[]
  copied: string[]
  /** Hands a key to whatever currently holds the keyboard through `capture`. */
  press: (key: string) => void
}

export function recordingContext(
  name: string,
  args: string[] = [],
  options: {
    locale?: Locale
    navigate?: (target: string) => boolean
    signal?: AbortSignal
    /**
     * False for output with nobody at the keyboard (the curl pages): `capture` and
     * `prompt` throw, so a command that needs a visitor fails the spec rather than
     * writing half a page.
     */
    interactive?: boolean
    /** What a `|` would hand the command. */
    stdin?: OutputLine[]
  } = {},
): Recorded {
  const locale = options.locale ?? 'en'
  const printed: OutputLine[] = []
  const navigated: string[] = []
  const ran: string[] = []
  const copied: string[] = []
  const toLines = (input: OutputLine | OutputLine[] | string): OutputLine[] =>
    typeof input === 'string' ? [{ text: input }] : Array.isArray(input) ? input : [input]
  let captured: ((key: string) => void) | null = null

  const ctx: CommandContext = {
    args,
    raw: [name, ...args].join(' '),
    tty: options.interactive !== false,
    stdin: options.stdin,
    locale,
    t: (<T,>(value: Localised<T>) => value[locale]) as CommandContext['t'],
    print: (input) => void printed.push(...toLines(input)),
    frame: () => {
      let height = 0
      return (lines) => {
        printed.splice(printed.length - height, height, ...lines)
        height = lines.length
      }
    },
    clear: () => void printed.splice(0),
    close: () => {},
    navigate: (target) => {
      navigated.push(target)
      return options.navigate ? options.navigate(target) : true
    },
    prompt: () => {
      if (options.interactive === false) throw new Error(`${name}: prompt with nobody at the keyboard`)
      return Promise.resolve('')
    },
    capture: (handler) => {
      if (options.interactive === false) throw new Error(`${name}: capture with nobody at the keyboard`)
      captured = handler
      return () => {
        if (captured === handler) captured = null
      }
    },
    run: (input) => {
      ran.push(input)
      return Promise.resolve()
    },
    effects: {} as CommandContext['effects'],
    signal: options.signal ?? new AbortController().signal,
  }
  return { ctx, printed, navigated, ran, copied, press: (key) => captured?.(key) }
}

/** Runs `command` and returns everything it printed and returned, as text. */
export async function runCommand(
  command: Command,
  args: string[] = [],
  options: Parameters<typeof recordingContext>[2] = {},
): Promise<{ lines: OutputLine[]; text: string } & Recorded> {
  const recorded = recordingContext(command.name, args, options)
  const returned = (await command.run(recorded.ctx)) ?? []
  const lines = [...recorded.printed, ...returned]
  return { ...recorded, lines, text: lines.map((l) => l.text).join('\n') }
}
