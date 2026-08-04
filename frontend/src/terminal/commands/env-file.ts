import type { Localised } from '@/content/types'
import { blank, line, pre } from '../format'
import type { OutputLine, Tone } from '../types'

export const ENV_FILE = '.env'

interface EnvVar {
  key: string
  value: string
  tone?: Tone
}

/**
 * The joke environment — one source of truth behind both `cat .env` and the `env`
 * command, so the file and the listing can never drift apart.
 *
 * Every value here is deliberate nonsense. Nothing in this list is, or ever was,
 * a real credential; the gag only works because they look like ones.
 */
export const fakeEnv: readonly EnvVar[] = [
  { key: 'NODE_ENV', value: 'production' },
  { key: 'PORT', value: '3000' },
  { key: 'DATABASE_URL', value: 'postgres://root:hunter2@localhost:5432/prod' },
  { key: 'JWT_SECRET', value: 'trust-me-bro' },
  { key: 'STRIPE_SECRET_KEY', value: 'sk_live_definitely_not_real' },
  { key: 'AWS_ACCESS_KEY_ID', value: 'AKIA_NICE_TRY' },
  { key: 'ADMIN_PASSWORD', value: 'correcthorsebatterystaple' },
  { key: 'DEPLOY_STRATEGY', value: 'push-to-main-and-pray' },
  { key: 'COFFEE_LEVEL', value: 'critical', tone: 'accent' },
]

/** `KEY=value` rows. `pre` so a long value can't reflow the ones around it. */
export function envAssignments(prefix = ''): OutputLine[] {
  return fakeEnv.map((v) => pre(`${prefix}${v.key}=${v.value}`, v.tone))
}

/** What `cat .env` and `vim .env` show. Values stay unlocalised — they're fake
 *  tech strings, same reasoning as the hardware specs; only the joke is bilingual. */
export function envFileContents(t: <T>(value: Localised<T>) => T): OutputLine[] {
  return [
    line(`# ${ENV_FILE}`, 'muted'),
    ...envAssignments(),
    blank,
    line(t({ en: '# nice try.', fr: '# sympa d’avoir essayé.' }), 'muted'),
  ]
}
