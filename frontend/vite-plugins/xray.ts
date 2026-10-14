import { readdirSync, readFileSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { Plugin } from 'vite'
import { babelParse, parse as parseSfc, type CompilerOptions } from 'vue/compiler-sfc'
import { OUTER_ATTR, SRC_ATTR, type XrayMap } from '../src/lib/xray-stamp'

/**
 * X-ray mode's build side (roadmap §I, *X-ray mode*). Two jobs:
 *
 * - **The stamp.** A template transform, handed to `vue()` in `vite.config.ts`, writes the
 *   file's repo path on each root element of each component this repository wrote. It has
 *   to be written into the markup because a production build keeps a component's `__name`
 *   but not its `__file`, and only roots are stamped, so it costs a few dozen attributes.
 * - **The words.** Components import their copy from the `@/content` barrel, so an import
 *   only says "content". `virtual:xray-map` resolves each name a component imports against
 *   what the modules in `src/content/` export, and is its own chunk, fetched when x-ray
 *   turns on: first paint pays for the attributes and nothing else.
 */

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SRC = 'frontend/src/'
const CONTENT = 'frontend/src/content/'
const MESSAGES = 'frontend/src/i18n/messages.ts'
/**
 * The shadcn primitives (`Badge`, `Button`, `Card`…): generated, not written for this site,
 * and repeated everywhere, so thirty `Badge.vue` tags would bury the hero's own.
 */
const UNSTAMPED = 'frontend/src/components/ui/'
/** The shapes in `content/types.ts` and its two helpers (`pick`, `isExternal`): no words. */
const NO_WORDS = `${CONTENT}types.ts`

export const XRAY_MAP_ID = 'virtual:xray-map'
const RESOLVED_MAP_ID = `\0${XRAY_MAP_ID}`

/** The repo path a component is stamped with, or nothing for a file it doesn't stamp. */
export function repoPath(filename: string, root = REPO_ROOT): string | undefined {
  const path = relative(root, filename).split(sep).join('/')
  return path.startsWith(SRC) && !path.startsWith(UNSTAMPED) ? path : undefined
}

type NodeTransform = NonNullable<CompilerOptions['nodeTransforms']>[number]
type RootNode = Extract<Parameters<NodeTransform>[0], { hoists: unknown }>
type ChildNode = RootNode['children'][number]
type ElementNode = Extract<ChildNode, { tagType: unknown }>
type AttributeNode = Extract<ElementNode['props'][number], { nameLoc: unknown }>

// `NodeTypes` and `ElementTypes` from `@vue/compiler-core`, which `vue/compiler-sfc`
// doesn't re-export.
const ROOT = 0
const ELEMENT = 1
const TEXT = 2
const ATTRIBUTE = 6
const PLAIN_ELEMENT = 0
const COMPONENT = 1
const TEMPLATE = 3

/** Built-ins that render their children where they stand, so those children are the roots. */
const PASS_THROUGH = new Set(['Transition', 'transition', 'TransitionGroup', 'transition-group', 'KeepAlive', 'keep-alive', 'Teleport', 'teleport'])

function isElement(node: ChildNode): node is ElementNode {
  return node.type === ELEMENT
}

/** The roots under a `<template v-if>`, a `<Transition>` and their kind. */
function roots(children: ChildNode[]): ElementNode[] {
  return children.filter(isElement).flatMap((node) => (node.tagType === TEMPLATE || PASS_THROUGH.has(node.tag) ? roots(node.children) : [node]))
}

function stamp(node: ElementNode, name: string, path: string): void {
  // Idempotent: compiler-sfc re-parses an AST it has already transformed, but nothing
  // else promises to, and a template met twice must still carry one attribute.
  if (node.props.some((prop) => prop.type === ATTRIBUTE && prop.name === name)) return
  const attribute = {
    type: ATTRIBUTE,
    name,
    nameLoc: node.loc,
    value: { type: TEXT, content: path, loc: node.loc },
    loc: node.loc,
  } as AttributeNode
  node.props.push(attribute)
}

/**
 * Stamps `data-src` on every root element of a template this repository wrote, through
 * `<template v-if>` and the built-ins that render in place. A component root is stamped
 * `data-src-outer` instead (`lib/xray-stamp.ts` says why), and only when it is the only root:
 * attributes fall through to a lone root, and a multi-root template like `App.vue` would
 * otherwise claim the navbar it merely holds.
 */
export function stampSource(root = REPO_ROOT): NodeTransform {
  return (node, context) => {
    if (node.type !== ROOT || !context.filename) return
    const path = repoPath(context.filename, root)
    if (!path) return
    const found = roots((node as RootNode).children)
    for (const element of found) {
      if (element.tagType === PLAIN_ELEMENT) stamp(element, SRC_ATTR, path)
      else if (element.tagType === COMPONENT && found.length === 1) stamp(element, OUTER_ATTR, path)
    }
  }
}

function program(code: string) {
  return babelParse(code, { sourceType: 'module', plugins: ['typescript'] }).program
}

/** The names a module exports as values, and the modules it re-exports whole. */
function exportsOf(code: string): { names: string[]; all: string[] } {
  const names: string[] = []
  const all: string[] = []
  for (const statement of program(code).body) {
    if (statement.type === 'ExportAllDeclaration' && statement.exportKind !== 'type') all.push(statement.source.value)
    if (statement.type !== 'ExportNamedDeclaration' || statement.exportKind === 'type') continue
    const declaration = statement.declaration
    if (declaration?.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) if (declarator.id.type === 'Identifier') names.push(declarator.id.name)
    } else if (declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration' || declaration?.type === 'TSEnumDeclaration') {
      if (declaration.id) names.push(declaration.id.name)
    }
    for (const specifier of statement.specifiers) {
      if (specifier.type !== 'ExportSpecifier' || specifier.exportKind === 'type') continue
      names.push(specifier.exported.type === 'Identifier' ? specifier.exported.name : specifier.exported.value)
    }
  }
  return { names, all }
}

