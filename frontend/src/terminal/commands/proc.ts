import { profile } from '@/content'
import type { Localised } from '@/content/types'
import { usePresence } from '@/composables/usePresence'
import { uptimeSeconds } from '@/composables/useStatus'
import { browserEnvironment } from '@/tools/fingerprint/environment'
import { NOT_AVAILABLE, SHELL_GROUPS, readNow } from '@/tools/fingerprint/fingerprint'
import { line, link, pre, segmented } from '../format'
import type { OutputLine } from '../types'

type TFunction = <T>(value: Localised<T>) => T

/**
 * `/proc`, without a shaped filesystem behind it: `resolveFileLines()` hands any
 * `/proc/…` path here, as it already answered `/etc/shadow` by its absolute path, and
 * `ls` asks `listProc()` before it reads a path as a page. Every file reads something
 * real, and only when it is read: nothing here runs at import or on Tab.
 */

/** `uname`'s line, which `proc.spec.ts` holds to the command's own output. */
const UNAME = `couvsh 1.0 ${profile.domain} x86_64 GNU/Portfolio`

const TOP = ['loadavg', 'uptime', 'version'] as const

/** Every file under `/proc`, as `cat` completes them once the word reaches into it. */
export function procFiles(): string[] {
  return [...TOP.map((name) => `/proc/${name}`), ...SHELL_GROUPS.map((group) => `/proc/self/${group}`)]
}

export function isProcPath(path: string): boolean {
  return path === '/proc' || path.startsWith('/proc/')
}

/**
 * An absolute path with its `.` and `..` folded, when it ends up in `/proc`: what `ls`
 * lists. Folding first is what leaves `/proc/..` and `/proc/../tools` to `shellPath()`,
 * which reads them as home and the tools, as `cd` does; matching the path as typed
 * refused both. `/proc/self/..` is `/proc`.
 */
export function procPath(path: string): string | undefined {
  if (!path.startsWith('/')) return undefined
  const segments: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '..') segments.pop()
    else if (segment && segment !== '.') segments.push(segment)
  }
  const folded = `/${segments.join('/')}`
  return isProcPath(folded) ? folded : undefined
}

/** What `ls` prints for a `/proc` path `procPath()` folded: a directory's entries, a
 *  file's own name. */
export function listProc(target: string): OutputLine[] | undefined {
  if (target === '/proc') return [pre('self/', 'primary'), ...TOP.map((name) => pre(name))]
  if (target === '/proc/self') return SHELL_GROUPS.map((group) => pre(group))
  return procFiles().includes(target) ? [pre(target)] : undefined
}

/**
 * The real format's two figures: seconds up, then seconds idle. Up counts from the
 * first commit, as `neofetch` does; idle is that less the time this tab has been open,
 * the one stretch the site can be sure it wasn't idle.
 */
function uptimeLine(): OutputLine {
  const up = uptimeSeconds()
  const idle = Math.max(0, up - performance.now() / 1000)
  return pre(`${up.toFixed(2)} ${idle.toFixed(2)}`)
}

/**
 * The people on the site now, in loadavg's fields: the count as all three averages,
 * since presence keeps no history to average, and `1/N`, you among them. Only when the
 * stream is already open (the home page's footer, or `who`, opens it): reading a file
 * must not connect anything, so `strace cat /proc/loadavg` stays empty.
 */
function loadavg(t: TFunction): OutputLine[] {
  const count = usePresence().online.value
  if (count === null) {
    return [
      line(
        t({
          en: 'presence isn’t connected on this page, and reading a file won’t connect it: `who` does.',
          fr: 'la présence n’est pas connectée sur cette page, et lire un fichier ne la connecte pas : `who` le fait.',
        }),
        'muted',
      ),
    ]
  }
  const figure = count.toFixed(2)
  return [
    pre(`${figure} ${figure} ${figure} 1/${count}`),
    line(
      t({
        en: `${count} on the site now, you included. Presence keeps no history, so the three averages are one figure.`,
        fr: `${count} sur le site en ce moment, vous compris. La présence ne garde aucun historique, donc les trois moyennes sont un seul chiffre.`,
      }),
      'muted',
    ),
  ]
}

/** One of the fingerprint tool's groups, read from its module as the panel reads it. */
function selfFile(group: (typeof SHELL_GROUPS)[number], t: TFunction): OutputLine[] {
  const rows = readNow(browserEnvironment(), [group])
  const width = Math.max(...rows.map((row) => row.id.length)) + 2
  return [
    ...rows.map((row) =>
      segmented([
        { text: row.id.padEnd(width), tone: 'primary' },
        row.value === null ? { text: t(NOT_AVAILABLE), tone: 'muted' } : { text: row.value },
      ]),
    ),
    link(
      t({
        en: 'what each one is, and whether a site needs it: /tools/fingerprint',
        fr: 'ce que chacun est, et si un site en a besoin : /tools/fingerprint',
      }),
      '/tools/fingerprint',
    ),
  ]
}

export function resolveProcFile(path: string, t: TFunction): OutputLine[] | undefined {
  switch (path) {
    case '/proc/version':
      return [pre(`${UNAME} #${__BUILD_SHA__} ${__BUILD_TIME__}`)]
    case '/proc/uptime':
      return [uptimeLine()]
    case '/proc/loadavg':
      return loadavg(t)
  }
  const name = /^\/proc\/self\/([a-z]+)$/.exec(path)?.[1]
  const group = SHELL_GROUPS.find((candidate) => candidate === name)
  return group ? selfFile(group, t) : undefined
}
