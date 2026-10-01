import { profile } from '@/content'

/**
 * The parts of `curl` that don't touch the network: its flags, which hosts count as this
 * site, and whether a body is fit to print. The request itself is `fetchSite()`, and the
 * command is in `commands/content.ts`.
 */

/** The site's own plain files, offered for Tab and the only paths a `?run=` link may name. */
export const SITE_FILES = ['/resume.txt', '/llms.txt', '/content.json', '/robots.txt', '/sitemap.xml'] as const

/** About a screenful and a half of scrollback; more and the terminal is the wrong reader. */
export const MAX_LINES = 400

export type CurlArgs = { ok: true; head: boolean; targets: string[] } | { ok: false; lines: string[] }

/** curl's own flags, the three that mean anything here. `-s` and `-L` are accepted and ignored. */
export function parseCurlArgs(args: readonly string[]): CurlArgs {
  let head = false
  const targets: string[] = []
  const unknown = (option: string): CurlArgs => ({
    ok: false,
    lines: [`curl: option ${option}: is unknown`, "curl: try 'curl --help' or 'curl --manual' for more information"],
  })

  for (const arg of args) {
    if (arg === '--head') head = true
    else if (arg === '--silent' || arg === '--location') continue
    else if (arg.startsWith('--')) return unknown(arg)
    else if (/^-[A-Za-z]+$/.test(arg)) {
      for (const flag of arg.slice(1)) {
        if (flag === 'I') head = true
        else if (flag !== 's' && flag !== 'L') return unknown(`-${flag}`)
      }
    } else targets.push(arg)
  }
  // Bare `curl` is `curl jhemery.xyz` here: there is only one host to mean.
  return { ok: true, head, targets: targets.length ? targets : [''] }
}

export type CurlTarget = { path: string } | { unresolved: string }

/**
 * A target as a path on this origin, or the host curl couldn't resolve. This site, under
 * any name it answers to (its domain, localhost, the host the tab is on), with or without
 * a scheme and a path; a bare `/path` too. The bare host is `/resume.txt` rather than `/`,
 * which the service worker would answer with the app's own `index.html`.
 */
export function resolveTarget(target: string, here: string = typeof location === 'undefined' ? '' : location.host): CurlTarget {
  const stripped = target.trim().replace(/^https?:\/\//i, '')
  let path = stripped
  if (!stripped.startsWith('/')) {
    const slash = stripped.indexOf('/')
    const host = (slash < 0 ? stripped : stripped.slice(0, slash)).toLowerCase().replace(/\.$/, '')
    path = slash < 0 ? '' : stripped.slice(slash)
    const ours =
      host === '' ||
      host === profile.domain ||
      host === `www.${profile.domain}` ||
      /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ||
      (here !== '' && host === here.toLowerCase())
    if (!ours) return { unresolved: host.replace(/:\d+$/, '') }
  }
  path = path.replace(/#.*$/, '')
  return { path: path === '' || path === '/' ? '/resume.txt' : path }
}

/** Text a terminal can show: a textual type (or none) and no NUL byte, as curl itself checks. */
export function isPrintable(type: string, body: Uint8Array): boolean {
  const kind = type.toLowerCase().split(';')[0]!.trim()
  const textual = kind === '' || kind.startsWith('text/') || /[+/](json|xml|javascript)$/.test(kind)
  return textual && !body.includes(0)
}
