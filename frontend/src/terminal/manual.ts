import { julesManual, profile, type Localised, type ManPage } from '@/content'
import { blank, line, pre, wrap } from './format'
import type { Command, OutputLine } from './types'

/**
 * Manual pages for every command, generated from what the command already says about
 * itself (`usage`, `description`, `aliases`, `group`) plus whatever its `manual` adds. So a
 * new command has a page the day it lands, and `manual.spec.ts` holds the parts that can't
 * be generated (the OPTIONS text for each flag in its usage) to exist in both languages.
 *
 * Nothing here imports the registry, which would join its import cycle: the caller hands in
 * the commands.
 */

type T = <V>(value: Localised<V>) => V

const WIDTH = 72
const INDENT = '       '

/** Section 6 is games and the rest of the fun, as in a real manual. */
export function sectionOf(command: Command): 1 | 6 {
  return command.group === 'fun' ? 6 : 1
}

/** The flags a usage names: `ls [-a] [path]` has `-a`; `head [-n N | -N]` has `-n` and `-N`. */
export function flagsOf(command: Command): string[] {
  const usage = command.usage ?? ''
  return [...new Set([...usage.matchAll(/(?<=^|[\s[|])(--?[A-Za-z][\w-]*)(?=$|[\s\]|])/g)].map((m) => m[1]!))]
}

export function manualFor(command: Command): ManPage {
  const extra = command.manual ?? {}
  const aliases = command.aliases?.length ? command.aliases : undefined
  const description = extra.description ?? { en: [command.description.en], fr: [command.description.fr] }
  return {
    name: command.name,
    section: sectionOf(command),
    summary: command.description,
    synopsis: [command.usage ?? command.name],
    description: aliases
      ? {
          en: [...description.en, `Also answers to ${aliases.join(', ')}.`],
          fr: [...description.fr, `Répond aussi à ${aliases.join(', ')}.`],
        }
      : description,
    options: flagsOf(command).map((flag) => ({ flag, text: extra.options?.[flag] ?? { en: '', fr: '' } })),
    examples: [{ command: command.usage ?? command.name }, ...(extra.examples ?? [])],
    seeAlso: extra.seeAlso ?? ['help(1)'],
  }
}

/** The page `man [section] <name>` means, from these commands, or `jules(1)`. */
export function findPage(name: string, section: number | undefined, commands: readonly Command[]): ManPage | undefined {
  const word = name.toLowerCase()
  if (word === 'jules') return section === undefined || section === 1 ? julesManual() : undefined
  const command = commands.find((c) => c.name === word || c.aliases?.includes(word))
  if (!command || (section !== undefined && sectionOf(command) !== section)) return undefined
  return manualFor(command)
}

const heading = (text: string): OutputLine => line(text.toUpperCase(), 'primary')
const body = (text: string, indent = INDENT): OutputLine[] =>
  wrap(text, WIDTH - indent.length).map((row) => pre(`${indent}${row}`))

/** A page as `man` prints it: the header, the sections in a manual's order, the footer. */
export function renderManual(page: ManPage, t: T): OutputLine[] {
  const title = `${page.name.toUpperCase()}(${page.section})`
  const middle = t({ en: 'couvsh manual', fr: 'manuel couvsh' })
  const gap = Math.max(1, Math.floor((WIDTH - title.length * 2 - middle.length) / 2))
  const out: OutputLine[] = [pre(`${title}${' '.repeat(gap)}${middle}${' '.repeat(gap)}${title}`, 'muted'), blank]

  out.push(heading(t({ en: 'Name', fr: 'Nom' })), ...body(`${page.name} — ${t(page.summary)}`), blank)
  out.push(heading(t({ en: 'Synopsis', fr: 'Synopsis' })), ...page.synopsis.map((s) => pre(`${INDENT}${s}`, 'accent')), blank)
  out.push(heading(t({ en: 'Description', fr: 'Description' })))
  for (const [i, paragraph] of t(page.description).entries()) out.push(...(i ? [blank] : []), ...body(paragraph))
  out.push(blank)

  if (page.options?.length) {
    out.push(heading(t({ en: 'Options', fr: 'Options' })))
    for (const option of page.options) out.push(pre(`${INDENT}${option.flag}`, 'accent'), ...body(t(option.text), `${INDENT}       `))
    out.push(blank)
  }
  for (const section of page.sections ?? []) {
    out.push(heading(t(section.heading)), ...t(section.lines).flatMap((text) => body(text)), blank)
  }
  if (page.examples?.length) {
    out.push(heading(t({ en: 'Examples', fr: 'Exemples' })))
    for (const example of page.examples) {
      out.push(pre(`${INDENT}$ ${example.command}`))
      if (example.text) out.push(...body(t(example.text), `${INDENT}  `).map((row) => ({ ...row, tone: 'muted' as const })))
    }
    out.push(blank)
  }
  out.push(heading(t({ en: 'See also', fr: 'Voir aussi' })), pre(`${INDENT}${page.seeAlso.join(', ')}`), blank)
  out.push(pre(`${profile.domain}${' '.repeat(Math.max(1, WIDTH - profile.domain.length - title.length))}${title}`, 'muted'))
  return out
}

/** What `<command> --help` prints: the usage, what it does, and its flags. */
export function renderUsage(command: Command, t: T): OutputLine[] {
  const page = manualFor(command)
  const width = Math.max(0, ...(page.options ?? []).map((o) => o.flag.length))
  return [
    pre(`usage: ${page.synopsis[0]}`, 'accent'),
    line(`  ${t(command.description)}`),
    ...(page.options ?? []).map((o) => pre(`  ${o.flag.padEnd(width)}  ${t(o.text)}`, 'muted')),
    line(t({ en: `man ${command.name} for the manual page`, fr: `man ${command.name} pour la page de manuel` }), 'muted'),
  ]
}
