import type { DocRef } from '@/content/types'

/**
 * Links into the repository, pinned to the commit this build came from rather than
 * `tree/master`, so a link keeps pointing at the code the visitor is looking at after
 * the files move. Not in `content/`: it reads a build-time global.
 */

export const REPO = 'https://github.com/Couvbat/jhemery'

/**
 * The build's commit, or `master` when there is none: `__BUILD_SHA__` is `'dev'`
 * outside a checkout and in the unit tests, and a file committed to the repo can't
 * know its own commit.
 */
export function sourceRef(sha: string = __BUILD_SHA__): string {
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha : 'master'
}

export function sourceUrl(path: string, sha?: string): string {
  return `${REPO}/blob/${sourceRef(sha)}/${path.replace(/^\/+/, '')}`
}

/** A heading in a design doc, on GitHub at the build's commit. */
export function docUrl(ref: DocRef, sha?: string): string {
  return `${sourceUrl(ref.doc, sha)}${ref.anchor ? `#${ref.anchor}` : ''}`
}
