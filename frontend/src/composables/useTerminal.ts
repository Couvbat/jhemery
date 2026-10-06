import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { currentLocale } from '@/i18n'
import { messages } from '@/i18n/messages'
import { expandAliases } from '@/terminal/aliases'
import { expandHistory, history, historyBase, prefixMatches, pushHistory } from '@/terminal/history'
import { pick, type Locale } from '@/content/types'
import { fail } from '@/terminal/format'
import { completableFlags, renderUsage } from '@/terminal/manual'
import { lastStageStart, parseLine, replaceStages, type Link, type Stage } from '@/terminal/parse'
import {
  commonPrefix,
  completeCommand,
  filterByPrefix,
  argsOffered,
  isLinkable,
  isServerBound,
  resolve,
  resolveLink,
  resolveStage,
  suggest,
  writesOf,
} from '@/terminal/registry'
import type {
  Command,
  CommandContext,
  OutputLine,
  TerminalEffects,
  VimBufferState,
  VimFile,
} from '@/terminal/types'
import { handleVimKey } from '@/terminal/vimEditor'
import {
  closeTerminal,
  pendingInitialCommand,
  pendingLinkCommand,
  terminalCapturing,
  terminalOpen as open,
  terminalTrapped as trapped,
} from './useTerminalShell'
import { goTo } from './useViewSwing'
import { setCrt, glitch } from './useCrt'
import { decorativeMotion } from './useMotion'
import { showMatrix } from './useMatrix'
import { triggerBoot } from './useBoot'
import { requestPlayback } from './useMusicPlayer'
import { usePresence } from './usePresence'
import { recordSession } from './useStats'
import { profile } from '@/content'

const MAX_LINES = 500

const maximised = ref(false)
const busy = ref(false)
/** Non-null while the vim pane is showing in place of the normal scrolling output. */
const vimBuffer = ref<VimBufferState | null>(null)

const buffer = ref<OutputLine[]>([])
const draft = ref('')

/** Set while a command is waiting on `ctx.prompt()`. */
const pendingPrompt = shallowRef<{
  question: string
  mask: boolean
  resolve: (value: string) => void
  reject: (reason?: unknown) => void
} | null>(null)

/** Marks a capture that wants Escape itself (`ctx.capture(handler, { escape: true })`). */
const TAKES_ESCAPE = Symbol('takes escape')
type EscapeTaker = ((key: string) => void) & { [TAKES_ESCAPE]?: boolean }

