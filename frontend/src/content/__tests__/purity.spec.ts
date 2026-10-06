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

/**
 * Every module specifier in an `import`/`export … from` statement. Nothing before the
 * `from` may be a quote: otherwise `export const decisions = [` runs on to the first
 * string that ends in "from" (`'Where the word lists come from'`) and reads the next
 * one as a specifier.
 */
function importSpecifiers(source: string): string[] {
  const pattern = /(?:^|\n)\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g
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

/**
 * The same constraint for the few modules outside `src/content` that the build imports:
 * the résumé plugin takes its palette from `terminal/ansi.ts`, which draws on
 * `lib/colour.ts`, and the curl pages are rendered with `terminal/format.ts`. Their
 * value imports are walked to the bottom; type imports vanish at build time and are free.
 */
describe('build-time modules outside content', () => {
  const src = fileURLToPath(new URL('../..', import.meta.url))
  const roots = ['terminal/ansi.ts', 'lib/colour.ts', 'terminal/format.ts']

  /** Value imports only: `import type …` and `export type …` are erased by the build. */
  function valueImports(source: string): string[] {
    const pattern = /(?:^|\n)\s*(import|export)\s+(?!type\b)[^'"]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g
    return [...source.matchAll(pattern)].map((match) => (match[2] ?? match[3])!)
  }

  function walk(file: string, seen = new Set<string>()): Set<string> {
    if (seen.has(file)) return seen
    seen.add(file)
    const source = readFileSync(join(src, file), 'utf8')
    for (const specifier of valueImports(source)) {
      expect(specifier.startsWith('./') || specifier.startsWith('../'), `${file} imports "${specifier}"`).toBe(true)
      walk(join(file, '..', `${specifier}.ts`).replace(/\.ts\.ts$/, '.ts'), seen)
    }
    return seen
  }

  it('follows the imports it finds', () => {
    expect([...walk('terminal/ansi.ts')]).toEqual(['terminal/ansi.ts', 'lib/colour.ts'])
  })

  it.each(roots)('%s reaches only relative, DOM-free modules', (root) => {
    for (const file of walk(root)) {
      const source = readFileSync(join(src, file), 'utf8')
      for (const forbidden of ['window.', 'document.', 'localStorage', 'navigator.', "from 'vue'"]) {
        expect(source.includes(forbidden), `${file} references ${forbidden}`).toBe(false)
      }
    }
  })
})
