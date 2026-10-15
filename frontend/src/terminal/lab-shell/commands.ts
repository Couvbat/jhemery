import { servicesOn } from '@/content/lab'
import type { Localised } from '@/content/types'
import { celsius, gigabytes, percent, snapshotOf, uptime as uptimeWords } from '@/lib/lab'
import { line } from '../format'
import type { OutputLine } from '../types'
import { LAB_USER, motd, ramMb, sampleOf, spec, specsOf, tr, type LabSession } from './session'

/**
 * What the lab shell answers, one entry per word. Not site commands: no registry, no
 * `help`, none of its invariants. Each reads the session's report through `lib/lab.ts`
 * and the spec sheet, and a machine without the hardware answers as one would: no
 * `nvidia-smi` on optimus. `exit`, `ssh` and `glances` are the loop's, in `index.ts`.
 */

export type LabShellCommand = (args: string[], session: LabSession) => OutputLine[]

const NO_READING: Localised = {
  en: 'no live reading: the feed is off',
  fr: 'pas de mesure en direct : le flux est coupé',
}

const notFound = (name: string): OutputLine[] => [line(`bash: ${name}: command not found`, 'error')]

const noReading = (name: string, session: LabSession): OutputLine[] => [
  line(`${name}: ${tr(session, NO_READING)}`, 'warning'),
]

/** Pads each row's cells to the widest in its column, as the real tools' tables are. */
function table(rows: string[][]): OutputLine[] {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((row) => row[i]!.length)))
  return rows.map((row, r) => ({
    text: row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]! + 3))).join(''),
    tone: r === 0 ? 'muted' : 'default',
    pre: true,
  }))
}

const hasGpu = (session: LabSession) => spec(session.host, 'GPU') !== undefined
const runsOllama = (session: LabSession) => servicesOn(session.host.id).some((node) => node.id === 'ollama')

function uptime(_: string[], session: LabSession): OutputLine[] {
  const sample = sampleOf(session)
  const taken = snapshotOf(session.report)?.takenAt
  if (!sample?.uptimeSeconds || !taken) return noReading('uptime', session)
  const clock = new Date(taken).toISOString().slice(11, 19)
  const load = sample.load !== undefined ? `, load average: ${sample.load.toFixed(2)}` : ''
  return [line(`${clock} up ${uptimeWords(sample.uptimeSeconds, session.locale)}${load}`)]
}

function free(_: string[], session: LabSession): OutputLine[] {
  const { locale } = session
  const total = ramMb(session.host)
  if (total === undefined) return noReading('free', session)
  const used = sampleOf(session)?.memory
  const rows = [
    ['', 'total', 'used', 'free'],
    [
      'Mem:',
      gigabytes(total, locale),
      used !== undefined ? gigabytes((total * used) / 100, locale) : '?',
      used !== undefined ? gigabytes((total * (100 - used)) / 100, locale) : '?',
    ],
  ]
  return [...table(rows), ...(used === undefined ? noReading('free', session) : [])]
}

function zpool(args: string[], session: LabSession): OutputLine[] {
  const { locale } = session
  const sub = args[0]
  if (sub !== 'status' && sub !== 'list') return [line('usage: zpool <status|list>', 'error')]
  if (!snapshotOf(session.report)) return noReading('zpool', session)
  const pools = sampleOf(session)?.pools ?? []
  if (!pools.length) return [line('no pools available')]
  if (sub === 'list') {
    return table([
      ['NAME', 'CAP', 'HEALTH'],
      ...pools.map((pool) => [pool.name, percent(pool.used * 100, locale), pool.health ?? '-']),
    ])
  }
  return pools.flatMap((pool, i) => [
    ...(i ? [line('')] : []),
    line(`  pool: ${pool.name}`, 'primary'),
    line(` state: ${pool.health ?? (locale === 'fr' ? 'inconnu (seul le remplissage est publié)' : 'unknown (only the fill is on the feed)')}`, pool.health && pool.health !== 'ONLINE' ? 'warning' : 'default'),
    line(`   cap: ${percent(pool.used * 100, locale)} ${locale === 'fr' ? 'occupé' : 'used'}`),
    ...(pool.health === 'ONLINE' ? [line('errors: No known data errors')] : []),
  ])
}

function nvidiaSmi(_: string[], session: LabSession): OutputLine[] {
  if (!hasGpu(session)) return notFound('nvidia-smi')
  const { locale } = session
  const name = spec(session.host, 'GPU')!
  const sample = sampleOf(session)
  const gpu = sample?.gpu
  if (!gpu) return [line(`GPU 0: ${name}`, 'primary'), ...noReading('nvidia-smi', session)]
  const figures = [
    `util ${percent(gpu.util, locale)}`,
    `VRAM ${gigabytes(gpu.vramUsedMb, locale)} / ${gigabytes(gpu.vramTotalMb, locale)}`,
    ...(sample.tempC?.gpu !== undefined ? [celsius(sample.tempC.gpu)] : []),
    ...(gpu.powerW !== undefined ? [`${Math.round(gpu.powerW)} W`] : []),
  ]
  return [line(`GPU 0: ${name}`, 'primary'), line(figures.join(' · '))]
}

