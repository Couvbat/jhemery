// @vitest-environment node
// The plugin runs at build time, in Node, and reads the components off disk; under jsdom
// `import.meta.url` is an http: URL and can't be turned back into a path.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { compile, createSSRApp, defineComponent, h, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import { describe, expect, it } from 'vitest'
import { buildXrayMap, repoPath, stampSource } from '../../vite-plugins/xray'
import { CANVAS_FILE } from '@/lib/xray'
import { OUTER_ATTR, SRC_ATTR } from '@/lib/xray-stamp'

/**
 * X-ray mode's build side (`vite-plugins/xray.ts`). The transform is run the two ways
 * the code meets it: through `compileTemplate`, as `@vitejs/plugin-vue` calls it, and
 * rendered, since what reaches the page is the attribute after Vue has passed a
 * component's attributes down to its root.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const SRC = join(REPO, 'frontend/src')
const at = (path: string) => join(REPO, path)

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : vueFiles(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

/** Compiled as `@vitejs/plugin-vue` compiles a `<template>` block, with the stamp. */
function compiled(source: string, path: string): string {
  const result = compileTemplate({
    source,
    filename: at(path),
    id: 'x',
    compilerOptions: { nodeTransforms: [stampSource()], expressionPlugins: ['typescript'] },
  })
  expect(result.errors, path).toEqual([])
  return result.code
}

/** Every path a compiled template stamps, under either attribute. */
function stamped(code: string): string[] {
  return [...code.matchAll(/data-src(?:-outer)?(?:"\s*:\s*"|=\\")([^"\\]+)/g)].map((match) => match[1]!)
}

/** A component compiled at runtime with the stamp, as if it lived at `path`. */
function component(path: string, template: string, components: Record<string, Component> = {}): Component {
  return defineComponent({ components, render: compile(template, { filename: at(path), nodeTransforms: [stampSource()] }) })
}

async function html(root: Component): Promise<string> {
  return renderToString(createSSRApp({ render: () => h(root) }))
}

describe('the stamp', () => {
  it('puts the file’s repo path on the root element', () => {
    const code = compiled('<section class="hero"><p>hi</p></section>', 'frontend/src/components/Fixture.vue')
    expect(code).toContain(`"${SRC_ATTR}": "frontend/src/components/Fixture.vue"`)
    expect(stamped(code)).toEqual(['frontend/src/components/Fixture.vue'])
  })

  it('stamps every root, through `v-if` templates and `<Transition>`, and nothing below them', async () => {
    const Fixture = component(
      'frontend/src/components/Fixture.vue',
      '<p>one</p><template v-if="true"><p>two<span>in</span></p></template><Transition><p>three</p></Transition>',
    )
    const out = await html(Fixture)
    expect(out.match(/data-src="frontend\/src\/components\/Fixture.vue"/g)).toHaveLength(3)
    expect(out).toContain('<span>in</span>')
  })

  // `HashTool.vue` is one `<ToolFrame>`: the frame's root carries both names, the outer
  // under its own attribute, which falling through would otherwise overwrite.
  it('keeps both names when a component’s root is another component', async () => {
    const Inner = component('frontend/src/tools/ToolFrame.vue', '<div class="frame"><slot /></div>')
    const Outer = component('frontend/src/tools/hash/HashTool.vue', '<ToolFrame>hash</ToolFrame>', { ToolFrame: Inner })
    const out = await html(Outer)
    expect(out).toContain(`${SRC_ATTR}="frontend/src/tools/ToolFrame.vue"`)
    expect(out).toContain(`${OUTER_ATTR}="frontend/src/tools/hash/HashTool.vue"`)
  })

  // `App.vue` holds the navbar among a dozen roots; it isn't the navbar's outer file.
  it('leaves a component alone when it is one of several roots', async () => {
    const Nav = component('frontend/src/components/NavBar.vue', '<header>nav</header>')
    const App = component('frontend/src/App.vue', '<a href="#content">skip</a><NavBar />', { NavBar: Nav })
    const out = await html(App)
    expect(out).toContain(`<a href="#content" ${SRC_ATTR}="frontend/src/App.vue">`)
    expect(out).toContain(`<header ${SRC_ATTR}="frontend/src/components/NavBar.vue">`)
    expect(out).not.toContain(OUTER_ATTR)
  })

  it('stamps once when the same template is transformed twice', () => {
    const ast = parse('<template><div /></template>', { filename: at('frontend/src/components/Twice.vue') }).descriptor.template!.ast!
    const transform = stampSource()
    const context = { filename: at('frontend/src/components/Twice.vue') } as Parameters<typeof transform>[1]
    transform(ast as Parameters<typeof transform>[0], context)
    transform(ast as Parameters<typeof transform>[0], context)
    const element = ast.children[0] as { props: Array<{ name: string }> }
    expect(element.props.filter((prop) => prop.name === SRC_ATTR)).toHaveLength(1)
  })

  it('stamps only this repository’s own components, and not the shadcn primitives', () => {
    expect(repoPath(at('frontend/src/components/NavBar.vue'))).toBe('frontend/src/components/NavBar.vue')
    expect(repoPath(at('frontend/src/components/ui/badge/Badge.vue'))).toBeUndefined()
    expect(repoPath(at('frontend/node_modules/some-lib/Thing.vue'))).toBeUndefined()
    expect(stamped(compiled('<div />', 'frontend/src/components/ui/card/Card.vue'))).toEqual([])
  })

  // The whole point of a path is that it leads somewhere: a link to a file that isn't
  // there would be a 404 on GitHub, at the build's own commit.
  it.each(vueFiles(SRC).map((file) => [relative(REPO, file).split(sep).join('/'), file] as const))(
    '%s is stamped with a path that exists',
    (path, file) => {
      const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file })
      const paths = stamped(compiled(descriptor.template!.content, path))
      if (path.startsWith('frontend/src/components/ui/')) {
        expect(paths).toEqual([])
        return
      }
      expect(paths.length, 'no root was stamped').toBeGreaterThan(0)
      for (const stampedPath of paths) {
        expect(stampedPath).toBe(path)
        expect(existsSync(at(stampedPath)), stampedPath).toBe(true)
      }
    },
  )
})

