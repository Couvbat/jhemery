import { LOGO } from './terminal/ascii'
import { profile } from './content'

/**
 * Anyone who opens DevTools on a developer's portfolio is exactly the audience
 * worth talking to, so say something to them.
 */
export function greet() {
  const neon = 'color:#00ff41;font-family:monospace'
  const muted = 'color:#7a8b7f;font-family:monospace'
  const accent = 'color:#00ffff;font-family:monospace'

  console.log(`%c${LOGO}`, neon)
  console.log(
    `%c${profile.name} — ${profile.role.en}%c\n${profile.domain}`,
    accent,
    muted,
  )
  console.log(
    '%cSince you are already in here: there is a terminal on this page.\n' +
      'Press ` or click the button in the corner. Try `ls -a`.',
    muted,
  )
  console.log(`%cHiring? ${profile.email}`, neon)
}
