import { profile } from '@/content'
import { useCrt } from '@/composables/useCrt'
import { decorativeMotion } from '@/composables/useMotion'
import { useMusicPlayer } from '@/composables/useMusicPlayer'
import { sendWave, whenPresent, type WaveResult } from '@/composables/usePresence'
import type { Localised } from '@/content/types'
import { observeRequests, type RequestTrace } from '@/lib/api'
import {
  EMBEDS_NOTE,
  HTTP_CACHE_NOTE,
  STALE_LABEL,
  STALE_PURPOSE,
  STORAGE_GROUPS,
  WORKBOX_NOTE,
  cachePurpose,
  cacheReport,
  groupOf,
  reloadPage,
  removeItems,
  shortName,
  storedItems,
  type StorageGroup,
  type StoredItem,
} from '@/lib/storage-keys'
import { CORE_BYTES } from '@/tools/ffmpeg/media'
import { formatBytes } from '@/tools/image/image'
import { achievementList, announce, isUnlocked, unlockedCount } from '../achievements'
import { blank, fail, line, link, segmented } from '../format'
import { isLinkable, resolveLink, visibleCommands, writesOf } from '../registry'
import { traceLines } from '../strace'
import { sleep } from '../timing'
import type { Command, CommandContext, OutputLine, Tone } from '../types'
import { uptime } from './content'
import { ENV_FILE, envAssignments } from './env-file'
import { resolveFileLines } from './files'
import { systemctl } from './systemctl'

interface Proc {
  pid: number
  state: 'R' | 'S' | 'Z'
  command: string
  cpu: [number, number]
  mem: [number, number]
}

/** A snapshot of the site's own "processes" — some conditional on real page state. */
function processes(): Proc[] {
  const list: Proc[] = [
    { pid: 1, state: 'S', command: 'init', cpu: [0, 0.1], mem: [0.1, 0.2] },
    { pid: 42, state: 'R', command: 'couvsh — this shell', cpu: [55, 92], mem: [12, 19] },
    { pid: 7, state: 'R', command: 'three.js --render-loop', cpu: [14, 38], mem: [8, 15] },
    { pid: 8, state: 'R', command: 'vue-router', cpu: [4, 11], mem: [3, 6] },
    { pid: 9, state: 'S', command: 'guestbook.service', cpu: [0.5, 3], mem: [0.5, 1.5] },
    { pid: 10, state: 'S', command: 'steam-poller', cpu: [0.2, 2], mem: [0.3, 0.8] },
    { pid: 11, state: 'S', command: 'github-sync', cpu: [0.2, 2], mem: [0.3, 0.8] },
    { pid: 12, state: 'S', command: 'konami.listener', cpu: [0, 0.3], mem: [0.1, 0.2] },
    // Permanent gag — the `sudo rm -rf /` easter egg never actually finishes.
    { pid: 66, state: 'Z', command: '[rm -rf /] <defunct>', cpu: [0, 0], mem: [0, 0] },
  ]

  if (useCrt().overdrive.value) {
    list.push({ pid: 13, state: 'R', command: 'crt-shader.ko', cpu: [9, 17], mem: [1.5, 3] })
  }
  // Bumps once `play`/`sign up` requests playback — no "stopped" state to check against.
  if (useMusicPlayer().autoplayNonce.value > 0) {
    list.push({ pid: 14, state: 'R', command: 'soundcloud-embed --autoplay', cpu: [4, 9], mem: [3, 5] })
  }

  return list
}

const GHOST: Proc = {
  pid: 31337,
  state: 'S',
  command: 'ghost --flag=CTF{4a89a7f727a2c302} --next=/llms.txt',
  cpu: [0, 0.1],
  mem: [0.1, 0.1],
}

function jitter([min, max]: [number, number]): string {
  return (Math.random() * (max - min) + min).toFixed(1)
}

function stateTone(state: Proc['state']): Tone {
  return state === 'Z' ? 'muted' : state === 'R' ? 'primary' : 'default'
}

