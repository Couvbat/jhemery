import { prefersReducedMotion } from '@/composables/useCrt'
import { terminalOpen } from '@/composables/useTerminalShell'
import { closeAfterFade, openAudioContext } from '@/tools/acid/audio'
import type { AcidEngine } from '@/tools/acid/engine'
import type * as AcidPattern from '@/tools/acid/pattern'
import { findTool, visibleTools } from '@/tools/registry'
import { decodeBase64, encodeBase64 } from '@/tools/encode/encode'
import { digestText, toHex, type Algorithm } from '@/tools/hash/hash'
import { formatJson } from '@/tools/json/json'
import { blank, fail, line, link, pre, segmented } from '../format'
import { abortError, sleep } from '../timing'
import type { Command, CommandContext, OutputLine, OutputSegment } from '../types'
import { listFiles, resolveFileLines } from './files'

/** Everything after the command word and any leading `flags`, outer quotes stripped. */
export function operand(raw: string, flags: readonly string[] = []): string {
  let rest = raw.trim().replace(/^\S+\s*/, '')
  for (;;) {
    const match = /^(\S+)\s*/.exec(rest)
    if (!match || !flags.includes(match[1]!)) break
    rest = rest.slice(match[0].length)
  }
  return rest.replace(/^(['"])([\s\S]*)\1$/, '$2')
}

/** A fake-filesystem file as bytes would read: its lines, each ending in a newline. */
function fileText(lines: OutputLine[]): string {
  return lines.map((l) => `${l.text}\n`).join('')
}

/**
 * What a tool works on, and the name to print for it: a file the fake filesystem knows,
 * as its bytes; any other argument, as text (`-`); and with no argument, whatever came in
 * through a `|`, read as a file would be. So `cat about.txt | sha256sum` and
 * `sha256sum about.txt` print the same digest.
 */
function input(ctx: CommandContext, flags: readonly string[] = []): { text: string; name: string } | undefined {
  const given = operand(ctx.raw, flags)
  if (given) {
    const file = resolveFileLines(given, ctx.t)
    return file ? { text: fileText(file), name: given } : { text: given, name: '-' }
  }
  return ctx.stdin ? { text: fileText(ctx.stdin), name: '-' } : undefined
}

/** GNU `base64` wraps at 76 columns; so does this. */
function hardWrap(text: string, width = 76): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += width) out.push(text.slice(i, i + width))
  return out.length ? out : ['']
}

const ALGORITHM_BY_NAME: Record<string, Algorithm> = {
  sha1sum: 'SHA-1',
  sha256sum: 'SHA-256',
  sha512sum: 'SHA-512',
}

/** `crypto.randomUUID` only exists in secure contexts; the fallback is the same v4. */
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const NO_INPUT = {
  en: 'nothing to read: pass the text or a file name, or pipe it in',
  fr: 'rien à lire : passez le texte ou un nom de fichier, ou envoyez-le par un pipe',
}

/** Long enough to hear a pattern go round a few dozen times, short enough that a
 *  terminal left open doesn't play to an empty room. */
const ACID_LIMIT_MS = 120_000
/** How often the playhead reads the audio clock: under a step at 300 bpm (50 ms). */
const ACID_FRAME_MS = 30

type AcidEnd = 'user' | 'limit' | 'hidden' | 'replaced' | 'closed'

const ACID = {
  noAudio: {
    en: 'this browser has no Web Audio, so there is nothing to play it on',
    fr: "ce navigateur n'a pas de Web Audio, il n'y a rien pour le jouer",
  },
  badCode: {
    en: 'not a pattern code — the acid tool’s copy link gives one',
    fr: 'pas un code de motif — le lien copié par l’outil acid en donne un',
  },
  pressKey: { en: 'press any key to start sound', fr: 'appuyez sur une touche pour lancer le son' },
  wave: { saw: { en: 'saw', fr: 'scie' }, square: { en: 'square', fr: 'carrée' } },
  legend: { en: '● accent  ─── slide', fr: '● accent  ─── slide' },
  hint: { en: 'q, Esc or Ctrl+C stops · edit it at', fr: 'q, Échap ou Ctrl+C arrête · le modifier sur' },
  ended: {
    user: { en: 'stopped', fr: 'arrêté' },
    limit: {
      en: 'stopped after two minutes; run it again for more',
      fr: 'arrêté au bout de deux minutes ; relancez-le pour la suite',
    },
    hidden: {
      en: 'stopped: the tab went to the background',
      fr: "arrêté : l'onglet est passé en arrière-plan",
    },
    replaced: {
      en: 'stopped: the acid tool started a pattern',
      fr: "arrêté : l'outil acid a lancé un motif",
    },
    closed: { en: 'stopped: the terminal was closed', fr: 'arrêté : le terminal a été fermé' },
  } satisfies Record<AcidEnd, { en: string; fr: string }>,
}

/**
 * The pattern as four rows of sixteen four-column cells: pitches, accents, slides and
 * the playhead. `at` is the step sounding, or −1 for none; with reduced motion there is
 * no playhead row, since it would move up to twenty times a second.
 */
function acidRows(acid: typeof AcidPattern, pattern: AcidPattern.Pattern, at: number, playhead: boolean): OutputLine[] {
  const row = (cell: (step: AcidPattern.Step, i: number) => OutputSegment) =>
    segmented(pattern.steps.map(cell))
  const rows = [
    row((s, i) => ({
      text: (s.on ? acid.pitchName(acid.midiOf(pattern, s)) : '·').padEnd(4),
      tone: i === at ? 'primary' : s.on ? 'default' : 'muted',
    })),
    row((s) => ({ text: s.on && s.accent ? '●   ' : '    ', tone: 'warning' })),
    row((s, i) => ({
      text: s.on && s.slide && pattern.steps[(i + 1) % acid.STEPS]?.on ? ' ───' : '    ',
      tone: 'accent',
    })),
  ]
  if (playhead) rows.push(row((_, i) => ({ text: i === at ? '▲   ' : '    ', tone: 'primary' })))
  return rows
}

/**
 * The terminal's view of the tools page — derived from the same registry the page
 * renders, so a tool that exists on one exists on the other. `cd tools/<id>` is the
 * long form; this is the discoverable one, and the palette entry.
 */
export const toolCommands: Command[] = [
  {
    name: 'tools',
    usage: 'tools [<tool>]',
    description: {
      en: 'List the tools page, or open one of its tools',
      fr: "Lister la page outils, ou ouvrir l'un de ses outils",
    },
    group: 'navigate',
    writes: 'none',
    linkable: true,
    palette: true,
    complete: ({ index }) => (index === 0 ? visibleTools().map((tool) => tool.id) : []),
    run({ args, navigate, t }) {
      const [id] = args
      if (!id) {
        return [
          line('~/tools', 'muted'),
          ...visibleTools().map((tool) =>
            segmented([
              { text: tool.id.padEnd(10), tone: 'primary' },
              { text: t(tool.description), tone: 'muted' },
            ]),
          ),
          blank,
          line(
            t({
              en: 'tools <name> or cd tools/<name> opens one; cd tools opens the page.',
              fr: 'tools <nom> ou cd tools/<nom> en ouvre un ; cd tools ouvre la page.',
            }),
            'muted',
          ),
        ]
      }

      const tool = findTool(id)
      if (!tool || !navigate(`tools/${tool.id}`)) {
        return [fail(`tools: ${id}: No such tool`)]
      }
      return [line(`~/tools/${tool.id}`, 'muted')]
    },
  },
  // The shell versions of the tools page: each imports the same pure module its panel
  // does, so the terminal and the page cannot disagree about a digest or an encoding
  // — the rule `cat` and `vim` follow for files.
  {
    name: 'sha256sum',
    aliases: ['sha1sum', 'sha512sum'],
    usage: 'sha256sum <file|text>',
    description: {
      en: 'Hash a file or some text, as the hash tool does',
      fr: "Hacher un fichier ou du texte, comme l'outil hash",
    },
    group: 'core',
    writes: 'none',
    complete: ({ index }) => (index === 0 ? listFiles() : []),
    async run(ctx) {
      const invoked = ctx.raw.trim().split(/\s+/)[0]!.toLowerCase()
      const algorithm = ALGORITHM_BY_NAME[invoked] ?? 'SHA-256'
      const read = input(ctx)
      if (!read) return [fail(`${invoked}: ${ctx.t(NO_INPUT)}`)]
      return [pre(`${toHex(await digestText(algorithm, read.text))}  ${read.name}`)]
    },
  },
  {
    name: 'base64',
    usage: 'base64 [-d] <file|text>',
    description: {
      en: 'Encode or decode base64, as the encode tool does',
      fr: "Encoder ou décoder du base64, comme l'outil encode",
    },
    manual: {
      options: { '-d': { en: 'Decode rather than encode. Line breaks in the input are ignored.', fr: 'Décoder plutôt qu’encoder. Les retours à la ligne sont ignorés.' } },
      examples: [{ command: 'base64 about.txt' }, { command: 'echo aGkK | base64 -d' }],
      seeAlso: ['sha256sum(1)', 'tools(1)'],
    },
    group: 'core',
    writes: (args) => (args[0] === '-d' || args[0] === '--decode' ? 'local' : 'none'),
    complete: ({ index, args }) =>
      index === 0 ? ['-d', ...listFiles()] : index === 1 && args[0] === '-d' ? listFiles() : [],
    run(ctx) {
      const decoding = ctx.args[0] === '-d' || ctx.args[0] === '--decode'
      const read = input(ctx, ['-d', '--decode'])
      if (!read) return [fail(`base64: ${ctx.t(NO_INPUT)}`)]

      if (decoding) {
        try {
          // Line breaks are wrapping, as GNU base64 reads them.
          return decodeBase64(read.text.replace(/\s+/g, '')).split('\n').map((l) => pre(l))
        } catch {
          return [fail('base64: invalid input')]
        }
      }
      return hardWrap(encodeBase64(read.text)).map((l) => pre(l))
    },
  },
  {
    name: 'uuidgen',
    description: { en: 'A random UUID (v4)', fr: 'Un UUID aléatoire (v4)' },
    group: 'core',
    writes: 'none',
    run() {
      return [pre(uuid())]
    },
  },
  {
    name: 'jq',
    usage: 'jq . <json>',
    description: {
      en: 'Pretty-print JSON, as the JSON tool does',
      fr: "Indenter du JSON, comme l'outil JSON",
    },
    group: 'core',
    writes: 'local',
    complete: ({ index }) => (index === 0 ? ['.'] : []),
    run(ctx) {
      if (ctx.args[0] !== '.') {
        return [
          fail('jq: only the identity filter `.` works here — it pretty-prints'),
          line('usage: jq . \'{"a": 1}\'', 'muted'),
        ]
      }
      const read = input(ctx, ['.'])
      if (!read) return [fail(`jq: ${ctx.t(NO_INPUT)}`)]

      const result = formatJson(read.text, 2)
      if (result.ok) return result.output.split('\n').map((l) => pre(l))
      const where = result.line ? ` at line ${result.line}, column ${result.column}` : ''
      return [fail(`jq: error: ${result.message}${where}`)]
    },
  },
  {
    name: 'acid',
    usage: 'acid [<code>]',
    description: {
      en: 'Play a TB-303 pattern: the acid tool’s own, or one its link shared',
      fr: 'Jouer un motif TB-303 : celui de l’outil acid, ou un motif partagé par son lien',
    },
    group: 'fun',
    // Sound acts on the visitor's device, so this is never linkable: a link that opens
    // the shell and starts a bassline at whoever clicked it is hostile. `isLinkable`
    // refuses it on `writes` alone; it doesn't opt in either.
    writes: 'local',
    async run(ctx) {
      const { t } = ctx
      // Before the first `await`, while the keystroke that ran this is still the event
      // being handled: see `openAudioContext`.
      const context = openAudioContext()
      if (!context) return [line(`acid: ${t(ACID.noAudio)}`, 'error')]

      let engine: AcidEngine | undefined
      let release: (() => void) | undefined
      try {
        const [{ createEngine }, acid] = await Promise.all([
          import('@/tools/acid/engine'),
          import('@/tools/acid/pattern'),
        ])
        // A Ctrl+C while the chunks loaded has already fired, and `sleep` only hears an
        // abort that happens while it waits: without this the loop would play on.
        if (ctx.signal.aborted) throw abortError()
        const code = ctx.args[0]
        const pattern = code ? acid.decode(code) : acid.DEFAULT_PATTERN
        if (!pattern) return [line(`acid: ${code!.slice(0, 40)}: ${t(ACID.badCode)}`, 'error')]

        // Held for the whole run, as a game holds it: the output's live region goes quiet
        // while the playhead redraws, and nothing typed lands at the prompt meanwhile.
        const keys: { onKey: (() => void) | null; quit: boolean } = { onKey: null, quit: false }
        release = ctx.capture((key) => {
          if (keys.onKey) keys.onKey()
          else if (key === 'q') keys.quit = true
        })

        if (context.state !== 'running') {
          // The gesture didn't take (it ran from somewhere that wasn't one, or the browser
          // wanted a click). The next key is a gesture, and the resume is called from it.
          ctx.print(line(t(ACID.pressKey), 'warning'))
          await new Promise<void>((resolve, reject) => {
            if (ctx.signal.aborted) return reject(abortError())
            const onAbort = () => reject(abortError())
            ctx.signal.addEventListener('abort', onAbort, { once: true })
            keys.onKey = () => {
              void context.resume().then(() => {
                if (context.state !== 'running') return
                ctx.signal.removeEventListener('abort', onAbort)
                resolve()
              }, () => {})
            }
          })
          keys.onKey = null
        }

        const shared = `/tools/acid?p=${acid.encode(pattern)}`
        ctx.print(
          line(`acid · ${pattern.bpm} bpm · ${t(ACID.wave[pattern.wave])} · ${acid.NOTE_NAMES[pattern.root]}`, 'primary'),
        )
        const playhead = !prefersReducedMotion()
        const draw = ctx.frame()
        let shown = Number.NaN
        const paint = (at: number) => {
          if (at === shown) return
          shown = at
          draw(acidRows(acid, pattern, at, playhead))
        }
        paint(-1)
        ctx.print([line(t(ACID.legend), 'muted'), line(t(ACID.hint), 'muted'), link(shared, shared)])

        const state: { ended: AcidEnd | null } = { ended: null }
        engine = createEngine(context, () => pattern, {
          onStop: (reason) => {
            if (reason !== 'user') state.ended ??= reason
          },
        })
        engine.start()
        const started = Date.now()
        while (!state.ended) {
          await sleep(playhead ? ACID_FRAME_MS : 250, ctx.signal)
          if (ctx.signal.aborted) throw abortError()
          // Closing the overlay doesn't cancel what runs in it, and a bassline nobody can
          // see the stop key for is the one thing here that must not outlive it.
          if (keys.quit) state.ended = 'user'
          else if (!terminalOpen.value) state.ended = 'closed'
          else if (Date.now() - started >= ACID_LIMIT_MS) state.ended = 'limit'
          if (playhead) paint(engine.position())
        }
        paint(-1)
        return [line(`acid: ${t(ACID.ended[state.ended])}`, 'muted')]
      } finally {
        release?.()
        engine?.dispose()
        closeAfterFade(context)
      }
    },
  },
]