/** Set while a running command holds the keyboard via `ctx.capture()`. */
const keyCapture = shallowRef<((key: string) => void) | null>(null)
// Mirrored into the registry-free shell module, for readers outside this chunk.
watch(keyCapture, (handler) => {
  terminalCapturing.value = handler !== null
})

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
  reboot: triggerBoot,
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
            pending: null,
          }
        : null
  },
  vimIsDirty: () => vimBuffer.value?.dirty ?? false,
  vimIsOpen: () => vimBuffer.value !== null,
  vimMessage: (text: string) => {
    if (vimBuffer.value) vimBuffer.value.statusMessage = text
  },
  // The screen-tear is decoration on top of the joke, so only at `full` motion. The
  // check is here rather than in `glitch()` itself: `useMotion` imports `useCrt`.
  glitch: (durationMs: number) => (decorativeMotion() === 'full' ? glitch(durationMs) : Promise.resolve()),
  playMusic: () => {
    requestPlayback()
    goTo('music')
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

// ---------------------------------------------------------------------------
// Where output goes
// ---------------------------------------------------------------------------

/**
 * A stage's output goes to the screen, or, on the left of a `|`, to the next stage's
 * stdin. Either way its stderr lines (`fail()`, achievement toasts) go to the screen, and a
 * failing one marks the stage as failed for `&&` and `||`.
 */
interface Sink {
  print: (lines: OutputLine[]) => void
  frame: () => (lines: OutputLine[]) => void
  clear: () => void
  failed: boolean
}

function toLines(input: OutputLine | OutputLine[] | string): OutputLine[] {
  return typeof input === 'string' ? [{ text: input }] : Array.isArray(input) ? input : [input]
}

const failing = (line: OutputLine) => line.stderr === true && line.tone === 'error'

function screen(): Sink {
  const sink: Sink = {
    failed: false,
    print: (lines) => {
      if (lines.some(failing)) sink.failed = true
      append(lines)
    },
    frame: openFrame,
    clear: clearBuffer,
  }
  return sink
}

function collector(): Sink & { lines: OutputLine[] } {
  const lines: OutputLine[] = []
  const keep = (input: OutputLine[]) => {
    const remarks = input.filter((line) => line.stderr)
    if (remarks.length) {
      if (remarks.some(failing)) sink.failed = true
      append(remarks)
    }
    return input.filter((line) => !line.stderr)
  }
  const sink = {
    lines,
    failed: false,
    print: (input: OutputLine[]) => void lines.push(...keep(input)),
    // A frame's region is where it was opened; each draw replaces what the last one wrote,
    // so the next stage reads the final picture rather than every frame of it.
    frame: () => {
      const start = lines.length
      let height = 0
      return (input: OutputLine[]) => {
        const kept = keep(input)
        lines.splice(start, height, ...kept)
        height = kept.length
      }
    },
    clear: () => void lines.splice(0),
  }
  return sink
}

// ---------------------------------------------------------------------------
// The context a command runs in
// ---------------------------------------------------------------------------

interface Scope {
  signal: AbortSignal
  sink: Sink
  tty: boolean
  /** The stage's own language (`LANG=fr`), or undefined to follow the visitor's as it changes. */
  locale: Locale | undefined
}

/** `LANG=fr neofetch`: this stage in French, the visitor's own setting untouched. */
function localeOf(env: Record<string, string>): Locale | undefined {
  const asked = (env.LC_ALL || env.LANG || '').slice(0, 2).toLowerCase()
  return asked === 'fr' || asked === 'en' ? asked : undefined
}

function notATty(raw: string): Error {
  const name = raw.trim().split(/\s+/)[0] ?? ''
  return new Error(`${name}: ${messages.terminal.notATty[currentLocale()]}`)
}

function buildContext(args: string[], raw: string, scope: Scope, stdin?: OutputLine[]): CommandContext {
  const { signal, sink, tty, locale } = scope
  return {
    args,
    raw,
    stdin,
    tty,
    locale: locale ?? currentLocale(),
    // Read when called, unless the stage asked for a language: `lang fr` switches the
    // language and then toasts in it, as it always did.
    t: (value) => pick(value, locale ?? currentLocale()),
    print: (input) => sink.print(toLines(input)),
    frame: () => sink.frame(),
    clear: () => sink.clear(),
    close: () => {
      open.value = false
    },
    navigate: (target: string) => {
      const ok = goTo(target)
      if (ok) open.value = false
      return ok
    },
    prompt: (question: string, options) => {
      if (!tty) throw notATty(raw)
      return new Promise<string>((resolvePrompt, rejectPrompt) => {
        append({ text: question, tone: 'accent' })
        pendingPrompt.value = {
          question,
          mask: options?.mask ?? false,
          resolve: resolvePrompt,
          reject: rejectPrompt,
        }
      })
    },
    capture: (handler: (key: string) => void, options?: { escape?: boolean }) => {
      // Nobody is reading a stage on the left of a `|`, so nobody is typing at it either.
      if (!tty) throw notATty(raw)
      // Only one capture at a time — commands don't nest, so a second call
      // replaces the first rather than stacking.
      if (options?.escape) (handler as EscapeTaker)[TAKES_ESCAPE] = true
      keyCapture.value = handler
      return () => {
        if (keyCapture.value === handler) keyCapture.value = null
      }
    },
    run: (input: string) => runNested(input, scope, stdin),
    effects,
    signal,
  }
}

/**
 * `ctx.run`: another command inside the one running. It shares the parent's signal, so
 * Ctrl+C stops both, its output goes where the parent's does (the screen, or a pipe), and
 * it leaves `busy`, the abort controller and the keyboard alone, because the parent is
 * still running. It never expands the visitor's aliases: the parent may be a link or
 * `tour`, which the visitor didn't type. Two-word names resolve as typed ones do.
 */
async function runNested(input: string, scope: Scope, stdin?: OutputLine[]): Promise<void> {
  const target = resolveLink(input)
  if (!target) {
    const [name = ''] = input.trim().split(/\s+/)
    scope.sink.print([fail(`${name}: ${messages.terminal.notFound[currentLocale()]}`)])
    return
  }
  // `--help` means the same inside another command: `strace sign --help` prints the usage,
  // it doesn't post "--help".
  if (target.args[0] === '--help') {
    scope.sink.print(renderUsage(target.command, (value) => pick(value, scope.locale ?? currentLocale())))
    return
  }
  // A capture is one slot, not a stack: hand the parent's back once the child is done,
  // whether the child took the keyboard, released it, or threw.
  const parentCapture = keyCapture.value
  try {
    // The parent's stdin too: `cat about.txt | strace sha256sum` hashes what came in.
    const result = await target.command.run(buildContext(target.args, input.trim(), scope, stdin))
    if (result) scope.sink.print(toLines(result))
  } finally {
    keyCapture.value = parentCapture
  }
}

/**
 * Whether `name`, read with the word after it, is a command. An alias never shadows
 * one: run and Tab completion both ask this, so they can't disagree about what a
 * line will run.
 */
function namesCommand(name: string, next?: string): boolean {
  return resolve(name) !== undefined || (next !== undefined && resolve(`${name} ${next}`) !== undefined)
}

// ---------------------------------------------------------------------------
// Running a line
// ---------------------------------------------------------------------------

interface ResolvedStage {
  command: Command
  args: string[]
  raw: string
  env: Record<string, string>
}

interface ResolvedLink {
  op: Link['op']
  stages: ResolvedStage[]
}

/** Every stage of a parsed line resolved, or the first one that isn't. */
function resolveChain(chain: Link[]): { links: ResolvedLink[] } | { unknown: Stage; first: boolean } {
  const links: ResolvedLink[] = []
  let first = true
  for (const link of chain) {
    const stages: ResolvedStage[] = []
    for (const stage of link.pipeline) {
      const target = resolveStage(stage.argv)
      if (!target) return { unknown: stage, first }
      stages.push({ command: target.command, args: target.args, raw: stage.raw, env: stage.env })
      first = false
    }
    links.push({ op: link.op, stages })
  }
  return { links }
}

/** Why a line ran nothing: which word is not a command, and what the visitor may have meant. */
function reportUnknown(stage: Stage, line: string, chain: Link[]): void {
  const locale = currentLocale()
  const [name = ''] = stage.argv
  append(fail(`${name}: ${messages.terminal.notFound[locale]}`))
  const stages = chain.flatMap((link) => link.pipeline)
  const before = stages[stages.indexOf(stage) - 1]
  const previous = before ? resolveStage(before.argv) : undefined
  const hint = suggest(name)
  if (hint) {
    append({ text: `${messages.terminal.didYouMean[locale]} \`${hint}\`?`, tone: 'muted' })
  } else if (before && previous && previous.args.length && !argsOffered(previous.command, previous.args)) {
    // After an operator, and after a command that takes free text, the likelier story is
    // text that wanted quoting: `sign great site; love it`. Nothing ran, so nothing posted.
    append({ text: messages.terminal.quoteIt[locale].replace('{example}', quoteExample(line, before)), tone: 'muted' })
  } else if (stages.length === 1 && stage.raw.includes(' ')) {
    // Nothing is within two edits of it and it has a space in it, so it reads
    // as a sentence rather than a typo. Someone who types `where does he work`
    // into a terminal has told you exactly what they want.
    append({ text: `${messages.terminal.askInstead[locale]} \`ask "${stage.raw}"\``, tone: 'muted' })
  }
}

/**
 * One pipeline, a stage at a time: commands return arrays, not streams, so each stage
 * finishes before the next reads its output. Failed when any stage throws or reports a
 * failure (`fail()`), the way `set -o pipefail` reads a pipeline. An abort is rethrown:
 * it ends the whole line, not this stage.
 */
async function runPipeline(stages: ResolvedStage[], signal: AbortSignal): Promise<boolean> {
  let stdin: OutputLine[] | undefined
  let ok = true
  for (const [i, stage] of stages.entries()) {
    const last = i === stages.length - 1
    const sink = last ? screen() : collector()
    // Each stage starts with the keyboard free: a stage before it can't leave a handler.
    keyCapture.value = null
    const scope: Scope = { signal, sink, tty: last, locale: localeOf(stage.env) }
    // `--help` as the very first argument, and only there: `projects --json` and
    // `echo hi --help` mean what they always meant.
    if (stage.args[0] === '--help') {
      sink.print(renderUsage(stage.command, (value) => pick(value, scope.locale ?? currentLocale())))
      stdin = 'lines' in sink ? (sink as ReturnType<typeof collector>).lines : undefined
      continue
    }
    try {
      const result = await stage.command.run(buildContext(stage.args, stage.raw, scope, stdin))
      if (result) sink.print(toLines(result))
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error
      append(fail(String((error as Error)?.message ?? error)))
      ok = false
    }
    if (sink.failed) ok = false
    // A stage may keep what it had on Ctrl+C rather than rethrow (`ask`); the line stops
    // here all the same, before anything after it starts.
    if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    stdin = 'lines' in sink ? (sink as ReturnType<typeof collector>).lines : undefined
  }
  return ok
}

/** A whole line: its pipelines in order, `&&` and `||` deciding which run. */
async function runChain(links: ResolvedLink[]): Promise<void> {
  const controller = new AbortController()
  abortController = controller
  busy.value = true
  let aborted = false
  let failed = false

  try {
    for (const link of links) {
      if (link.op === '&&' && failed) continue
      if (link.op === '||' && !failed) continue
      failed = !(await runPipeline(link.stages, controller.signal))
      if (controller.signal.aborted) break
    }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') aborted = true
    else append(fail(String((error as Error)?.message ?? error)))
  } finally {
    // The one `^C` line for this run, printed here rather than in `cancel()` so
    // there is exactly one however the abort surfaced: commands that rethrow it
    // (`sl`, `hack`, the games), commands that swallow it to keep the partial
    // output they already have (`ask`), and a cancelled `ctx.prompt()` all land
    // in the same place. One per line, however many stages it had.
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

export async function run(input: string): Promise<void> {
  const parsed = parseLine(input)
  if (!parsed.ok) return void append(fail(parsed.error))
  if (!parsed.chain.length) return

  // Aliases are rewritten before anything else looks at a stage, so resolving, the
  // two-word fallback and "did you mean …?" all reason about the command that will
  // actually run; and the line is read again, because an alias may hold a pipe, and
  // again, because what it holds may be another alias. Each stage is replaced in place,
  // so env words and quoting stay as typed. `alias` itself is never expanded — it reads
  // its own raw line — because it is a real command and aliases cannot shadow those.
  const expanded = expandLine(input, parsed.chain)
  if ('error' in expanded) return void append(fail(expanded.error))
  const { line, chain } = expanded

  // Every stage resolves before any runs: an unknown one runs nothing, so a line the
  // visitor meant as text never half-runs.
  const resolved = resolveChain(chain)
  if ('unknown' in resolved) {
    reportUnknown(resolved.unknown, line, chain)
    return
  }
  // Nor does a message: text that goes to the server and shares its line with an operator
  // must be quoted, or `sign love it; why not` would post "love it" and run `why`.
  const unquoted = chain.length > 1 || chain[0]!.pipeline.length > 1 ? unquotedMessage(resolved.links, chain) : undefined
  if (unquoted) {
    append(fail(`${unquoted.name}: ${messages.terminal.quoteMessage[currentLocale()]}`))
    append({ text: messages.terminal.quoteIt[currentLocale()].replace('{example}', quoteExample(line, unquoted.stage)), tone: 'muted' })
    return
  }
  await runChain(resolved.links)
}

/** Rounds of alias expansion a line may take; each also re-reads it, and MAX_STAGES bounds what it grows to. */
const EXPANSION_ROUNDS = 8

/** A line with the visitor's aliases expanded, stage by stage and round after round, as it will run. */
function expandLine(input: string, parsed: Link[]): { line: string; chain: Link[] } | { error: string } {
  let line = input
  let chain = parsed
  for (let round = 0; round < EXPANSION_ROUNDS; round++) {
    const next = replaceStages(line, chain, (stage) => expandAliases(stage.raw, namesCommand))
    if (next === line) break
    const again = parseLine(next)
    if (!again.ok) return { error: again.error }
    line = next
    chain = again.chain
  }
  return { line, chain }
}

/** A server-bound stage whose text isn't one quoted group, in a line with an operator in it. */
function unquotedMessage(links: ResolvedLink[], chain: Link[]): { name: string; stage: Stage } | undefined {
  const stages = chain.flatMap((link) => link.pipeline)
  const resolved = links.flatMap((link) => link.stages)
  for (const [i, stage] of resolved.entries()) {
    if (!stage.args.length || writesOf(stage.command, stage.args) !== 'server') continue
    if (!/^(["'])[\s\S]*\1$/.test(stage.args.join(' '))) return { name: stage.command.name, stage: stages[i]! }
  }
  return undefined
}

/** `sign "great site; love it"`: the stage's command, then the rest of the line from its text on, quoted. */
function quoteExample(line: string, stage: Stage): string {
  const [command = ''] = stage.argv
  const rest = line.slice(stage.at + command.length).trim()
  const quote = rest.includes('"') ? "'" : '"'
  return `${command} ${quote}${rest}${quote}`
}

/**
 * `wall` from someone else, as a real terminal shows it — but only when it is open and
 * idle. A running command may be drawing a `frame()`, which assumes it owns the tail of
 * the buffer, so a wave that lands mid-command waits for it to finish; one that lands
 * while the terminal is closed is the field's alone, and isn't kept for later.
 */
const { wave } = usePresence()
let waveWaiting = false

function printWave() {
  const locale = currentLocale()
  append([
    { text: '' },
    { text: `${messages.terminal.broadcast[locale]} somebody@${profile.domain}`, tone: 'accent' },
    { text: messages.terminal.broadcastNote[locale], tone: 'muted' },
  ])
}

watch(wave, () => {
  if (!open.value) return
  if (busy.value) waveWaiting = true
  else printWave()
})
watch(busy, (running) => {
  if (running || !waveWaiting) return
  waveWaiting = false
  if (open.value) printWave()
})

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
  resetRecall()

  // `!!`, `!$`, `!N`, `^a^b`: typed lines only, never a link, a nested run or an answer.
  // Alias-aware, as the line will run: `alias s=sign` must not make `s Great site!!` expandable.
  const serverBound = (word: string) =>
    isServerBound(word) || isServerBound(expandAliases(word, namesCommand).split(/\s+/)[0] ?? '')
  const expansion = expandHistory(value, history.value, serverBound, historyBase.value)
  if ('error' in expansion) return void append(fail(`couvsh: ${expansion.error}`))
  const line = expansion.line
  if (expansion.expanded) {
    append({ text: line, tone: 'muted' })
    // What `!!` turned into is the visitor's to check before it writes anything, as
    // zsh's `histverify` has it: into history, one ↑ and Enter away, not run.
    if (writesAnything(line)) {
      pushHistory(line)
      append({ text: messages.terminal.histverify[currentLocale()], tone: 'muted' })
      return
    }
  }
  // Into history once it has run, so `history | grep …` lists what came before it; as
  // typed when nothing expanded, so a recalled `\!!` is still a literal `!!`.
  await run(line)
  pushHistory(expansion.expanded ? line : value)
}

/** Whether any stage of a line would write, by the same `writes` links and pipes read. */
function writesAnything(line: string): boolean {
  const parsed = parseLine(line)
  if (!parsed.ok) return false
  const expanded = expandLine(line, parsed.chain)
  if ('error' in expanded) return false
  const resolved = resolveChain(expanded.chain)
  // A stage that doesn't resolve can't be vouched for: hold it back too.
  if ('unknown' in resolved) return true
  return resolved.links.some((link) => link.stages.some((s) => writesOf(s.command, s.args) !== 'none'))
}

/** A link's command can never be longer than this, or carry control characters. */
const LINK_MAX = 200

/**
 * Runs a line a `?run=` link asked for, once, and only if every stage passes
 * `isLinkable()` for its arguments: opted in, not hidden, writes nothing, arguments
 * the command offers. It is echoed as if typed, so the reader sees exactly what ran,
 * and resolved without the reader's own aliases, which a link's author must not be
 * able to reach.
 */
export async function runLink(input: string): Promise<void> {
  // Every kind of space becomes a plain one, so the words the shell checks are the
  // words it echoes: a no-break space must not hide one command behind another.
  const line = Array.from(input, (c) => (c < ' ' || c === '\u007f' || /\s/.test(c) ? ' ' : c))
    .join('')
    .trim()
    .slice(0, LINK_MAX)
  if (!line) return
  // A link in the scrollback stays clickable while a command runs, and running it would
  // take the shell from under that command: it would lose its keyboard, its ^C and its
  // busy flag, and never settle. Enter is blocked then; so is a click.
  if (busy.value || pendingPrompt.value) return

  const parsed = parseLine(line)
  const resolved = parsed.ok && parsed.chain.length ? resolveChain(parsed.chain) : undefined
  const links = resolved && 'links' in resolved ? resolved.links : undefined
  // No env words from a link: `NOTICE="Your session expired…" whoami` would print the
  // author's sentence on the prompt line, past every check on the command's arguments.
  const plain = links?.every((link) => link.stages.every((stage) => !Object.keys(stage.env).length))
  if (!links || !plain || !links.every((link) => link.stages.every((stage) => isLinkable(stage.command, stage.args)))) {
    // Quoted short: a refused link's text is the link author's, not the site's.
    const asked = line.length > 60 ? `${line.slice(0, 59)}…` : line
    append({
      text: messages.terminal.linkRefused[currentLocale()].replace('{command}', asked),
      tone: 'warning',
    })
    return
  }

  append({ text: line, prompt: true })
  resetRecall()
  await runChain(links)
  pushHistory(line)
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

/**
 * What ↑/↓ walk, newest first: every entry from an empty line, or, with text, the lines
 * that start with it, each once (`prefixMatches`). Null when no walk is under way.
 */
let recallList: string[] | null = null
let recallAt = -1

/** Forgets the walk: typing, Ctrl+C and a submitted line all start the next ↑ afresh. */
export function resetRecall(): void {
  recallList = null
  recallAt = -1
}

/**
 * ↑/↓ through submitted commands. Returns the value the input should show. With text in
 * the input, ↑ is a prefix search, as zsh's up-line-or-beginning-search is: only the
 * lines that start with what was typed.
 */
export function recallHistory(direction: -1 | 1, current: string): string {
  const entries = history.value
  if (entries.length === 0) return current

  if (!recallList) {
    if (direction === 1) return current
    draft.value = current
    recallList = current.trim() ? prefixMatches(entries, current) : [...entries].reverse()
  }
  const next = recallAt - direction
  if (next < 0) {
    resetRecall()
    return draft.value
  }
  // Past the oldest match: stay on it (or on the text, if nothing ever matched).
  if (next >= recallList.length) return recallAt === -1 ? current : recallList[recallAt]!
  recallAt = next
  return recallList[recallAt]!
}

/** Resolves which command owns a half-typed line, and where its arguments start. */
function ownerOf(words: string[]): { command: Command; argStart: number } | undefined {
  const [first = '', second = ''] = words

  // Two-word command names (`git log`, `ps aux`) resolve the way `run()` does —
  // but only once a third word exists, or `git lo<Tab>` would look like an
  // argument to a command called `git`.
  if (words.length > 2) {
    const twoWord = resolve(`${first} ${second}`)
    if (twoWord) return { command: twoWord, argStart: 2 }
  }

  const direct = resolve(first)
  if (direct) return { command: direct, argStart: 1 }

  // `gl about.txt` where `gl` is the visitor's alias: complete against the
  // command that will actually run, not the name they typed.
  const expanded = expandAliases(first, namesCommand)
  if (expanded === first) return undefined
  const viaAlias = resolve(expanded) ?? resolve(expanded.split(/\s+/)[0] ?? '')
  return viaAlias ? { command: viaAlias, argStart: 1 } : undefined
}

/** What one Tab press produced: the line to show, and where the caret goes in it. */
export interface Completion {
  value: string
  caret: number
}

/**
 * Candidates for a word past the command name — the command's own to declare. A word
 * starting with `-` is offered the flags its usage names too, whatever its `complete`.
 */
function completeArgument(words: string[], index: number, word: string): string[] {
  const owner = ownerOf(words)
  if (!owner) return []

  const argIndex = index - owner.argStart
  if (argIndex < 0) return []

  const args = words.slice(owner.argStart)
  const own = owner.command.complete?.({ args, index: argIndex, word }) ?? []
  const flags = word.startsWith('-') ? completableFlags(owner.command) : []
  return filterByPrefix([...new Set([...own, ...flags])], word)
}

/** `-<Tab>` with several flags left: each one with what it does, as zsh lists them. */
function describeFlags(words: string[], candidates: string[]): OutputLine[] | undefined {
  const owner = ownerOf(words)
  const options = owner?.command.manual?.options
  if (!owner || !options || !candidates.every((c) => c.startsWith('-'))) return undefined
  const width = Math.max(...candidates.map((c) => c.length))
  const locale = currentLocale()
  return candidates.map((flag) => ({
    text: `${flag.padEnd(width)}  ${options[flag] ? pick(options[flag]!, locale) : ''}`.trimEnd(),
    tone: 'muted' as const,
    pre: true,
  }))
}

/**
 * Tab completion. Returns the line to show and where the caret should land,
 * printing candidates when ambiguous.
 *
 * The command word and its arguments go through the same three steps — filter
 * by prefix, insert the single match or the common prefix, list the rest — so
 * completing an argument feels like completing a command, one word later. Only
 * the source of the candidates differs.
 *
 * Only the word the caret sits in is completed, and only the text behind the
 * caret is read as a prefix — `cat ab|out` completes `ab`, leaving `out` where
 * it is, the way a real shell does. Whitespace is spliced around rather than
 * rebuilt, so `cat  ab` keeps the double space the visitor typed.
 */
export function completeInput(value: string, caret: number = value.length): Completion {
  const at = Math.max(0, Math.min(caret, value.length))
  const head = value.slice(0, at)
  const tail = value.slice(at)

  // The word under the caret is the run of non-space characters ending at it —
  // empty when the caret follows a space, which is exactly right: the cursor is
  // on a new argument nobody has typed a prefix for yet.
  const word = /\S*$/.exec(head)![0]
  const start = head.length - word.length
  // Words count from the stage being typed: after `ls | gr`, `gr` is a command again.
  const preceding = head.slice(Math.min(lastStageStart(head), start), start).trim()
  const priorWords = preceding ? preceding.split(/\s+/) : []
  const index = priorWords.length
  const words = [...priorWords, word]

  const candidates = index === 0 ? completeCommand(word) : completeArgument(words, index, word)
  if (candidates.length === 0) return { value, caret: at }

  const splice = (insert: string): Completion => ({
    value: `${head.slice(0, start)}${insert}${tail}`,
    caret: start + insert.length,
  })

  if (candidates.length === 1) return splice(`${candidates[0]!} `)

  const shared = commonPrefix(candidates)
  append(describeFlags(words, candidates) ?? { text: candidates.join('  '), tone: 'muted', pre: true })
  return shared.length > word.length ? splice(shared) : { value, caret: at }
}

/** Called by `TerminalOverlay` every time it opens — shows the welcome message
 *  on the very first-ever open (buffer stays non-empty forever after, so it
 *  never repeats), and runs whatever command the light `openTerminal()` queued
 *  up for us, if any. */
export function primeOverlay() {
  // Once per session, here rather than in `run()`: a per-command ping would be
  // chatter, and it would mean the server learning which commands people run —
  // the thing `ask` explicitly promises not to record. Its own guard makes
  // repeat opens free.
  recordSession()

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
  const linked = pendingLinkCommand.value
  if (linked) {
    pendingLinkCommand.value = null
    void nextTick(() => runLink(linked))
  }
}

export function useTerminal() {
  return {
    open,
    maximised,
    busy: computed(() => busy.value),
    trapped: computed(() => trapped.value),
    capturing: computed(() => keyCapture.value !== null),
    captureTakesEscape: computed(() => (keyCapture.value as EscapeTaker | null)?.[TAKES_ESCAPE] === true),
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
    runLink,
  }
}