function table(procs: Proc[]): OutputLine[] {
  const rows = procs.map((p) => ({
    pid: String(p.pid),
    cpu: jitter(p.cpu),
    mem: jitter(p.mem),
    state: p.state,
    command: p.command,
  }))

  return [
    { text: 'PID    %CPU  %MEM  STAT  COMMAND', tone: 'muted', pre: true },
    ...rows.map((r) => ({
      text: `${r.pid.padEnd(7)}${r.cpu.padStart(4)}  ${r.mem.padStart(4)}  ${r.state.padEnd(4)}  ${r.command}`,
      tone: stateTone(r.state),
      pre: true,
    })),
  ]
}

/**
 * The command `strace` wraps, resolved the way a link resolves one: without the visitor's
 * aliases, so `strace ls` traces `ls` whatever `ls` is aliased to.
 */
function traced(args: readonly string[]) {
  return args.length ? resolveLink(args.join(' ')) : undefined
}

const strace: Command = {
  name: 'strace',
  usage: 'strace <command> [args]',
  description: {
    en: 'The requests a command makes, and the shape of what they carry',
    fr: 'Les requêtes d’une commande, et la forme de ce qu’elles transportent',
  },
  group: 'core',
  // It writes whatever it runs writes, so `?run=strace sign x` is refused like `sign x`.
  writes: (args) => {
    const inner = traced(args)
    return inner && inner.command.name !== 'strace' ? writesOf(inner.command, inner.args) : 'none'
  },
  linkable: (args) => {
    const inner = traced(args)
    return !!inner && inner.command.name !== 'strace' && isLinkable(inner.command, inner.args)
  },
  // The command first, then whatever that command offers: so a link's arguments are held
  // to the inner command's own list, as they would be without strace.
  complete: ({ args, index, word }) => {
    const names = visibleCommands()
      .flatMap((c) => [c.name, ...(c.aliases ?? [])])
      .filter((name) => name !== 'strace')
    // A two-word name (`git log`) is offered a word at a time, as the shell reads it.
    if (index === 0) return [...new Set(names.map((name) => name.split(' ')[0]!))]
    const inner = traced(args.slice(0, index))
    if (!inner && index === 1) return names.filter((name) => name.startsWith(`${args[0]} `)).map((name) => name.split(' ')[1]!)
    if (!inner) return []
    const consumed = index - inner.args.length
    return inner.command.complete?.({ args: args.slice(consumed), index: index - consumed, word }) ?? []
  },
  async run(ctx) {
    const inner = traced(ctx.args)
    if (!ctx.args.length) return [fail('strace: must have PROG [ARGS] or -p PID')]
    if (!inner) return [fail(`strace: Can't stat '${ctx.args[0]}': No such file or directory`)]
    if (inner.command.name === 'strace') return [fail('strace: one at a time: it would only trace itself')]

    // Only what the visitor's command asked for: the two pollers mark themselves.
    const traces: RequestTrace[] = []
    const stop = observeRequests((trace) => {
      if (!trace.background) traces.push(trace)
    })
    let exit = 0
    let killed = false
    try {
      await ctx.run(ctx.args.join(' '))
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        ctx.print(fail(String((error as Error)?.message ?? error)))
        exit = 1
      }
      killed = (error as Error)?.name === 'AbortError'
    } finally {
      stop()
    }
    // Some commands keep what they had on Ctrl+C rather than rethrowing (`ask`), so the
    // signal is the truth about whether the run was stopped.
    killed ||= ctx.signal.aborted
    // No request, no trailer: `strace ls` looks exactly like `ls`, stopped or not.
    if (traces.length) {
      ctx.print([...traces.flatMap(traceLines), line(killed ? '+++ killed by SIGINT +++' : `+++ exited with ${exit} +++`, 'muted')])
    }
    if (killed) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
  },
}

/**
 * `who` lists one row per other visitor and stops here, the same twelve the field draws
 * a shape for; the rest are one line, so the rows and the line still add up to the count.
 */
export const WHO_ROWS = 12