const OLLAMA_RUN: Localised = {
  en: 'the real one is wired to `ask`. exit and try `ask <question>`.',
  fr: 'le vrai est branché sur `ask`. sortez et essayez `ask <question>`.',
}

function ollama(args: string[], session: LabSession): OutputLine[] {
  if (!runsOllama(session)) return notFound('ollama')
  const { locale } = session
  const sub = args[0]
  if (sub === 'run') return [line(tr(session, OLLAMA_RUN), 'accent')]
  if (sub !== 'ps' && sub !== 'list') return [line('usage: ollama <ps|list|run>', 'error')]
  const models = snapshotOf(session.report)?.models
  if (!models) return noReading('ollama', session)
  if (models.runtime !== 'up') return [line('Error: could not connect to ollama app, is it running?', 'error')]
  return sub === 'ps'
    ? table([['NAME', 'SIZE'], ...models.resident.map((m) => [m.name, gigabytes(m.vramMb, locale)])])
    : table([['NAME', 'SIZE'], ...models.installed.map((m) => [m.name, gigabytes(m.sizeGb * 1024, locale)])])
}

function docker(args: string[], session: LabSession): OutputLine[] {
  if (args[0] !== 'ps') return [line('usage: docker ps', 'error')]
  const fr = session.locale === 'fr'
  const count = sampleOf(session)?.containers
  const services = servicesOn(session.host.id).map((node) => node.name)
  return [
    count !== undefined
      ? line(fr ? `${count} conteneurs en marche — leurs noms ne sont pas publiés` : `${count} containers running — their names stay off the public feed`)
      : noReading('docker', session)[0]!,
    ...(services.length
      ? [line(`${fr ? 'ce que la carte place ici' : 'what the map puts here'}: ${services.join(', ')}`, 'muted')]
      : []),
  ]
}

function neofetch(_: string[], session: LabSession): OutputLine[] {
  const { host, locale } = session
  const specs = specsOf(host)
  const sample = sampleOf(session)
  const total = ramMb(host)
  const title = `${LAB_USER}@${host.id}`
  const rows: Array<[string, string | undefined]> = [
    ['OS', specs?.os],
    ['Host', spec(host, 'Model') ?? spec(host, 'Motherboard')],
    ['Uptime', sample?.uptimeSeconds !== undefined ? uptimeWords(sample.uptimeSeconds, locale) : undefined],
    ['CPU', [spec(host, 'CPU'), sample?.cpu !== undefined ? percent(sample.cpu, locale) : undefined].filter(Boolean).join(' · ')],
    ['GPU', spec(host, 'GPU')],
    [
      'Memory',
      total !== undefined
        ? sample?.memory !== undefined
          ? `${gigabytes((total * sample.memory) / 100, locale)} / ${gigabytes(total, locale)}`
          : gigabytes(total, locale)
        : undefined,
    ],
    ['Disk', spec(host, 'SSD')],
  ]
  return [
    line(title, 'primary'),
    line('-'.repeat(title.length), 'muted'),
    ...rows.filter(([, value]) => value).map(([key, value]) => ({ text: `${key}: ${value}`, segments: [{ text: `${key}: `, tone: 'primary' as const }, { text: value! }], pre: true })),
  ]
}

const SUDO: Localised = {
  en: `${LAB_USER} is not in the sudoers file. This incident will be reported.`,
  fr: `${LAB_USER} n’est pas dans le fichier sudoers. Cet incident sera signalé.`,
}

const RM: Localised = {
  en: 'nice try. this shell can’t delete anything; it can barely read.',
  fr: 'bien essayé. ce shell ne peut rien effacer ; il sait à peine lire.',
}

const DOTFILES = ['.bash_history', '.bashrc', '.ssh']

function cat(args: string[], session: LabSession): OutputLine[] {
  const file = args[0]
  if (!file) return [line('usage: cat <file>', 'error')]
  if (file === '/etc/motd') return motd(session)
  return [line(`cat: ${file}: ${DOTFILES.includes(file) ? 'Permission denied' : 'No such file or directory'}`, 'error')]
}

export const labShellCommands: Record<string, LabShellCommand> = {
  uptime,
  free,
  zpool,
  'nvidia-smi': nvidiaSmi,
  ollama,
  docker,
  neofetch,
  cat,
  hostname: (_, session) => [line(session.host.id)],
  whoami: () => [line(LAB_USER)],
  pwd: () => [line(`/home/${LAB_USER}`)],
  ls: () => [line(DOTFILES.join('  '), 'accent')],
  sudo: (_, session) => [line(tr(session, SUDO), 'error')],
  rm: (_, session) => [line(tr(session, RM), 'warning')],
}

/** One line typed at the lab's prompt, answered. Anything not in the table is not found. */
export function answer(input: string, session: LabSession): OutputLine[] {
  const [name = '', ...args] = input.trim().split(/\s+/)
  if (!name) return []
  const command = Object.hasOwn(labShellCommands, name) ? labShellCommands[name] : undefined
  return command ? command(args, session) : notFound(name)
}
