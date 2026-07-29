import type { Plugin } from 'vite'
import { profile } from '../src/content/profile'
import { skills } from '../src/content/skills'
import { projects } from '../src/content/projects'
import { socials } from '../src/content/contact'
import { music } from '../src/content/music'

/**
 * Emits `resume.txt` — the ANSI-coloured résumé that `curl jhemery.xyz` returns.
 *
 * Generated from `src/content` at build time rather than served by the API, so the
 * résumé has exactly one source. The cost is that it only refreshes on a frontend
 * deploy, which is fine for a résumé.
 */

const ESC = '\u001b['
const RESET = `${ESC}0m`
const GREEN = `${ESC}38;5;46m`
const CYAN = `${ESC}38;5;51m`
const DIM = `${ESC}2m`
const BOLD = `${ESC}1m`

const WIDTH = 76

function rule(char = '─'): string {
  return `${DIM}${char.repeat(WIDTH)}${RESET}`
}

function section(title: string): string {
  return `${BOLD}${GREEN}${title.toUpperCase()}${RESET}`
}

function wrap(text: string, indent = 2, width = WIDTH - 2): string {
  const pad = ' '.repeat(indent)
  const out: string[] = []
  let current = ''

  for (const word of text.split(/\s+/)) {
    if (!current) current = word
    else if (current.length + 1 + word.length <= width) current += ` ${word}`
    else {
      out.push(pad + current)
      current = word
    }
  }
  if (current) out.push(pad + current)
  return out.join('\n')
}

export function buildResume(): string {
  const lines: string[] = []

  lines.push('')
  lines.push(`${BOLD}${GREEN}  ${profile.name}${RESET}  ${DIM}(${profile.alias})${RESET}`)
  lines.push(
    `  ${CYAN}${profile.role.en}${RESET} ${DIM}·${RESET} ${profile.employer} ${DIM}·${RESET} ${profile.location}`,
  )
  lines.push('')
  lines.push(rule())
  lines.push('')

  lines.push(section('about'))
  for (const paragraph of profile.bio.en) {
    lines.push(wrap(paragraph))
    lines.push('')
  }
  lines.push(`  ${DIM}Languages:${RESET} ${profile.languages.en}`)
  lines.push('')

  lines.push(section('stack'))
  lines.push(wrap(skills.join('  ·  ')))
  lines.push('')

  lines.push(section('projects'))
  for (const project of projects) {
    lines.push(`  ${CYAN}${project.name}${RESET} ${DIM}[${project.status}]${RESET}`)
    lines.push(wrap(project.description.en, 4))
    lines.push(`    ${DIM}${project.stack.join(' · ')}${RESET}`)
    if (project.repo) lines.push(`    ${project.repo}`)
    lines.push('')
  }

  lines.push(section('music'))
  lines.push(wrap(`${music.genres.join(', ')} — ${music.playlistUrl}`))
  lines.push('')

  lines.push(section('links'))
  const labelWidth = socials.reduce((max, s) => Math.max(max, s.label.length), 0)
  for (const social of socials) {
    lines.push(`  ${GREEN}${social.label.padEnd(labelWidth)}${RESET}  ${social.href}`)
  }
  lines.push('')
  lines.push(rule())
  lines.push(
    `${DIM}  You are reading the curl version. The full site is at https://${profile.domain}${RESET}`,
  )
  lines.push('')

  return lines.join('\n')
}

export function resumePlugin(): Plugin {
  return {
    name: 'couvbat-resume',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'resume.txt',
        source: buildResume(),
      })
    },
    // The emitted asset only exists after a build; serve it in dev so
    // `curl localhost:5173/resume.txt` behaves the same as production.
    configureServer(server) {
      server.middlewares.use('/resume.txt', (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(buildResume())
      })
    },
  }
}