const UNAVAILABLE: Localised = {
  en: 'presence is unavailable right now — the count needs the live API.',
  fr: 'la présence est indisponible pour l’instant — le compte a besoin de l’API en direct.',
}

/**
 * Everyone on the site as an anonymous tty: `you` first, then `somebody` for each
 * other connection. There is nothing else to show — the stream is one integer — so
 * the rows are the count, drawn the way `who` would.
 */
async function who({ t, signal }: CommandContext): Promise<OutputLine[]> {
  const count = await whenPresent(signal)
  if (count === null) return [line(`who: ${t(UNAVAILABLE)}`, 'muted')]

  const others = Math.max(0, count - 1)
  const shown = Math.min(others, WHO_ROWS)
  const rows: OutputLine[] = [
    { text: 'you       pts/0', tone: 'primary', pre: true },
    ...Array.from({ length: shown }, (_, i) => ({ text: `somebody  pts/${i + 1}`, pre: true })),
  ]
  if (others > shown) {
    rows.push(line(t({ en: `… and ${others - shown} more`, fr: `… et ${others - shown} de plus` }), 'muted'))
  }
  const total =
    others === 0
      ? // Not "whoever arrives": a wave is a moment, and nobody who comes later hears it.
        t({
          en: 'just you here. `wall` waves at whoever is on the site when you send it.',
          fr: 'vous seul ici. `wall` fait signe à qui est sur le site quand vous l’envoyez.',
        })
      : t({
          en: `${count} here now, you included. \`wall\` waves at them.`,
          fr: `${count} personnes ici, vous compris. \`wall\` leur fait signe.`,
        })
  return [...rows, blank, line(total, 'muted')]
}

const WAVE_REPLIES: Record<WaveResult, { text: Localised; tone: Tone }> = {
  sent: {
    text: {
      // "May": the server spaces waves site-wide, and a page standing still shows no ripple.
      en: 'waved. Anyone else here may see their wireframes ripple, or a line in an open terminal.',
      fr: 'signe envoyé. Les autres ici verront peut-être leurs formes onduler, ou une ligne dans un terminal ouvert.',
    },
    tone: 'success',
  },
  alone: {
    text: { en: 'wall: nobody else is here to wave at.', fr: 'wall : personne d’autre ici à qui faire signe.' },
    tone: 'muted',
  },
  limited: {
    text: { en: 'wall: that is enough waving for a while.', fr: 'wall : assez de signes pour le moment.' },
    tone: 'warning',
  },
  off: {
    text: { en: 'wall: broadcasts are switched off here.', fr: 'wall : les diffusions sont désactivées ici.' },
    tone: 'muted',
  },
  unavailable: {
    text: { en: 'wall: the wave could not be sent right now.', fr: 'wall : le signe n’a pas pu partir pour l’instant.' },
    tone: 'error',
  },
}

// ---------------------------------------------------------------------------
// du and rm: what the site keeps in this browser (lib/storage-keys.ts)
// ---------------------------------------------------------------------------

type Group = StorageGroup | 'stale'

/** What `du` and `rm` take: `~` for everything, a group, or one key, short or whole. */
type Target = { kind: 'home' } | { kind: 'group'; group: Group } | { kind: 'key'; items: StoredItem[] }

const GROUP_IDS = STORAGE_GROUPS.map((g) => g.id)

function isHome(word: string): boolean {
  return /^~\/?$/.test(word) || new RegExp(`^/home/${profile.handle}/?$`).test(word)
}

function target(word: string, items: readonly StoredItem[]): Target | undefined {
  if (isHome(word)) return { kind: 'home' }
  if ((GROUP_IDS as string[]).includes(word)) return { kind: 'group', group: word as StorageGroup }
  const matched = items.filter((item) => item.key === word || shortName(item.key) === word)
  return matched.length ? { kind: 'key', items: matched } : undefined
}

function itemsOf(t: Target, items: readonly StoredItem[]): StoredItem[] {
  if (t.kind === 'home') return [...items]
  if (t.kind === 'group') return items.filter((item) => groupOf(item) === t.group)
  return t.items
}

