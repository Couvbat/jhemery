import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { profile } from '../profile'
import { acknowledgments, buildSecurityTxt, EXPIRES_DAYS, POLICY_UPDATED, securityCopy } from '../security'

const AT = new Date('2026-10-14T09:30:00Z')
const DAY = 86_400_000

/** RFC 9116 §2.4: `Name: value` lines and `#` comments, nothing else. */
function fields(text: string): [string, string][] {
  return text
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const match = /^([A-Za-z-]+): (.+)$/.exec(line)
      expect(match, line).not.toBeNull()
      return [match![1]!, match![2]!]
    })
}

describe('security.txt', () => {
  const parsed = fields(buildSecurityTxt(AT))
  const all = (name: string) => parsed.filter(([field]) => field === name).map(([, value]) => value)

  it('has the two fields RFC 9116 requires, Expires exactly once', () => {
    expect(all('Contact')).toEqual([`mailto:${profile.email}`])
    expect(all('Expires')).toHaveLength(1)
  })

  // §2.5.5: "less than a year into the future", and an ISO 8601 instant.
  it('expires half a year after the build, well inside a year', () => {
    const expires = new Date(all('Expires')[0]!)
    expect(all('Expires')[0]).toBe(expires.toISOString())
    expect(expires.getTime() - AT.getTime()).toBe(EXPIRES_DAYS * DAY)
    expect(EXPIRES_DAYS).toBeLessThan(365)
  })

  it('names only fields the RFC defines, and points at the page', () => {
    const known = ['Acknowledgments', 'Canonical', 'Contact', 'Encryption', 'Expires', 'Hiring', 'Policy', 'Preferred-Languages']
    for (const [field] of parsed) expect(known).toContain(field)
    expect(all('Canonical')).toContain(`https://${profile.domain}/.well-known/security.txt`)
    expect(all('Policy')).toEqual([`https://${profile.domain}/security`])
    expect(all('Acknowledgments')).toEqual([`https://${profile.domain}/security#thanks`])
    expect(all('Preferred-Languages')).toEqual(['en, fr'])
  })

  // The deploy never uploads `.well-known/` (AutoSSL owns it), so the file's well-known
  // address exists only through this rule, ahead of the SPA fallback that would answer it
  // with index.html.
  it('is answered at the well-known path by .htaccess, ahead of the SPA fallback', () => {
    const htaccess = readFileSync(join(process.cwd(), 'public/.htaccess'), 'utf8')
    const rule = htaccess.indexOf('RewriteRule ^\\.well-known/security\\.txt$ /security.txt [L]')
    expect(rule).toBeGreaterThan(-1)
    expect(rule).toBeLessThan(htaccess.indexOf('RewriteRule ^ /index.html [L]'))
    const deploy = readFileSync(join(process.cwd(), '../.github/workflows/frontend-deploy.yml'), 'utf8')
    expect(deploy).toContain('--exclude=".well-known"')
  })
})

describe('the policy', () => {
  it('is dated, and in both languages throughout', () => {
    expect(POLICY_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const copy = Object.values(securityCopy).flatMap((value) => (Array.isArray(value) ? value : [value]))
    for (const text of copy) {
      expect(text.en).toBeTruthy()
      expect(text.fr).toBeTruthy()
      expect(text.fr).not.toBe(text.en)
    }
  })

  it('credits people with a date and a reason', () => {
    for (const entry of acknowledgments) {
      expect(entry.name).toBeTruthy()
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.what.fr).toBeTruthy()
      if (entry.url) expect(entry.url).toMatch(/^https:\/\//)
    }
  })
})
