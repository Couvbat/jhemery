import type { Plugin } from 'vite'
import { profile } from '../src/content/profile'
import { skillNames, skills } from '../src/content/skills'
import { projects } from '../src/content/projects'
import { socials } from '../src/content/contact'
import { music } from '../src/content/music'
import { now, staleDays } from '../src/content/now'
import { sectionIds } from '../src/content/sections'
import { isExternal, pick, type Locale, type Localised } from '../src/content/types'

/**
 * Emits the résumés generated from `src/content` at build time:
 *
 * - `resume.txt` — the ANSI-coloured one `curl jhemery.xyz` returns;
 * - `resume.html` and `resume.fr.html` — static markup with a print stylesheet, so
 *   "Save as PDF" gives a clean CV and a crawler gets real HTML. No script and no
 *   SPA: they are documents, not pages of the app;
 * - `resume.css` — their stylesheet, a file of its own so the CSP's `style-src 'self'`
 *   covers it with nothing added;
 * - `content.json` — the same content as data, which the backend's MCP endpoint reads.
 *
 * Generated rather than served by the API, so the résumé has exactly one source. The
 * cost is that it only refreshes on a frontend deploy, which is fine for a résumé.
 */

const ESC = '\u001b['
const RESET = `${ESC}0m`
const GREEN = `${ESC}38;5;46m`
const CYAN = `${ESC}38;5;51m`
const DIM = `${ESC}2m`
const BOLD = `${ESC}1m`
/** SGR 8/28: text a terminal is told not to draw. `cat -v` draws it anyway. */
const CONCEAL = `${ESC}8m`
const REVEAL = `${ESC}28m`

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
  lines.push(`  ${profile.availability.open ? GREEN : DIM}${profile.availability.note.en}${RESET}`)
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
  lines.push(wrap(skillNames.join('  ·  ')))
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
  lines.push(`${DIM}  A printable one is at https://${profile.domain}/resume.html${RESET}`)
  // Stage 3 of the CTF chain (src/terminal/ctf.ts): present in every byte `curl`
  // receives, invisible in any terminal that honours SGR 8. Only here, never in the
  // terminal's own `curl`, which renders the résumé from the content instead.
  lines.push(`${CONCEAL}  CTF{e883c12a903c4432} - next: cat /etc/shadow${REVEAL}`)
  lines.push('')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// The printable résumé
// ---------------------------------------------------------------------------

/** The file a locale's printable résumé is published as. */
export function resumeHtmlFile(locale: Locale): string {
  return locale === 'fr' ? 'resume.fr.html' : 'resume.html'
}

const HTML_LABELS = {
  title: { en: 'Résumé', fr: 'CV' },
  about: { en: 'About', fr: 'À propos' },
  languages: { en: 'Languages', fr: 'Langues' },
  stack: { en: 'Stack', fr: 'Compétences' },
  projects: { en: 'Projects', fr: 'Projets' },
  music: { en: 'Music', fr: 'Musique' },
  links: { en: 'Links', fr: 'Liens' },
  source: { en: 'source', fr: 'code' },
  live: { en: 'live', fr: 'en ligne' },
  print: {
    en: 'Print this page, or save it as a PDF, from your browser’s print dialog.',
    fr: 'Imprimez cette page, ou enregistrez-la en PDF, depuis la boîte d’impression du navigateur.',
  },
  other: { en: 'Version française', fr: 'English version' },
  site: { en: 'The full site', fr: 'Le site complet' },
  status: {
    production: { en: 'in production', fr: 'en production' },
    wip: { en: 'in progress', fr: 'en cours' },
    archived: { en: 'archived', fr: 'archivé' },
  },
} satisfies Record<string, Localised | Record<string, Localised>>