/** The group ids `du` and `rm` complete, plus `~`: fixed words, so a link can name them. */
function homeAndGroups(): string[] {
  return ['~', ...GROUP_IDS]
}

/** Where Tab stops offering for `du` and `rm`: flags and a few operands, never a tenth. */
const MAX_OPERANDS = 4

const SIZE_WIDTH = 9
const VALUE_WIDTH = 40

function groupLabel(group: Group): Localised {
  return group === 'stale' ? STALE_LABEL : STORAGE_GROUPS.find((g) => g.id === group)!.label
}

/**
 * What `du` shows of a value. A secret is only its length, a stale key only its size,
 * since nothing vouches for what it holds; the rest is the visitor's own data, on one line.
 */
function shownValue(item: StoredItem, t: CommandContext['t']): string {
  if (item.entry?.secret) return t({ en: `<secret, ${item.bytes} bytes>`, fr: `<secret, ${item.bytes} octets>` })
  if (!item.entry) return `<${formatBytes(item.bytes)}>`
  const flat = item.value.replace(/\s+/g, ' ')
  return flat.length > VALUE_WIDTH ? `${flat.slice(0, VALUE_WIDTH - 1)}…` : flat
}

/** Each group present, a header and two lines a key: its size, key and value, then what it is for. */
function keyLines(items: readonly StoredItem[], t: CommandContext['t']): OutputLine[] {
  const width = items.reduce((max, item) => Math.max(max, item.key.length), 0)
  const out: OutputLine[] = []
  for (const group of [...GROUP_IDS, 'stale'] as Group[]) {
    const inGroup = items.filter((item) => groupOf(item) === group)
    if (!inGroup.length) continue
    const areas = [...new Set(inGroup.map((item) => (item.area === 'local' ? 'localStorage' : 'sessionStorage')))]
    const session = inGroup.some((item) => item.area === 'session')
    out.push(
      line(
        `${t(groupLabel(group))} · ${areas.join(', ')}${session ? t({ en: ', forgotten when the tab closes', fr: ', oubliées à la fermeture de l’onglet' }) : ''}`,
        'accent',
      ),
    )
    for (const item of inGroup) {
      out.push(
        segmented([
          { text: `  ${formatBytes(item.bytes).padEnd(SIZE_WIDTH)}` },
          { text: `${item.key.padEnd(width)}  `, tone: 'primary' },
          { text: shownValue(item, t), tone: item.entry?.secret || !item.entry ? 'muted' : 'default' },
        ]),
        { text: `  ${' '.repeat(SIZE_WIDTH)}${t(item.entry?.purpose ?? STALE_PURPOSE)}`, tone: 'muted', pre: true },
      )
    }
  }
  return out
}

function total(items: readonly StoredItem[], t: CommandContext['t']): string {
  const bytes = formatBytes(items.reduce((sum, item) => sum + item.bytes, 0))
  const n = items.length
  return t({ en: `${n} ${n === 1 ? 'key' : 'keys'}, ${bytes}`, fr: `${n} ${n === 1 ? 'clé' : 'clés'}, ${bytes}` })
}

/**
 * The service worker's caches and the browser's estimate. Neither holds anything about the
 * visitor, and the ffmpeg core isn't in either, which is the one surprise worth saying.
 */
