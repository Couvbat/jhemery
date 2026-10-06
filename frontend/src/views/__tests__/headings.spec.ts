// @vitest-environment node
// Reads the templates off disk: there is no `@vue/test-utils` here to mount a view with.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Every view has one `<h1>`, and it takes `tabindex="-1"`: once a page change settles,
 * `usePageFocus` moves focus to it, and an `<h1>` that can't take focus would leave a
 * screen reader on a link of the page that just left. Some views keep theirs in a
 * component (home in the hero, the rooms in `RoomPage`), so a view's own template and
 * those of the components it imports are read together — one level is all any needs.
 * A view added later is held to it the day it lands.
 */

const SRC = fileURLToPath(new URL('../../', import.meta.url))
const VIEWS = join(SRC, 'views')

function template(path: string): string {
  return /<template>([\s\S]*)<\/template>/.exec(readFileSync(path, 'utf8'))?.[1] ?? ''
}

/** The `.vue` files a view imports, resolved from the `@/` alias or relative to it. */
function components(path: string): string[] {
  const source = readFileSync(path, 'utf8')
  return [...source.matchAll(/from\s+'([^']+\.vue)'/g)]
    .map(([, spec]) => (spec!.startsWith('@/') ? join(SRC, spec!.slice(2)) : join(VIEWS, spec!)))
    .filter((file) => existsSync(file))
}

const openingTags = (html: string, tag: string) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].map((m) => m[0])

const views = readdirSync(VIEWS).filter((name) => name.endsWith('.vue'))

describe('page headings', () => {
  it('finds the views', () => {
    expect(views).toEqual(expect.arrayContaining(['HomeView.vue', 'ToolsView.vue', 'NotFoundView.vue', 'WorkView.vue']))
  })

  it.each(views)('%s has exactly one <h1>, and it can take focus', (name) => {
    const file = join(VIEWS, name)
    const headings = [file, ...components(file)].flatMap((path) => openingTags(template(path), 'h1'))
    expect(headings, name).toHaveLength(1)
    expect(headings[0], name).toMatch(/\stabindex="-1"/)
  })

  // A hash from another page focuses the section's own heading, which is SectionHeader's.
  it('lets a section heading take focus too', () => {
    const [heading] = openingTags(template(join(SRC, 'components/SectionHeader.vue')), 'h2')
    expect(heading).toMatch(/\stabindex="-1"/)
  })
})
