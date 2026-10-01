/**
 * Where a link in the terminal's output goes. The site's own links stay in this tab:
 * a page of the app goes through the router and closes the terminal, as `cd` does; a
 * `?run=` link runs its command here, through the same check a link from outside gets;
 * a static document (`/resume.html`, the design notes) is a plain navigation, since the
 * router can't serve it. Anything else leaves the site, so it opens a new tab.
 */
export type LinkTarget =
  | { kind: 'external'; href: string }
  | { kind: 'run'; line: string }
  | { kind: 'route'; path: string }
  | { kind: 'document'; href: string }

export function linkTarget(href: string): LinkTarget {
  if (!href.startsWith('/') && !href.startsWith('?')) return { kind: 'external', href }
  const url = new URL(href, 'https://site.invalid')
  const run = url.searchParams.get('run')
  if (run) return { kind: 'run', line: run }
  if (/\.[a-z0-9]+$/i.test(url.pathname) || /^\/notes(\/|$)/.test(url.pathname)) {
    return { kind: 'document', href: `${url.pathname}${url.search}${url.hash}` }
  }
  return { kind: 'route', path: `${url.pathname}${url.search}${url.hash}` }
}
