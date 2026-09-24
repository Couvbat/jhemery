import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { API_PREFIX, BASE_URL } from '../constants'

/**
 * The production Content-Security-Policy, read out of public/.htaccess.
 *
 * That header is Apache's, and `vite preview` applies none of the file, so a policy
 * that blocks something the app needs is invisible to the rest of the suite and only
 * shows up on jhemery.xyz. Reading it from the file rather than copying it here means
 * the test and the deploy cannot drift.
 */
export const PRODUCTION_CSP = /Content-Security-Policy "([^"]+)"/.exec(
  readFileSync(new URL('../../public/.htaccess', import.meta.url), 'utf8'),
)?.[1]

/**
 * Stamps that policy onto every same-origin response — documents, chunks and the
 * worker script alike, since a worker's policy comes from its own response — and
 * returns the list of what it refused, as `<path>: <directive> <blocked>`.
 *
 * Refusals are collected from `securitypolicyviolation` rather than the console: the
 * event is the same in every engine, while the console wording is Chromium's own. A
 * blocked `<img>` throws nothing, so `pageErrors` never sees one; this list is the
 * only place it surfaces.
 *
 * The wasm core passes through untouched: a policy means nothing on it, and
 * `route.fetch()` would buffer all 32 MB before handing any of it over.
 */
export async function enforceProductionCsp(page: Page): Promise<string[]> {
  if (!PRODUCTION_CSP) throw new Error('public/.htaccess should still carry a Content-Security-Policy')
  const origin = new URL(BASE_URL).origin
  await page.route(
    (url) =>
      url.origin === origin && !url.pathname.endsWith('.wasm') && !url.pathname.startsWith(API_PREFIX),
    async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'content-security-policy': PRODUCTION_CSP },
      })
    },
  )

  const violations: string[] = []
  await page.exposeFunction('__e2eCspViolation', (entry: string) => violations.push(entry))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { __e2eCspViolation: (entry: string) => void })
        .__e2eCspViolation
      report(`${location.pathname}: ${event.effectiveDirective} ${event.blockedURI}`)
    })
  })
  return violations
}
