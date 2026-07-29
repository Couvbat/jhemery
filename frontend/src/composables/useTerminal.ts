import { computed, nextTick, ref, shallowRef } from 'vue'
import { currentLocale, useLocale } from '@/i18n'
import { messages } from '@/i18n/messages'
import { history, pushHistory } from '@/terminal/history'
import { commonPrefix, complete, resolve, suggest } from '@/terminal/registry'
import type { CommandContext, OutputLine, TerminalEffects } from '@/terminal/types'
import { scrollToSection } from './useActiveSection'
import { setCrt, glitch } from './useCrt'
import { showMatrix } from './useMatrix'
import { requestPlayback } from './useMusicPlayer'

const MAX_LINES = 500

const open = ref(false)
const maximised = ref(false)
const busy = ref(false)
/** While a vim trap is active, Esc no longer closes the overlay. That is the joke. */
const trapped = ref(false)

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

const effects: TerminalEffects = {
  matrix: showMatrix,
  crt: setCrt,
  vim: (enabled: boolean) => {
    trapped.value = enabled
  },
  glitch,
  playMusic: () => {
    requestPlayback()
    scrollToSection('music')
  },
}

function buildContext(args: string[], raw: string, signal: AbortSignal): CommandContext {
  const { t } = useLocale()
  return {
    args,
    raw,
    locale: currentLocale(),
    t,
    print: append,
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
    }
    return
  }

  return execute(command.name, args, raw)
}

async function execute(name: string, args: string[], raw: string): Promise<void> {
  const command = resolve(name)
  if (!command) return

  abortController = new AbortController()
  busy.value = true

  try {
    const result = await command.run(buildContext(args, raw, abortController.signal))
    if (result) append(result)
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      append({ text: messages.terminal.cancelled[currentLocale()], tone: 'muted' })
    } else {
      append({ text: String((error as Error)?.message ?? error), tone: 'error' })
    }
  } finally {
    busy.value = false
    abortController = null
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
  abortController?.abort()
  append({ text: messages.terminal.cancelled[currentLocale()], tone: 'muted' })
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

export function openTerminal(initialCommand?: string) {
  open.value = true
  if (buffer.value.length === 0) {
    append([
      { text: messages.terminal.welcome[currentLocale()], tone: 'primary' },
      { text: messages.terminal.hint[currentLocale()], tone: 'muted' },
      { text: '' },
    ])
  }
  if (initialCommand) {
    void nextTick(() => submit(initialCommand))
  }
}

export function closeTerminal() {
  if (trapped.value) return false
  open.value = false
  return true
}

export function useTerminal() {
  return {
    open,
    maximised,
    busy: computed(() => busy.value),
    trapped: computed(() => trapped.value),
    buffer: computed(() => buffer.value),
    revision: computed(() => revision.value),
    pendingPrompt: computed(() => pendingPrompt.value),
    history: computed(() => history.value),
    openTerminal,
    closeTerminal,
    submit,
    cancel,
    recallHistory,
    completeInput,
    clearBuffer,
    run,
  }
}
