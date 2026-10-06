import { execSync } from 'node:child_process'

/**
 * Short commit SHA of the build, for the footer and for links into the source. Falls
 * back to `dev` outside a git checkout. Here rather than in `vite.config.ts` so the
 * plugins that pin links to it read the same value.
 */
export function commitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'dev'
  }
}

/** The ref a source link pins to: the commit, or `master` when there is none. */
export function sourceRef(sha: string): string {
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha : 'master'
}