/** Content strings are ours, but an `&` in a project description is still an `&`. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** What a URL looks like to a reader: no scheme noise, no percent-encoding. */
function readable(href: string): string {
  const bare = href.replace(/^mailto:/, '').replace(/^https:\/\//, '')
  try {
    return decodeURI(bare)
  } catch {
    return bare
  }
}

function link(href: string, text: string): string {
  return `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`
}

export function buildResumeHtml(locale: Locale): string {
  const t = <T>(value: Localised<T>): T => pick(value, locale)
  const other: Locale = locale === 'fr' ? 'en' : 'fr'
  const base = `https://${profile.domain}`
  const e = escapeHtml

  const projectItems = projects
    .map((project) => {
      const links = [
        project.repo ? link(project.repo, t(HTML_LABELS.source)) : '',
        project.live ? link(project.live, t(HTML_LABELS.live)) : '',
      ].filter(Boolean)
      return `      <li>
        <h3>${e(project.name)} <span class="status">${e(t(HTML_LABELS.status[project.status]))}</span></h3>
        <p>${e(t(project.description))}</p>
        <p class="meta">${e(project.stack.join(' · '))}${links.length ? ` — ${links.join(' · ')}` : ''}</p>
      </li>`
    })
    .join('\n')

  const socialItems = socials
    .map((social) => `      <li><span class="label">${e(social.label)}</span> ${link(social.href, readable(social.href))}</li>`)
    .join('\n')

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${e(profile.name)} — ${e(t(HTML_LABELS.title))}</title>
  <meta name="description" content="${e(`${profile.name} — ${t(profile.role)}, ${profile.employer}, ${profile.location}.`)}">
  <link rel="canonical" href="${base}/${resumeHtmlFile(locale)}">
  <link rel="alternate" hreflang="${locale}" href="${base}/${resumeHtmlFile(locale)}">
  <link rel="alternate" hreflang="${other}" href="${base}/${resumeHtmlFile(other)}">
  <link rel="stylesheet" href="/resume.css">
</head>
<body>
  <nav class="screen-only">
    <a href="/${resumeHtmlFile(other)}" hreflang="${other}" lang="${other}">${e(pick(HTML_LABELS.other, locale))}</a>
    · <a href="/">${e(t(HTML_LABELS.site))}</a>
    <p>${e(t(HTML_LABELS.print))}</p>
  </nav>
  <main>
    <header>
      <h1>${e(profile.name)} <span class="alias">(${e(profile.alias)})</span></h1>
      <p class="role">${e(t(profile.role))} · ${e(profile.employer)} · ${e(profile.location)}</p>
      <p class="contact">${link(`mailto:${profile.email}`, profile.email)} · ${link(base, profile.domain)}</p>
      <p class="availability${profile.availability.open ? ' open' : ''}">${e(t(profile.availability.note))}</p>
    </header>

    <section>
      <h2>${e(t(HTML_LABELS.about))}</h2>
${t(profile.bio).map((paragraph) => `      <p>${e(paragraph)}</p>`).join('\n')}
      <p><span class="label">${e(t(HTML_LABELS.languages))}</span> ${e(t(profile.languages))}</p>
    </section>

    <section>
      <h2>${e(t(HTML_LABELS.stack))}</h2>
      <p class="stack">${e(skillNames.join(' · '))}</p>
    </section>

    <section>
      <h2>${e(t(HTML_LABELS.projects))}</h2>
      <ul class="projects">
${projectItems}
      </ul>
    </section>

    <section>
      <h2>${e(t(HTML_LABELS.music))}</h2>
      <p>${e(music.genres.join(', '))} — ${link(music.playlistUrl, readable(music.playlistUrl))}</p>
    </section>

    <section>
      <h2>${e(t(HTML_LABELS.links))}</h2>
      <ul class="links">
${socialItems}
      </ul>
    </section>
  </main>
</body>
</html>
`
}

/**
 * Light on screen and on paper alike: it exists to be printed, and a dark page is the
 * one thing a print dialog renders badly. The printed links spell out their target,
 * since paper has no hover.
 */
export const RESUME_CSS = `:root {
  --ink: #111;
  --muted: #555;
  --rule: #ccc;
  --accent: #0a7a2a;
  color-scheme: light;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #fff;
  color: var(--ink);
  font: 15px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
main, nav { max-width: 46rem; margin: 0 auto; padding: 0 1.25rem; }
nav { padding-top: 1.25rem; font-size: 0.85rem; color: var(--muted); }
nav p { margin: 0.25rem 0 0; }
header { padding: 1.5rem 0 0.75rem; border-bottom: 2px solid var(--ink); }
h1 { margin: 0; font-size: 1.6rem; }
.alias { font-weight: normal; color: var(--muted); font-size: 1rem; }
h2 {
  margin: 1.5rem 0 0.5rem;
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 0.2rem;
}
h3 { margin: 0; font-size: 1rem; }
p { margin: 0.35rem 0; }
.role { font-weight: bold; }
.contact, .meta, .status, .label { color: var(--muted); }
.status { font-weight: normal; font-size: 0.8rem; }
.label { display: inline-block; min-width: 6.5rem; }
.availability.open { color: var(--accent); }
ul { list-style: none; margin: 0; padding: 0; }
.projects li { margin: 0 0 0.9rem; break-inside: avoid; }
a { color: inherit; }
@page { size: A4; margin: 16mm 18mm; }
@media print {
  body { font-size: 10.5pt; }
  .screen-only { display: none; }
  main { max-width: none; padding: 0; }
  header { padding-top: 0; }
  .availability.open { color: var(--ink); }
  a { text-decoration: none; }
  .projects a[href^="http"]::after { content: " (" attr(href) ")"; color: var(--muted); font-size: 0.85em; }
}
`

// ---------------------------------------------------------------------------
// content.json, for the MCP endpoint
// ---------------------------------------------------------------------------

/** A site path or section as an absolute URL: `projects` → `/#projects`, `tools/qr` → `/tools/qr`. */
function siteUrl(where: string): string {
  if (isExternal(where)) return where
  const base = `https://${profile.domain}`
  return sectionIds.includes(where) ? `${base}/#${where}` : `${base}/${where.replace(/^\/+/, '')}`
}

/**
 * The same content the pages render, as data, for the backend's read-only MCP endpoint
 * (`backend/src/mcp`). The backend fetches this from `FRONTEND_URL` rather than
 * importing it, so the two apps stay independently deployable, and the content still
 * has one source. Both languages go out; the tool asked picks one.
 *
 * `version` is the shape's, not the content's: the backend refuses a file whose
 * version it does not know rather than guessing at fields.
 */
export function buildContentJson(at = new Date()): string {
  return JSON.stringify({
    version: 1,
    generatedAt: at.toISOString(),
    site: `https://${profile.domain}`,
    profile: {
      name: profile.name,
      alias: profile.alias,
      role: profile.role,
      employer: profile.employer,
      location: profile.location,
      email: profile.email,
      languages: profile.languages,
      bio: profile.bio,
      availability: profile.availability,
    },
    skills: skills.map((skill) => ({
      name: skill.name,
      usedIn: (skill.usedIn ?? []).map((evidence) => ({ what: evidence.what, url: siteUrl(evidence.where) })),
    })),
    projects: projects.map((project) => ({
      name: project.name,
      description: project.description,
      stack: project.stack,
      status: project.status,
      ...(project.repo ? { repo: project.repo } : {}),
      ...(project.live ? { live: project.live } : {}),
    })),
    links: socials.map((social) => ({ label: social.label, href: social.href })),
    now: { updated: now.updated, staleDays: staleDays(now.updated, at), entries: now.entries },
  })
}

interface EmittedFile {
  fileName: string
  contentType: string
  build: () => string
}

const files: EmittedFile[] = [
  { fileName: 'resume.txt', contentType: 'text/plain; charset=utf-8', build: buildResume },
  { fileName: resumeHtmlFile('en'), contentType: 'text/html; charset=utf-8', build: () => buildResumeHtml('en') },
  { fileName: resumeHtmlFile('fr'), contentType: 'text/html; charset=utf-8', build: () => buildResumeHtml('fr') },
  { fileName: 'resume.css', contentType: 'text/css; charset=utf-8', build: () => RESUME_CSS },
  { fileName: 'content.json', contentType: 'application/json; charset=utf-8', build: () => buildContentJson() },
]

export function resumePlugin(): Plugin {
  return {
    name: 'couvbat-resume',
    generateBundle() {
      for (const file of files) {
        this.emitFile({ type: 'asset', fileName: file.fileName, source: file.build() })
      }
    },
    // The emitted assets only exist after a build; serve them in dev so
    // `curl localhost:5173/resume.txt` behaves the same as production.
    configureServer(server) {
      for (const file of files) {
        server.middlewares.use(`/${file.fileName}`, (_req, res) => {
          res.setHeader('Content-Type', file.contentType)
          res.end(file.build())
        })
      }
    },
  }
}
