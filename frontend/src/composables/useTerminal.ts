import { computed, nextTick, ref, shallowRef } from 'vue'
import { currentLocale, useLocale } from '@/i18n'
import { messages } from '@/i18n/messages'
import { history, pushHistory } from '@/terminal/history'
import { commonPrefix, complete, resolve, suggest } from '@/terminal/registry'
import type { CommandContext, OutputLine, TerminalEffects, VimBufferState, VimFile } from '@/terminal/types'
import { handleVimKey } from '@/terminal/vimEditor'
import {
  closeTerminal,
  pendingInitialCommand,
  terminalOpen as open,
  terminalTrapped as trapped,
} from './useTerminalShell'
import { scrollToSection } from './useActiveSection'
import { setCrt, glitch } from './useCrt'
import { showMatrix } from './useMatrix'
import { requestPlayback } from './useMusicPlayer'

const MAX_LINES = 500

const maximised = ref(false)
const busy = ref(false)
/** Non-null while the vim pane is showing in place of the normal scrolling output. */
const vimBuffer = ref<VimBufferState | null>(null)

const buffer = ref<OutputLine[]>([])
const historyIndex = ref(-1)
const draft = ref('')

/** Set while a command is waiting on `ctx.prompt()`. */
const pendingPrompt = shallowRef<{
  question: string
  mask: boolean
  resolve: (value: string) => void
  reject: (reason?: unknown) => void
} | null>(null)

/** Set while a running command holds the keyboard via `ctx.capture()`. */
const keyCapture = shallowRef<((key: string) => void) | null>(null)

let abortController: AbortController | null = null
/** Bumped on every append so the view knows to scroll. */
const revision = ref(0)

function append(input: OutputLine | OutputLine[] | string) {
  const incoming: OutputLine[] =
    typeof input === 'string' ? [{ text: input }] : Array.isArray(input) ? input : [input]

  buffer.value = [...buffer.value, ...incoming].slice(-MAX_LINES)
  revision.value += 1
}

function clearBuffer() {
  buffer.value = []
  revision.value += 1
}

/** Backs `ctx.frame()`. The region is always the tail of the buffer, so a redraw
 *  is "drop the rows I wrote last time, append the new ones" — which stays correct
 *  when MAX_LINES trims the head out from under us. */
function openFrame(): (input: OutputLine[]) => void {
  let height = 0

  return (input: OutputLine[]) => {
    const kept = buffer.value.slice(0, Math.max(0, buffer.value.length - height))
    buffer.value = [...kept, ...input].slice(-MAX_LINES)
    // A frame taller than the whole buffer keeps only its own tail.
    height = Math.min(input.length, MAX_LINES)
    revision.value += 1
  }
}

const effects: TerminalEffects = {
  matrix: showMatrix,
  crt: setCrt,
  vim: (enabled: boolean, file?: VimFile) => {
    trapped.value = enabled
    vimBuffer.value =
      enabled && file
        ? {
            name: file.name,
            lines: [...file.lines],
            cursor: { row: 0, col: 0 },
            mode: 'normal',
            dirty: false,
            statusMessage: null,
          }
        : null
  },
  vimIsDirty: () => vimBuffer.value?.dirty ?? false,
  vimMessage: (text: string) => {
    if (vimBuffer.value) vimBuffer.value.statusMessage = text
  },
  glitch,
  playMusic: () => {
    requestPlayback()
    scrollToSection('music')
  },
}

/** Hands one keydown to a running command that has taken the keyboard. Returns
 *  `false` when there is no capture, or the combo is one the command must not
 *  swallow — `Ctrl+C` and `Ctrl+L` keep working throughout a game, which is how
 *  a visitor quits one. Mirrors the modifier guard the vim pane uses. */
export function handleCaptureKeydown(event: KeyboardEvent): boolean {
  const handler = keyCapture.value
  if (!handler) return false
  if (event.ctrlKey || event.altKey || event.metaKey) return false

  handler(event.key)
  return true
}

/** Delegates one keydown to the vim editor's pure state machine. Returns `false`
 *  if there's no open vim buffer, or the key wasn't handled (currently only `:`),
 *  telling the caller to let the keystroke fall through normally. */
export function handleVimKeydown(event: KeyboardEvent): boolean {
  if (!vimBuffer.value) return false
  // A fresh editing action dismisses whatever status message is showing —
  // it doesn't persist once the visitor has moved on.
  vimBuffer.value.statusMessage = null
  return handleVimKey(vimBuffer.value, event)
}

function buildContext(args: string[], raw: string, signal: AbortSignal): CommandContext {
  const { t } = useLocale()
  return {
    args,
    raw,
    locale: currentLocale(),
    t,
    print: append,
    frame: openFrame,
    clear: clearBuffer,
    close: () => {
      open.value = false
    },
    navigate: (sectionId: string) => {
      const ok = scrollToSection(sectionId)
      if (ok) open.value = false
      return ok
    },
    prompt: (question: string, options) =>
      new Promise<string>((resolvePrompt, rejectPrompt) => {
        append({ text: question, tone: 'accent' })
        pendingPrompt.value = {
          question,
          mask: options?.mask ?? false,
          resolve: resolvePrompt,
          reject: rejectPrompt,
        }
      }),
    capture: (handler: (key: string) => void) => {
      // Only one capture at a time — commands don't nest, so a second call
      // replaces the first rather than stacking.
      keyCapture.value = handler
      return () => {
        if (keyCapture.value === handler) keyCapture.value = null
      }
    },
    run: (input: string) => run(input),
    effects,
    signal,
  }
}