async function cacheLines(t: CommandContext['t']): Promise<OutputLine[]> {
  const report = await cacheReport()
  const out: OutputLine[] = []
  if (report.caches?.length) {
    const width = report.caches.reduce((max, c) => Math.max(max, c.name.length), 0)
    out.push(blank, line(t({ en: 'caches · Cache Storage, the service worker’s', fr: 'caches · Cache Storage, ceux du service worker' }), 'accent'))
    for (const store of report.caches) {
      const purpose = cachePurpose(store.name)
      out.push(
        segmented([
          { text: `  ${formatBytes(store.bytes).padEnd(SIZE_WIDTH)}` },
          { text: `${store.name.padEnd(width)}  `, tone: 'primary' },
          { text: t({ en: `${store.files} files`, fr: `${store.files} fichiers` }), tone: 'muted' },
        ]),
        ...(purpose ? [{ text: `  ${' '.repeat(SIZE_WIDTH)}${t(purpose)}`, tone: 'muted' as const, pre: true }] : []),
      )
    }
    out.push(line(t(WORKBOX_NOTE), 'muted'))
  }
  if (report.usage !== null) {
    if (!report.caches?.length) out.push(blank)
    out.push(
      line(
        t({
          en: `the browser counts ${formatBytes(report.usage)} in use by this site (navigator.storage.estimate)`,
          fr: `le navigateur compte ${formatBytes(report.usage)} utilisés par ce site (navigator.storage.estimate)`,
        }),
        'muted',
      ),
    )
  }
  out.push(blank, line(t(HTTP_CACHE_NOTE).replace('{size}', formatBytes(CORE_BYTES)), 'muted'), line(t(EMBEDS_NOTE), 'muted'))
  return out
}

/**
 * Flags and operands, as GNU's getopt reads them for `du` and `rm`: the letters in `known`,
 * one to a word or clustered (`-sh`, `-rf`), anywhere on the line until `--`, after which
 * every word is an operand; a lone `-` is one too. The error is in GNU's words, for the
 * first thing it doesn't know: a long option whole, a cluster by its first unknown letter.
 */
function getopt(name: string, args: readonly string[], known: string): { flags: string; operands: string[]; error?: OutputLine } {
  let flags = ''
  const operands: string[] = []
  for (const [i, arg] of args.entries()) {
    if (arg === '--') {
      operands.push(...args.slice(i + 1))
      break
    }
    if (arg === '-' || !arg.startsWith('-')) operands.push(arg)
    else if (arg.startsWith('--')) return { flags, operands, error: fail(`${name}: unrecognized option '${arg}'`) }
    else {
      const unknown = [...arg.slice(1)].find((letter) => !known.includes(letter))
      if (unknown) return { flags, operands, error: fail(`${name}: invalid option -- '${unknown}'`) }
      flags += arg.slice(1)
    }
  }
  return { flags, operands }
}

const du: Command = {
  name: 'du',
  usage: 'du [-s] [-h] [~|<group>|<key>]',
  description: {
    en: 'What the site keeps in this browser, key by key',
    fr: 'Ce que le site garde dans ce navigateur, clé par clé',
  },
  manual: {
    description: {
      en: [
        'Lists every key the site keeps in this browser: its size, its value when it is yours to see, and what it is for. The owner’s password and a room’s host token show only their length. Then the service worker’s caches, the browser’s own estimate, and what no page can list.',
        'The groups are settings, progress, scores, shell and secrets. rm clears any of them, or one key.',
      ],
      fr: [
        'Liste chaque clé que le site garde dans ce navigateur : sa taille, sa valeur quand elle vous revient, et ce à quoi elle sert. Le mot de passe du propriétaire et le jeton d’hôte d’un salon ne montrent que leur longueur. Puis les caches du service worker, l’estimation du navigateur, et ce qu’aucune page ne peut lister.',
        'Les groupes sont settings, progress, scores, shell et secrets. rm efface n’importe lequel, ou une clé.',
      ],
    },
    options: {
      '-s': { en: 'One line per operand: its total size.', fr: 'Une ligne par opérande : sa taille totale.' },
      '-h': {
        en: 'Human-readable sizes. They always are; the flag is here for the fingers that type du -sh.',
        fr: 'Des tailles lisibles. Elles le sont toujours ; l’option est là pour les doigts qui tapent du -sh.',
      },
    },
    examples: [{ command: 'du ~' }, { command: 'du -sh scores' }],
    seeAlso: ['rm(1)', 'strace(1)'],
  },
  group: 'core',
  // Reads storage and the caches, and prints only the visitor's own data back to them.
  writes: 'none',
  linkable: true,
  // `-sh` is how fingers type it, and the form the README gives, so a link may carry it
  // too. It is offered once typed and not before, so `-s` and Tab still lands on `-s`.
  complete: ({ index, word }) =>
    index < MAX_OPERANDS ? ['-s', '-h', ...(['-sh', '-hs'].includes(word) ? [word] : []), ...homeAndGroups()] : [],
  async run({ args, t }) {
    const { flags, operands, error } = getopt('du', args, 'sh')
    if (error) return [error]
    const summary = flags.includes('s')
    const items = storedItems()
    const words = operands.length ? operands : ['~']
    const out: OutputLine[] = []
    const resolved: { word: string; target: Target }[] = []
    for (const word of words) {
      const found = target(word, items)
      if (found) resolved.push({ word, target: found })
      else out.push(fail(`du: cannot access '${word}': No such file or directory`))
    }

    if (summary) {
      for (const { word, target: found } of resolved) {
        const bytes = itemsOf(found, items).reduce((sum, item) => sum + item.bytes, 0)
        out.push(segmented([{ text: formatBytes(bytes).padEnd(SIZE_WIDTH) }, { text: word, tone: 'primary' }]))
      }
      return out
    }

    for (const { target: found } of resolved) {
      const listed = itemsOf(found, items)
      if (!listed.length) {
        out.push(line(t({ en: 'nothing stored here.', fr: 'rien de stocké ici.' }), 'muted'))
        continue
      }
      out.push(...keyLines(listed, t), line(total(listed, t), 'muted'))
    }
    if (resolved.some(({ target: found }) => found.kind === 'home')) {
      out.push(...(await cacheLines(t)))
      out.push(blank, link(t({ en: 'the same list, with a clear button per group: /privacy', fr: 'la même liste, avec un bouton d’effacement par groupe : /privacy' }), '/privacy'))
    }
    return out
  },
}

