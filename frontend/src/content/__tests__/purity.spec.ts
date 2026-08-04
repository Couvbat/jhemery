// @vitest-environment node
// This one reads source files off disk rather than importing them; under jsdom
// `import.meta.url` is an http: URL and can't be turned back into a path.
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the hard constraint from features-spec §1: everything under `src/content`
 * stays dependency-free.
 *
 * `vite.config.ts` and `vite-plugins/resume.ts` import these modules at build time,
 * outside the app's module graph — so there is no Vue runtime, no `@` alias, and no
 * DOM. Adding `import { ref } from 'vue'` to one of these files breaks `npm run
 * build` rather than anything you'd notice while developing, and the error it
 * produces points at the résumé plugin instead of the file that caused it.
 */

const contentDir = fileURLToPath(new URL('..', import.meta.url))

const files = readdirSync(contentDir)
  .filter((name) => name.endsWith('.ts'))
  .sort()

/** Every module specifier in an `import`/`export … from` statement. */
function importSpecifiers(source: string): string[] {
  const pattern = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g
  return [...source.matchAll(pattern)].map((match) => match[1]!)
}

describe('content layer purity', () => {
  it('finds the content modules', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(files)('%s imports nothing outside the content folder', (file) => {
    const source = readFileSync(join(contentDir, file), 'utf8')

    for (const specifier of importSpecifiers(source)) {
      expect(
        specifier.startsWith('./'),
        `${file} imports "${specifier}" — content modules may only import their siblings`,
      ).toBe(true)
    }
  })

  it.each(files)('%s does not reach for the DOM or Vue reactivity', (file) => {
    const source = readFileSync(join(contentDir, file), 'utf8')

    // These would throw at build time, where there is no browser and no app runtime.
    for (const forbidden of ['window.', 'document.', 'localStorage', 'navigator.']) {
      expect(source.includes(forbidden), `${file} references ${forbidden}`).toBe(false)
    }
  })
})