/**
 * What `@/content` re-exports, by name: the module each one comes from. A name two
 * modules export is one `export *` leaves out, so nobody can import it from there.
 */
function barrelOf(root: string): Map<string, string> {
  const dir = join(root, CONTENT)
  const barrel = new Map<string, string>()
  const twice = new Set<string>()
  for (const source of exportsOf(readFileSync(join(dir, 'index.ts'), 'utf8')).all) {
    const module = posix.join(CONTENT, `${source}.ts`)
    for (const name of exportsOf(readFileSync(join(root, module), 'utf8')).names) {
      if (barrel.has(name)) twice.add(name)
      barrel.set(name, module)
    }
  }
  for (const name of twice) barrel.delete(name)
  return barrel
}

/** An import's repo path, without its `.ts` or `/index`; nothing for a package. */
function importPath(source: string, from: string): string | undefined {
  const path = source.startsWith('@/')
    ? `${SRC}${source.slice(2)}`
    : source.startsWith('.')
      ? posix.join(posix.dirname(from), source)
      : undefined
  return path?.replace(/\.ts$/, '').replace(/\/index$/, '')
}

/** `@/content`, `@/content/work`, `../content`: `'barrel'`, a module's repo path, or nothing of ours. */
function contentTarget(bare: string): string | undefined {
  if (bare === CONTENT.slice(0, -1)) return 'barrel'
  return bare.startsWith(CONTENT) ? `${bare}.ts` : undefined
}

/**
 * The files a component's words come from: each content module it imports a value from,
 * resolved through the barrel, and `i18n/messages.ts` when it takes `m` from
 * `useLocale()` or imports `messages` itself (the toasts do), since the chrome strings
 * are words too.
 */
function wordsOf(sfc: string, path: string, barrel: Map<string, string>): string[] {
  const { descriptor } = parseSfc(sfc, { filename: path })
  const found = new Set<string>()
  let messages = false
  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (!block) continue
    for (const statement of program(block.content).body) {
      if (statement.type === 'ImportDeclaration' && statement.importKind !== 'type') {
        const bare = importPath(statement.source.value, path)
        if (!bare) continue
        const values = statement.specifiers.filter((specifier) => specifier.type !== 'ImportSpecifier' || specifier.importKind !== 'type')
        if (`${bare}.ts` === MESSAGES) messages ||= values.length > 0
        const target = contentTarget(bare)
        if (!target) continue
        for (const specifier of values) {
          if (target !== 'barrel') {
            found.add(target)
            continue
          }
          if (specifier.type !== 'ImportSpecifier') continue
          const name = specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value
          const module = barrel.get(name)
          if (module) found.add(module)
        }
      }
      if (statement.type !== 'VariableDeclaration') continue
      for (const declarator of statement.declarations) {
        const init = declarator.init
        if (init?.type !== 'CallExpression' || init.callee.type !== 'Identifier' || init.callee.name !== 'useLocale') continue
        if (declarator.id.type !== 'ObjectPattern') continue
        messages ||= declarator.id.properties.some(
          (property) => property.type === 'ObjectProperty' && property.key.type === 'Identifier' && property.key.name === 'm',
        )
      }
    }
  }
  const words = [...found].filter((file) => file !== NO_WORDS).sort()
  return messages ? [...words, MESSAGES] : words
}

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : vueFiles(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

/** Every stamped component that has words, by repo path. */
export function buildXrayMap(root = REPO_ROOT): XrayMap {
  const barrel = barrelOf(root)
  const map: XrayMap = {}
  for (const file of vueFiles(join(root, SRC))) {
    const path = repoPath(file, root)
    if (!path) continue
    const words = wordsOf(readFileSync(file, 'utf8'), path, barrel)
    if (words.length) map[path] = words
  }
  return map
}

export function xrayPlugin(): Plugin {
  return {
    name: 'couvbat-xray',
    resolveId(id) {
      return id === XRAY_MAP_ID ? RESOLVED_MAP_ID : undefined
    },
    load(id) {
      return id === RESOLVED_MAP_ID ? `export default ${JSON.stringify(buildXrayMap())}` : undefined
    },
    // The dev server keeps a module once built; an edited component or content module
    // means the map is rebuilt on the next load.
    hotUpdate({ file }) {
      const path = relative(REPO_ROOT, file).split(sep).join('/')
      if (!path.endsWith('.vue') && !path.startsWith(CONTENT)) return
      const map = this.environment.moduleGraph.getModuleById(RESOLVED_MAP_ID)
      if (map) this.environment.moduleGraph.invalidateModule(map)
    },
  }
}