const rm: Command = {
  name: 'rm',
  usage: 'rm [-r] [-f] <key|group|~>',
  description: {
    en: 'Clear what the site keeps in this browser',
    fr: 'Effacer ce que le site garde dans ce navigateur',
  },
  manual: {
    description: {
      en: [
        'Removes one key, or every key in a group, from this browser, and with -r and ~ everything the site keeps. du lists what there is. It prints what it removed, then reloads the page: achievements, the language and the colour scheme are read once at load, and the history is written back after every line, so a page that carried on would put back what was just removed.',
        'The fake files cat reads are not yours to remove.',
      ],
      fr: [
        'Retire une clé, ou toutes les clés d’un groupe, de ce navigateur, et avec -r et ~ tout ce que le site garde. du liste ce qu’il y a. Il affiche ce qu’il a retiré, puis recharge la page : les succès, la langue et le jeu de couleurs sont lus une fois au chargement, et l’historique est réécrit après chaque ligne, si bien qu’une page qui continuerait remettrait ce qui vient d’être retiré.',
        'Les faux fichiers que lit cat ne sont pas à vous.',
      ],
    },
    options: {
      '-r': {
        en: 'Recursive: needed for ~, which holds every group. A group itself needs no -r.',
        fr: 'Récursif : nécessaire pour ~, qui contient tous les groupes. Un groupe n’en a pas besoin.',
      },
      '-f': {
        en: 'Say nothing about what isn’t there.',
        fr: 'Ne rien dire de ce qui n’existe pas.',
      },
    },
    examples: [{ command: 'rm history' }, { command: 'rm scores' }, { command: 'rm -rf ~' }],
    seeAlso: ['du(1)', 'sudo(6)'],
  },
  group: 'core',
  // Clears the visitor's own data and reloads: never from a link, and a `!!` that
  // becomes one waits in history for Enter.
  writes: 'local',
  complete: ({ index }) => (index < MAX_OPERANDS ? [...homeAndGroups(), ...new Set(storedItems().map((item) => shortName(item.key)))] : []),
  async run({ args, t, print }) {
    const { flags, operands, error } = getopt('rm', args, 'rRf')
    if (error) return [error]
    const recursive = /[rR]/.test(flags)
    const force = flags.includes('f')
    // GNU's `rm -f` with nothing to remove has nothing to say either.
    if (!operands.length) return force ? [] : [fail('rm: missing operand'), line("Try 'rm --help' for more information.", 'muted')]

    const items = storedItems()
    const out: OutputLine[] = []
    const doomed = new Map<string, StoredItem>()
    for (const word of operands) {
      // GNU rm's own failsafe, word for word. `sudo` parses its own arguments, so
      // `sudo rm -rf /` never gets here and keeps its joke.
      if (word === '/' && recursive) {
        out.push(fail("rm: it is dangerous to operate recursively on '/'"), fail('rm: use --no-preserve-root to override this failsafe'))
        continue
      }
      if (word === '/' || (isHome(word) && !recursive)) {
        out.push(fail(`rm: cannot remove '${word}': Is a directory`))
        continue
      }
      const found = target(word, items)
      const listed = found ? itemsOf(found, items) : []
      // An empty group, or an empty home, is there; it just holds nothing.
      if (found && !listed.length) {
        if (!force) out.push(line(t({ en: `rm: nothing stored in '${word}'`, fr: `rm : rien de stocké dans '${word}'` }), 'muted'))
        continue
      }
      if (!listed.length) {
        // The files `cat` reads are the site's, not the visitor's.
        if (resolveFileLines(word, t)) out.push(fail(`rm: cannot remove '${word}': Permission denied`))
        else if (!force) out.push(fail(`rm: cannot remove '${word}': No such file or directory`))
        continue
      }
      for (const item of listed) doomed.set(`${item.area}:${item.key}`, item)
    }

    const removed = removeItems([...doomed.values()])
    if (!removed.length) return out
    out.push(...removed.map((item) => line(`removed '${item.key}'`)))
    out.push(
      line(
        t({
          en: `${total(removed, t)} cleared. Reloading, so nothing on screen keeps an old copy…`,
          fr: `${total(removed, t)} ${removed.length === 1 ? 'effacée' : 'effacées'}. Rechargement, pour que rien à l’écran n’en garde une vieille copie…`,
        }),
        'success',
      ),
    )
    // Printed now, because the command never returns: `reloadPage` doesn't settle, so the
    // shell never writes this line back into the history it just cleared. As remarks
    // (`stderr`), which reach the screen from the left of a `|` too: no next stage ever
    // reads what a command that doesn't return wrote, and the page is about to go.
    print(out.map((l) => ({ ...l, stderr: true })))
    await reloadPage()
  },
}