export async function run(input: string): Promise<void> {
  const raw = input.trim()
  if (!raw) return

  const [name = '', ...args] = raw.split(/\s+/)
  const command = resolve(name)

  if (!command) {
    // `git log` reads better than `gitlog`, so try a two-word command name too.
    const twoWord = resolve(`${name} ${args[0] ?? ''}`.trim())
    if (twoWord) {
      return execute(twoWord.name, args.slice(1), raw)
    }
    const hint = suggest(name)
    append({
      text: `${name}: ${messages.terminal.notFound[currentLocale()]}`,
      tone: 'error',
    })
    if (hint) {
      append({
        text: `${messages.terminal.didYouMean[currentLocale()]} \`${hint}\`?`,
        tone: 'muted',
      })
    } else if (raw.includes(' ')) {
      // Nothing is within two edits of it and it has a space in it, so it reads
      // as a sentence rather than a typo. Someone who types `where does he work`
      // into a terminal has told you exactly what they want.
      append({
        text: `${messages.terminal.askInstead[currentLocale()]} \`ask "${raw}"\``,
        tone: 'muted',
      })
    }
    return
  }

  return execute(command.name, args, raw)
}

async function execute(name: string, args: string[], raw: string): Promise<void> {
  const command = resolve(name)
  if (!command) return

  const controller = new AbortController()
  abortController = controller
  busy.value = true
  let aborted = false

  try {
    const result = await command.run(buildContext(args, raw, controller.signal))
    if (result) append(result)
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      aborted = true
    } else {
      append({ text: String((error as Error)?.message ?? error), tone: 'error' })
    }
  } finally {
    // The one `^C` line for this run, printed here rather than in `cancel()` so
    // there is exactly one however the abort surfaced: commands that rethrow it
    // (`sl`, `hack`, the games), commands that swallow it to keep the partial
    // output they already have (`ask`), and a cancelled `ctx.prompt()` all land
    // in the same place.
    if (aborted || controller.signal.aborted) {
      append({ text: messages.terminal.cancelled[currentLocale()], tone: 'muted' })
    }
    busy.value = false
    abortController = null
    // Unconditional, for the same reason `busy` is: a game that throws must not
    // leave the keyboard routed at a handler nobody owns any more.
    keyCapture.value = null
  }
}

/** Handles the Enter key: either answers a pending prompt or runs a command. */
export async function submit(value: string): Promise<void> {
  const pending = pendingPrompt.value
  if (pending) {
    pendingPrompt.value = null
    // Answers to a question are not commands, so they don't get the shell prompt.
    append({ text: `  ${pending.mask ? '•'.repeat(value.length) : value}`, tone: 'accent' })
    pending.resolve(value)
    return
  }

  append({ text: value, prompt: true })
  pushHistory(value)
  historyIndex.value = -1

  await run(value)
}

/** Ctrl+C — abort an in-flight command or cancel a pending prompt. */
export function cancel() {
  const pending = pendingPrompt.value
  if (pending) {
    pendingPrompt.value = null
    pending.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }))
  }
  const running = abortController
  running?.abort()
  // A run in flight prints its own `^C` as it unwinds, so only an idle prompt —
  // where there is nothing to unwind — needs the line from here.
  if (!running) append({ text: messages.terminal.cancelled[currentLocale()], tone: 'muted' })
}

/** ↑/↓ through submitted commands. Returns the value the input should show. */
export function recallHistory(direction: -1 | 1, current: string): string {
  if (history.value.length === 0) return current

  if (historyIndex.value === -1) {
    if (direction === 1) return current
    draft.value = current
    historyIndex.value = history.value.length - 1
    return history.value[historyIndex.value]!
  }

  const next = historyIndex.value + direction
  if (next < 0) return history.value[0]!
  if (next >= history.value.length) {
    historyIndex.value = -1
    return draft.value
  }
  historyIndex.value = next
  return history.value[next]!
}

/** Tab completion. Returns the replacement value, printing candidates when ambiguous. */
export function completeInput(value: string): string {
  // Only the command word completes; arguments are too varied to guess usefully.
  if (/\s/.test(value.trimStart())) return value

  const candidates = complete(value.trim())
  if (candidates.length === 0) return value
  if (candidates.length === 1) return `${candidates[0]!} `

  const shared = commonPrefix(candidates)
  append({ text: candidates.join('  '), tone: 'muted', pre: true })
  return shared.length > value.length ? shared : value
}

/** Called by `TerminalOverlay` every time it opens — shows the welcome message
 *  on the very first-ever open (buffer stays non-empty forever after, so it
 *  never repeats), and runs whatever command the light `openTerminal()` queued
 *  up for us, if any. */
export function primeOverlay() {
  if (buffer.value.length === 0) {
    append([
      { text: messages.terminal.welcome[currentLocale()], tone: 'primary' },
      { text: messages.terminal.hint[currentLocale()], tone: 'muted' },
      { text: '' },
    ])
  }
  const initialCommand = pendingInitialCommand.value
  if (initialCommand) {
    pendingInitialCommand.value = null
    void nextTick(() => submit(initialCommand))
  }
}

export function useTerminal() {
  return {
    open,
    maximised,
    busy: computed(() => busy.value),
    trapped: computed(() => trapped.value),
    capturing: computed(() => keyCapture.value !== null),
    vimBuffer: computed(() => vimBuffer.value),
    handleVimKeydown,
    handleCaptureKeydown,
    buffer: computed(() => buffer.value),
    revision: computed(() => revision.value),
    pendingPrompt: computed(() => pendingPrompt.value),
    history: computed(() => history.value),
    primeOverlay,
    closeTerminal,
    submit,
    cancel,
    recallHistory,
    completeInput,
    clearBuffer,
    run,
  }
}