describe('the words map', () => {
  const map = buildXrayMap()

  it('resolves the barrel’s names to the modules that export them', () => {
    expect(map['frontend/src/components/sections/HeroSection.vue']).toEqual([
      'frontend/src/content/profile.ts',
      'frontend/src/content/skills.ts',
      'frontend/src/i18n/messages.ts',
    ])
    expect(map['frontend/src/components/sections/HardwareSection.vue']).toContain('frontend/src/content/hardware.ts')
    expect(map['frontend/src/views/WorkView.vue']).toEqual(
      expect.arrayContaining(['frontend/src/content/decisions.ts', 'frontend/src/content/work.ts']),
    )
  })

  // `isExternal` comes from `types.ts`, and `type Localised` is erased: neither is words.
  it('leaves out the types and their helpers, and type-only imports', () => {
    for (const words of Object.values(map)) {
      expect(words).not.toContain('frontend/src/content/types.ts')
      expect(words).not.toContain('frontend/src/content/search.ts')
    }
  })

  it('names the chrome strings when a component reads `m` or imports `messages`, and only then', () => {
    expect(map['frontend/src/components/SiteFooter.vue']).toContain('frontend/src/i18n/messages.ts')
    // The toasts and the achievements modal take `messages` itself and only `t` from `useLocale()`.
    for (const toast of ['AchievementToast', 'AchievementsModal', 'GuestbookTicker']) {
      expect(map[`frontend/src/components/${toast}.vue`], toast).toEqual(['frontend/src/i18n/messages.ts'])
    }
    // `SectionHeader` takes only `t`: its words are the section's.
    expect(map['frontend/src/components/SectionHeader.vue']).toEqual([
      'frontend/src/content/profile.ts',
      'frontend/src/content/sections.ts',
    ])
  })

  it('lists only components and files that exist', () => {
    expect(Object.keys(map).length).toBeGreaterThan(20)
    for (const [component, words] of Object.entries(map)) {
      expect(existsSync(at(component)), component).toBe(true)
      for (const file of words) expect(existsSync(at(file)), file).toBe(true)
    }
  })

  // The layer finds the canvas's tag by this path, to add the shape count.
  it('knows where the canvas is', () => {
    expect(existsSync(at(CANVAS_FILE))).toBe(true)
    expect(map[CANVAS_FILE]).toContain('frontend/src/content/seasons.ts')
  })
})