export const systemCommands: Command[] = [
  systemctl,
  strace,
  du,
  rm,
  {
    name: 'who',
    description: { en: 'Who else is on the site, as anonymous ttys', fr: 'Qui d’autre est sur le site, en ttys anonymes' },
    group: 'live',
    writes: 'none',
    linkable: true,
    run: who,
  },
  {
    name: 'wall',
    usage: 'wall',
    description: { en: 'Wave at everyone else on the site', fr: 'Faire signe à tout le monde sur le site' },
    group: 'live',
    // A POST that makes every other visitor's page react: never from a link.
    writes: 'server',
    async run({ args, t, signal }) {
      // A real `wall` broadcasts its arguments. This one carries no text at all, so
      // any it was given are named as dropped rather than silently ignored.
      const dropped = args.length
        ? [line(t({ en: 'messages are not carried — only the wave', fr: 'les messages ne sont pas transmis — seulement le signe' }), 'muted')]
        : []
      const reply = WAVE_REPLIES[await sendWave(signal)]
      // A wave that couldn't leave is the one failure: `wall && …` stops on it, as on any
      // other fail(); off, limited and alone are answers, not errors.
      return [...dropped, reply.tone === 'error' ? fail(t(reply.text)) : line(t(reply.text), reply.tone)]
    },
  },
  {
    name: 'ps',
    aliases: ['ps aux', 'ps -ef'],
    description: { en: 'Snapshot of running processes', fr: 'Instantané des processus' },
    group: 'fun',
    writes: 'none',
    hidden: true,
    run() {
      return [line(`USER: ${profile.handle}`, 'muted'), ...table(processes())]
    },
  },
  {
    name: 'top',
    aliases: ['htop'],
    description: { en: 'Live-ish process monitor', fr: 'Moniteur de processus en direct' },
    group: 'fun',
    writes: 'none',
    hidden: true,
    async run(ctx) {
      // One frame with motion paused (reduced motion forces that); `calm` keeps a typed
      // command's own animation.
      const frames = decorativeMotion() === 'paused' ? 1 : 6
      // Redraws one table in place. It used to `clear()` between frames, which
      // stopped the frames stacking but took the whole scrollback with them.
      const draw = ctx.frame()

      for (let i = 0; i < frames; i++) {
        // Deliberately not reshuffled per frame: with a full repaint the churn
        // read as "live", but redrawing in place just teleports the rows. The
        // jittered %CPU/%MEM is what sells it now.
        const procs = processes()
        // Stage 6 of the CTF chain (terminal/ctf.ts): a process that only exists on
        // the last frame, so only someone who watched `top` to the end sees it —
        // never `ps`. With motion paused there is one frame, which is the last.
        if (i === frames - 1) procs.push(GHOST)
        const load = (Math.random() * 1.5).toFixed(2)
        draw([
          line(
            `top - ${new Date().toLocaleTimeString(ctx.locale === 'fr' ? 'fr-FR' : 'en-GB')} up ${uptime()}, load average: ${load}`,
            'accent',
          ),
          line(
            `Tasks: ${procs.length} total, ${procs.filter((p) => p.state === 'R').length} running, ${procs.filter((p) => p.state === 'S').length} sleeping, ${procs.filter((p) => p.state === 'Z').length} zombie`,
            'muted',
          ),
          blank,
          ...table(procs),
        ])
        if (i < frames - 1) await sleep(700, ctx.signal)
      }

      return [
        blank,
        line('(press q to quit — well, you already did)', 'muted'),
        ...announce('htop', ctx.t),
      ]
    },
  },
  {
    name: 'env',
    aliases: ['printenv', 'export'],
    description: { en: 'Print the environment', fr: "Afficher l'environnement" },
    group: 'fun',
    writes: 'none',
    hidden: true,
    run({ raw, args, t }) {
      // `export FOO=bar` looks like it should work, so it gets a real answer
      // rather than silently printing the list it was not asked for.
      if (raw.trim().startsWith('export') && args.length > 0) {
        return [
          fail('export: this environment is read-only.'),
          line(`(it is also entirely made up — see \`cat ${ENV_FILE}\`)`, 'muted'),
        ]
      }

      return [
        ...envAssignments(raw.trim().startsWith('export') ? 'declare -x ' : ''),
        blank,
        line(
          t({
            en: 'none of these are real. obviously.',
            fr: 'aucune de ces valeurs n’est réelle. évidemment.',
          }),
          'muted',
        ),
      ]
    },
  },
  {
    name: 'achievements',
    aliases: ['trophies'],
    usage: 'achievements',
    description: { en: 'Your progress finding secrets', fr: 'Votre progression' },
    group: 'fun',
    writes: 'none',
    linkable: true,
    palette: true,
    run({ t }) {
      const total = achievementList.length
      const out: OutputLine[] = [
        line(`🏆 achievements — ${unlockedCount()}/${total} unlocked`, 'accent'),
        blank,
      ]

      for (const achievement of achievementList) {
        out.push(
          isUnlocked(achievement.id)
            ? {
                text: `  ✓ ${t(achievement.title).padEnd(24)}  ${t(achievement.description)}`,
                tone: 'success',
                pre: true,
              }
            : { text: `  ✗ ${'???'.padEnd(24)}  ${t(achievement.hint)}`, tone: 'muted', pre: true },
        )
      }

      out.push(blank, line('poke around the terminal — `help --all` will not spoil these.', 'muted'))
      return out
    },
  },
]
